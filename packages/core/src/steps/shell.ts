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

/**
 * Strict Claude Code session UUID (v4-shaped). Guards every interpolation of a
 * session id into a shell command or tmux target name, keeping it injection-safe.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
  if (opts.sessionId && UUID_RE.test(opts.sessionId)) {
    cmd = cmd.replace('claude ', `claude --session-id ${opts.sessionId} `);
  }
  return cmd;
}

/**
 * tmux session name a dispatched Claude runs under. Keyed by the `--session-id`
 * UUID the portal pre-assigns (`ctx.claudeSessionId`) so the server's
 * `POST /api/session/input` can resolve `sbjob-<session_id>` and inject a native
 * user turn (SCRUM-1384). Falls back to a timestamp suffix for manual/operator
 * runs that carry no portal-assigned id — those are never targeted by the
 * endpoint. The UUID guard keeps the name shell/tmux-target-safe.
 */
export function tmuxJobSessionName(
  sessionId: string | undefined,
  fallbackSuffix: string | number,
): string {
  const keyed = sessionId && UUID_RE.test(sessionId);
  return `sbjob-${keyed ? sessionId : fallbackSuffix}`;
}

/** Spawn descriptor (executable + argv) for launching a terminal-run command. */
export interface TerminalLaunch {
  /** tmux session name (`sbjob-<id>`) the input endpoint resolves. */
  sessionName: string;
  /** executable to spawn (no intermediate shell). */
  file: string;
  /** argv passed to the executable. */
  args: string[];
}

/**
 * Build the spawn descriptor that runs `scriptPath` inside a tmux session named
 * `sessionName`. With an X display, xfce4-terminal renders the tmux pane so the
 * live desktop / noVNC operator can still type into it; headless creates a
 * detached tmux session. Either way Claude runs under tmux, which is what lets
 * `POST /api/session/input` paste a native turn into the live session.
 *
 * argv is spawned directly (no shell), so `scriptPath` and `title` are never
 * shell-interpolated. `-x` makes xfce4-terminal exec the remaining argv as the
 * command (robust quoting vs the literal `-e "<string>"`); `--disable-server`
 * stops it delegating to an existing instance and returning immediately.
 */
export function buildTerminalLaunch(opts: {
  hasX: boolean;
  sessionName: string;
  scriptPath: string;
  title?: string;
}): TerminalLaunch {
  const { hasX, sessionName, scriptPath, title } = opts;
  if (hasX) {
    const titleArg = title ? [`--title=${title}`] : [];
    return {
      sessionName,
      file: 'xfce4-terminal',
      args: ['--disable-server', ...titleArg, '-x', 'tmux', 'new-session', '-A', '-s', sessionName, scriptPath],
    };
  }
  return {
    sessionName,
    file: 'tmux',
    args: ['new-session', '-d', '-s', sessionName, scriptPath],
  };
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
    // Linux: write command to a temp script, then launch it inside a tmux
    // session named sbjob-<session_id>. Under X, xfce4-terminal renders the
    // tmux pane (live desktop / noVNC operator typing unchanged); headless
    // creates it detached. Running under tmux is what lets the server's
    // POST /api/session/input paste a native user turn into the live session
    // (SCRUM-1384). Detached + unref keeps the launcher non-blocking.
    const resolvedCwd = ctx.terminalCwd || homedir();

    try {
      const scriptPath = join(tmpdir(), `sb-terminal-${Date.now()}.sh`);
      writeFileSync(scriptPath, `#!/bin/bash\ncd "${resolvedCwd}" || exit 1\n${cmd}\n`);
      chmodSync(scriptPath, 0o755);

      const hasX = await probeX11Display();
      const launch = buildTerminalLaunch({
        hasX,
        sessionName: tmuxJobSessionName(ctx.claudeSessionId, Date.now()),
        scriptPath,
        title: ctx.terminalTitle,
      });

      // xfce4-terminal needs DISPLAY; headless tmux does not.
      const env = hasX
        ? { ...process.env, DISPLAY: process.env.DISPLAY || ':10' }
        : process.env;
      const child = spawn(launch.file, launch.args, { stdio: 'ignore', detached: true, env });
      child.unref();

      ctx.emitLog(
        'info',
        `Launched in tmux session "${launch.sessionName}" (${hasX ? 'xfce4-terminal pane' : 'headless'})`,
      );
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
