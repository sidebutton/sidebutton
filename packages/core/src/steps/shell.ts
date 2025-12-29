/**
 * Shell and terminal step executors
 * Implements: shell.run, terminal.open, terminal.run
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';

const execAsync = promisify(exec);

type ShellRun = Extract<Step, { type: 'shell.run' }>;
type TerminalOpen = Extract<Step, { type: 'terminal.open' }>;
type TerminalRun = Extract<Step, { type: 'terminal.run' }>;

export async function executeShellRun(
  step: ShellRun,
  ctx: ExecutionContext
): Promise<void> {
  const cmd = ctx.interpolate(step.cmd);
  const cwd = step.cwd ? ctx.interpolate(step.cwd) : undefined;

  ctx.emitLog('info', `Running: ${cmd}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      shell: '/bin/sh',
    });

    if (step.as) {
      ctx.variables[step.as] = stdout.trim();
    }

    if (stderr) {
      ctx.emitLog('warn', `stderr: ${stderr.trim()}`);
    }
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new WorkflowError(
      `Command failed: ${err.stderr || err.message}`,
      'SHELL_ERROR'
    );
  }
}

export async function executeTerminalOpen(
  step: TerminalOpen,
  ctx: ExecutionContext
): Promise<void> {
  const title = step.title ? ctx.interpolate(step.title) : undefined;
  const cwd = step.cwd ? ctx.interpolate(step.cwd) : undefined;

  ctx.emitLog(
    'info',
    `Opening terminal${title ? ` '${title}'` : ''}${cwd ? ` in ${cwd}` : ''}`
  );

  // Open terminal using AppleScript (macOS)
  // For cross-platform, this would need platform detection
  const script = buildTerminalScript(title, cwd);

  try {
    await execAsync(`osascript -e '${script}'`);
    ctx.terminalActive = true;

    // Small delay for terminal to open
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    throw new WorkflowError(
      `Failed to open terminal: ${error}`,
      'TERMINAL_ERROR'
    );
  }
}

export async function executeTerminalRun(
  step: TerminalRun,
  ctx: ExecutionContext
): Promise<void> {
  if (!ctx.terminalActive) {
    throw new WorkflowError(
      'No terminal session - use terminal.open first',
      'TERMINAL_ERROR'
    );
  }

  const cmd = ctx.interpolate(step.cmd);
  ctx.emitLog('info', `Running in terminal: ${cmd}`);

  // Type command in active terminal using AppleScript
  // Escape both single and double quotes for shell + AppleScript
  const escapedCmd = cmd.replace(/'/g, "'\"'\"'").replace(/"/g, '\\"');
  const script = `tell application "Terminal" to do script "${escapedCmd}" in front window`;

  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);

    // Small delay between commands
    await new Promise((resolve) => setTimeout(resolve, 300));
  } catch (error) {
    throw new WorkflowError(
      `Failed to run in terminal: ${error}`,
      'TERMINAL_ERROR'
    );
  }
}

function buildTerminalScript(title?: string, cwd?: string): string {
  const parts = ['tell application "Terminal"'];

  if (cwd) {
    parts.push(`do script "cd ${cwd.replace(/"/g, '\\"')}"`);
  } else {
    parts.push('do script ""');
  }

  parts.push('activate');

  if (title) {
    parts.push(
      `set custom title of front window to "${title.replace(/"/g, '\\"')}"`
    );
  }

  parts.push('end tell');
  return parts.join('\n');
}
