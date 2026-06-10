/**
 * Shell and terminal step executors
 * Implements: shell.run, terminal.open, terminal.run
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, homedir, tmpdir } from 'node:os';
import { writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Step } from '../types.js';
import type { ExecutionContext } from '../context.js';
import { WorkflowError } from '../types.js';

const execAsync = promisify(exec);
const IS_MAC = platform() === 'darwin';

function expandHome(p: string | undefined): string | undefined {
  if (!p) return p;
  if (p.startsWith('~/')) return homedir() + p.slice(1);
  if (p === '~') return homedir();
  return p;
}

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

  // Validate cwd exists before proceeding
  const resolvedCwd = expandHome(cwd);
  if (resolvedCwd && !existsSync(resolvedCwd)) {
    throw new WorkflowError(
      `Terminal cwd does not exist: ${resolvedCwd}`,
      'TERMINAL_ERROR'
    );
  }

  if (IS_MAC) {
    const script = buildTerminalScript(title, cwd);
    try {
      await execAsync(`osascript -e '${script}'`);
      ctx.terminalActive = true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      throw new WorkflowError(
        `Failed to open terminal: ${error}`,
        'TERMINAL_ERROR'
      );
    }
  } else {
    // Linux: defer terminal spawn to terminal.run so only ONE window opens
    ctx.terminalCwd = resolvedCwd;
    ctx.terminalActive = true;
    ctx.terminalTitle = title;
    ctx.emitLog('info', 'Terminal session prepared (opens on first command)');
  }
}

/**
 * Inject dispatch-scoped flags into a Claude CLI command. Exported for unit
 * tests. Each rewrite targets the FIRST `claude ` occurrence — later mentions
 * belong to the prompt text.
 *
 * `--session-id` (PID-TRACKING plan) pre-assigns the Claude Code session
 * UUID, making the job ↔ session binding deterministic: the orchestrator
 * locates the session by this UUID in the process command line, and the
 * Stop/PostToolUse hooks' native session_id matches the job's record exactly.
 * Strict UUID validation keeps the interpolation shell-safe.
 */
export function injectClaudeCliFlags(
  cmd: string,
  opts: { effortLevel?: string; modelOverride?: string; sessionId?: string },
): string {
  if (!cmd.includes('claude ')) return cmd;
  if (opts.effortLevel && opts.effortLevel !== 'medium') {
    cmd = cmd.replace('claude ', `claude --effort ${opts.effortLevel} `);
  }
  if (opts.modelOverride) {
    cmd = cmd.replace('claude ', `claude --model ${opts.modelOverride} `);
  }
  if (opts.sessionId
      && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(opts.sessionId)) {
    cmd = cmd.replace('claude ', `claude --session-id ${opts.sessionId} `);
  }
  return cmd;
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

  // Inject --effort, --model, and --session-id flags into Claude CLI commands.
  const cmd = injectClaudeCliFlags(ctx.interpolate(step.cmd), {
    effortLevel: ctx.effortLevel,
    modelOverride: ctx.llmModelOverride,
    sessionId: ctx.claudeSessionId,
  });


  ctx.emitLog('info', `Running in terminal: ${cmd}`);

  if (IS_MAC) {
    const escapedCmd = cmd.replace(/'/g, "'\"'\"'").replace(/"/g, '\\"');
    const script = `tell application "Terminal" to do script "${escapedCmd}" in front window`;
    try {
      await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      throw new WorkflowError(
        `Failed to run in terminal: ${error}`,
        'TERMINAL_ERROR'
      );
    }
  } else {
    // Linux: write command to temp script, launch in GUI terminal or tmux fallback
    const resolvedCwd = ctx.terminalCwd || homedir();

    try {
      const scriptPath = join(tmpdir(), `sb-terminal-${Date.now()}.sh`);
      writeFileSync(scriptPath, `#!/bin/bash\ncd "${resolvedCwd}" || exit 1\n${cmd}\n`);
      chmodSync(scriptPath, 0o755);

      const hasX = await probeX11Display();

      if (hasX) {
        // GUI path: xfce4-terminal with X display
        const display = process.env.DISPLAY || ':10';
        const titleArg = ctx.terminalTitle
          ? ` --title="${ctx.terminalTitle.replace(/"/g, '\\"')}"`
          : '';
        // --disable-server prevents xfce4-terminal from delegating to an
        // existing instance and returning immediately
        const termCmd = `DISPLAY=${display} xfce4-terminal --disable-server${titleArg} -e "${scriptPath}"`;

        const child = spawn('sh', ['-c', termCmd], { stdio: 'ignore', detached: true });
        child.unref();
      } else {
        // Headless fallback: tmux session
        const sessionName = `sb-${Date.now()}`;
        const child = spawn('tmux', ['new-session', '-d', '-s', sessionName, scriptPath], {
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        ctx.emitLog('info', `Launched in tmux session "${sessionName}" (headless)`);
      }
    } catch (error) {
      if (error instanceof WorkflowError) throw error;
      throw new WorkflowError(
        `Failed to run in terminal: ${error}`,
        'TERMINAL_ERROR'
      );
    }
  }
}

/** Check if X11 display is available (returns false on headless / no DISPLAY). */
async function probeX11Display(): Promise<boolean> {
  const display = process.env.DISPLAY;
  if (!display) return false;
  try {
    await execAsync(`DISPLAY=${display} xdpyinfo >/dev/null 2>&1`, { timeout: 3000 });
    return true;
  } catch {
    return false;
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
