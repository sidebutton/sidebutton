/**
 * CLI entry point for sidebutton
 */

import 'dotenv/config';
import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import chalk from 'chalk';
import { loadWorkflowsFromDir, loadWorkflow, type Workflow } from '@sidebutton/core';
import { startServer } from './server.js';
import { startStdioMode } from './stdio-mode.js';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.js';
import {
  installSkillPack,
  uninstallSkillPack,
  listInstalledPacks,
  copyDirRecursive,
  readSkillPackManifest,
  validateSkillPack,
} from './skill-pack.js';
import {
  addRegistry,
  removeRegistry,
  updateRegistry,
  listRegistries,
  searchPacks,
  resolvePackFromRegistries,
  cloneAndInstallFromUrl,
  generateRegistryIndex,
  isGitRepo,
  gitCommitChanges,
} from './registry.js';

const DEFAULT_PORT = 9876;

// Check if directory is empty (no YAML files)
function isDirEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.length === 0;
}

// Copy default content to user's config directory
function copyDefaults(configDir: string): void {
  const defaultsDir = findDefaultsDir();
  if (!defaultsDir) return;

  // Use stderr to avoid polluting stdout in stdio mode
  process.stderr.write(chalk.cyan('  Setting up default content...\n'));

  // Copy subdirectories from defaults (workflows, actions, roles, targets)
  for (const subdir of ['workflows', 'actions', 'roles', 'targets']) {
    const srcDir = path.join(defaultsDir, subdir);
    const destDir = path.join(configDir, subdir);

    if (!fs.existsSync(srcDir)) continue;
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      // Provider skill files are created on-demand when the provider connects
      if (subdir === 'targets' && file.startsWith('_provider-')) continue;
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);
      if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Copy default skills if any exist
  const skillsSrc = path.join(defaultsDir, 'skills');
  const skillsDest = path.join(configDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    const entries = fs.readdirSync(skillsSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const destDir = path.join(skillsDest, entry.name);
        if (!fs.existsSync(destDir)) {
          copyDirRecursive(path.join(skillsSrc, entry.name), destDir);
        }
      }
    }
  }

  // Copy top-level files (don't overwrite existing)
  for (const file of ['settings.json', 'persona.md']) {
    const srcFile = path.join(defaultsDir, file);
    const destFile = path.join(configDir, file);
    if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
      fs.copyFileSync(srcFile, destFile);
    }
  }

  process.stderr.write(`  ${chalk.green('✓')} Default content installed\n`);
}

// Find defaults directory (works from source and npm package)
// Both dev (src/cli.ts) and built (dist/cli.js) resolve to ../defaults
function findDefaultsDir(): string | null {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const defaultsDir = path.resolve(__dirname, '../defaults');
  if (fs.existsSync(defaultsDir)) {
    return defaultsDir;
  }

  return null;
}

// All user data lives in ~/.sidebutton (workflows, actions, settings, roles, targets, etc.)
// Seeded from defaults on first run
function getConfigDir(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  const configDir = path.join(homeDir, '.sidebutton');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  if (isDirEmpty(path.join(configDir, 'actions'))) {
    copyDefaults(configDir);
  }

  // Ensure skills directory exists
  const skillsDir = path.join(configDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  return configDir;
}

// Load all workflows including from installed skill packs
function loadAllWorkflows(configDir: string): Workflow[] {
  const actions = loadWorkflowsFromDir(path.join(configDir, 'actions'));
  const workflows = loadWorkflowsFromDir(path.join(configDir, 'workflows'));
  const skillWorkflows = loadSkillWorkflows(path.join(configDir, 'skills'));
  return [...actions, ...workflows, ...skillWorkflows];
}

function loadSkillWorkflows(skillsDir: string): Workflow[] {
  const workflows: Workflow[] = [];
  if (!fs.existsSync(skillsDir)) return workflows;
  for (const domain of fs.readdirSync(skillsDir)) {
    const domainDir = path.join(skillsDir, domain);
    try {
      if (!fs.statSync(domainDir).isDirectory()) continue;
      scanSkillDir(domainDir, workflows);
    } catch { /* skip */ }
  }
  return workflows;
}

function scanSkillDir(dir: string, workflows: Workflow[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanSkillDir(fullPath, workflows);
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      try {
        workflows.push(loadWorkflow(fullPath));
      } catch { /* skip invalid */ }
    }
  }
}

// Default to 'serve' when no command is given
const userArgs = process.argv.slice(2);
const hasCommand = userArgs.length > 0 && !userArgs[0].startsWith('-');
const hasHelpOrVersion = ['--help', '-h', '--version', '-V'].includes(userArgs[0]);
const parseArgs = (hasCommand || hasHelpOrVersion) ? process.argv : ['node', 'sidebutton', 'serve', ...userArgs];

const program = new Command();

program
  .name('sidebutton')
  .description('Workflow automation CLI')
  .version(VERSION);

program
  .command('serve')
  .description('Start the server with dashboard')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PORT))
  .option('--headless', 'Run without dashboard')
  .option('--stdio', 'Use stdio transport for MCP (for Claude Desktop)')
  .action(async (options) => {
    const configDir = getConfigDir();
    const port = Number(options.port);

    const dirs = {
      port,
      actionsDir: path.join(configDir, 'actions'),
      workflowsDir: path.join(configDir, 'workflows'),
      templatesDir: path.join(configDir, 'templates'),
      runLogsDir: path.join(configDir, 'run_logs'),
      configDir,
    };

    // stdio mode: no stdout output, uses stdin/stdout for MCP JSON-RPC
    if (options.stdio) {
      await startStdioMode(dirs);
      return;
    }

    // Normal mode with console output
    console.log(chalk.cyan('\n  SideButton\n'));
    console.log(`  Config: ${configDir}`);

    await startServer(dirs);
  });

program
  .command('install [source]')
  .description('Install a skill pack (local path, git URL, or registry name)')
  .option('--list', 'List installed skill packs')
  .option('--force', 'Overwrite existing installation')
  .action(async (source: string | undefined, options) => {
    const configDir = getConfigDir();

    // List mode
    if (options.list) {
      const packs = listInstalledPacks(configDir);

      console.log(chalk.cyan('\n  Installed Skill Packs\n'));

      if (packs.length === 0) {
        console.log('  No skill packs installed.\n');
        return;
      }

      for (const pack of packs) {
        console.log(`  ${chalk.bold(pack.domain)}`);
        console.log(`    ${pack.name} v${pack.version} — ${pack.title}`);
        console.log(`    Installed: ${new Date(pack.installedAt).toLocaleDateString()}`);
        console.log();
      }
      return;
    }

    // Install mode — source is required
    if (!source) {
      console.error(chalk.red('\n  Usage: sidebutton install <path|url|name>\n'));
      console.log('  Install a skill pack from:');
      console.log('    Local directory:  sidebutton install ./my-pack');
      console.log('    Git URL:          sidebutton install https://github.com/org/skill-packs');
      console.log('    Registry name:    sidebutton install app.example.com');
      console.log('  Use --list to see installed packs.\n');
      process.exit(1);
    }

    console.log(chalk.cyan('\n  SideButton\n'));

    try {
      // Detect source type (git URLs take priority over local path detection)
      const isGitUrl = source.includes('://') || source.startsWith('git@') || source.endsWith('.git');
      const isLocalPath = !isGitUrl && (source.startsWith('.') || source.startsWith('/') || source.startsWith('~') || source.startsWith('\\') || fs.existsSync(path.resolve(source)));

      if (isLocalPath) {
        // Local path — existing behavior
        const resolved = path.resolve(source);
        if (!fs.existsSync(resolved)) {
          console.error(chalk.red(`  Directory not found: ${resolved}\n`));
          process.exit(1);
        }

        const result = installSkillPack(resolved, configDir, { force: options.force });
        printInstallResult(result, configDir);
      } else if (isGitUrl) {
        // Direct git URL — clone, detect packs, install
        console.log(`  Cloning ${source}...\n`);
        const results = await cloneAndInstallFromUrl(source, configDir, { force: options.force });
        for (const result of results) {
          printInstallResult(result, configDir);
        }
      } else {
        // Registry lookup
        const resolved = resolvePackFromRegistries(source, configDir);
        if (!resolved) {
          console.error(chalk.red(`  Pack not found: ${source}. Run 'sidebutton search' to see available packs.\n`));
          process.exit(1);
        }

        console.log(`  Found in registry: ${resolved.registry}\n`);
        const result = installSkillPack(resolved.packDir, configDir, { force: options.force });
        printInstallResult(result, configDir);
      }
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

function printInstallResult(
  result: { domain: string; filesInstalled: number; status: string },
  configDir: string,
): void {
  if (result.status === 'skipped') {
    console.log(`  ${chalk.yellow('—')} ${result.domain} already installed (same version)`);
    console.log('  Use --force to reinstall.\n');
  } else {
    const verb = result.status === 'updated' ? 'Updated' : 'Installed';
    console.log(`  ${chalk.green('✓')} ${verb}: ${result.domain} (${result.filesInstalled} files)`);
    console.log(`  Location: ${path.join(configDir, 'skills', result.domain)}\n`);
  }
}

program
  .command('uninstall <domain>')
  .description('Remove an installed skill pack')
  .action(async (domain: string) => {
    const configDir = getConfigDir();

    console.log(chalk.cyan('\n  SideButton\n'));

    try {
      uninstallSkillPack(domain, configDir);
      console.log(`  ${chalk.green('✓')} Uninstalled: ${domain}\n`);
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List available workflows')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const configDir = getConfigDir();
    const all = loadAllWorkflows(configDir);

    if (options.json) {
      console.log(JSON.stringify(all.map((w) => ({
        id: w.id,
        title: w.title,
        params: w.params,
      })), null, 2));
      return;
    }

    console.log(chalk.cyan('\n  Available Workflows\n'));

    if (all.length === 0) {
      console.log('  No workflows found.\n');
      return;
    }

    for (const workflow of all) {
      console.log(`  ${chalk.bold(workflow.id)}`);
      console.log(`    ${workflow.title}`);
      if (workflow.params && Object.keys(workflow.params).length > 0) {
        console.log(`    Params: ${Object.keys(workflow.params).join(', ')}`);
      }
      console.log();
    }
  });

program
  .command('run <workflow>')
  .description('Run a workflow')
  .option('--param <params...>', 'Parameters in key=value format')
  .option('-p, --port <port>', 'Server port', String(DEFAULT_PORT))
  .action(async (workflowId, options) => {
    const configDir = getConfigDir();
    const all = loadAllWorkflows(configDir);
    const workflow = all.find((w) => w.id === workflowId);

    if (!workflow) {
      console.error(chalk.red(`\n  Workflow not found: ${workflowId}\n`));
      process.exit(1);
    }

    // Parse params
    const params: Record<string, string> = {};
    if (options.param) {
      for (const p of options.param) {
        const [key, ...valueParts] = p.split('=');
        params[key] = valueParts.join('=');
      }
    }

    const port = Number(options.port);

    console.log(chalk.cyan(`\n  Running: ${workflow.title}\n`));

    // Check if server is running
    try {
      const healthResponse = await fetch(`http://localhost:${port}/health`);
      if (!healthResponse.ok) {
        throw new Error('Server not responding');
      }
    } catch {
      console.error(chalk.red('  Server is not running.'));
      console.log(`\n  Start the server first: ${chalk.bold('sidebutton serve')}\n`);
      process.exit(1);
    }

    // Execute workflow via REST API
    try {
      const response = await fetch(`http://localhost:${port}/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params }),
      });

      const result = await response.json() as {
        status: string;
        run_id?: string;
        message?: string;
        variables?: Record<string, unknown>;
        error?: string;
      };

      if (result.status === 'completed') {
        console.log(chalk.green('  ✓ Workflow completed successfully'));
        if (result.variables && Object.keys(result.variables).length > 0) {
          console.log('\n  Output variables:');
          for (const [key, value] of Object.entries(result.variables)) {
            const displayValue = typeof value === 'string' && value.length > 100
              ? value.substring(0, 100) + '...'
              : value;
            console.log(`    ${key}: ${displayValue}`);
          }
        }
      } else if (result.status === 'failed') {
        console.log(chalk.red(`  ✗ Workflow failed: ${result.error || result.message || 'Unknown error'}`));
        process.exit(1);
      } else {
        console.log(chalk.yellow(`  Status: ${result.status}`));
        if (result.message) {
          console.log(`  Message: ${result.message}`);
        }
      }

      if (result.run_id) {
        console.log(`\n  Run ID: ${result.run_id}`);
      }
      console.log();
    } catch (error) {
      console.error(chalk.red(`  Error executing workflow: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check server and browser status')
  .action(async () => {
    const port = DEFAULT_PORT;

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();

      console.log(chalk.cyan('\n  Server Status\n'));
      console.log(`  Server: ${data.status === 'ok' ? chalk.green('Running') : chalk.red('Not running')}`);
      console.log(`  Browser: ${data.browser_connected ? chalk.green('Connected') : chalk.yellow('Not connected')}`);
      console.log(`  Version: ${data.version}`);
      console.log();
    } catch {
      console.log(chalk.cyan('\n  Server Status\n'));
      console.log(`  Server: ${chalk.red('Not running')}`);
      console.log(`\n  Run: ${chalk.bold('sidebutton serve')} to start.\n`);
    }
  });

// ============================================================================
// Skill pack creator commands (init, validate, publish)
// ============================================================================

program
  .command('init <domain>')
  .description('Scaffold a new skill pack')
  .action(async (domain: string) => {
    const dir = path.resolve(domain);

    if (fs.existsSync(dir)) {
      console.error(chalk.red(`\n  Directory already exists: ${dir}\n`));
      process.exit(1);
    }

    fs.mkdirSync(dir, { recursive: true });

    // Derive name from domain (e.g. app.example.com → example)
    const parts = domain.replace(/^www\./, '').split('.');
    const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

    // Write skill-pack.json
    const manifest = {
      name,
      version: '1.0.0',
      title: `${name.charAt(0).toUpperCase() + name.slice(1)} Automation`,
      description: '',
      domain,
      requires: { browser: true, llm: false },
    };
    fs.writeFileSync(path.join(dir, 'skill-pack.json'), JSON.stringify(manifest, null, 2) + '\n');

    // Write _skill.md template
    const skillMd = `# ${domain}

## Overview
<!-- What this application does and who uses it -->

## Navigation
<!-- Main navigation structure, key URLs, menu layout -->

## Authentication
<!-- Login flow, session handling, required credentials -->

## Data Model
<!-- Key entities, relationships, field types -->

## Common Tasks
<!-- Step-by-step for frequent operations -->

## Selectors
<!-- Key CSS selectors for automation -->

## States & Indicators
<!-- Loading states, success/error indicators, status badges -->

## Gotchas
<!-- Known quirks, timing issues, edge cases -->

## API
<!-- REST/GraphQL endpoints if relevant -->
`;
    fs.writeFileSync(path.join(dir, '_skill.md'), skillMd);

    // Create _roles/ with qa.md template
    const rolesDir = path.join(dir, '_roles');
    fs.mkdirSync(rolesDir, { recursive: true });

    const qaMd = `---
name: qa
match:
  - "${domain}"
enabled: true
---

# QA — ${domain}

## Test Strategy
<!-- Overall testing approach for this application -->

## Test Sequences
<!-- Ordered test flows with steps and expected outcomes -->

## Verification Criteria
<!-- What constitutes pass/fail for each test -->
`;
    fs.writeFileSync(path.join(rolesDir, 'qa.md'), qaMd);

    console.log(chalk.cyan('\n  SideButton\n'));
    console.log(`  ${chalk.green('✓')} Skill pack scaffolded: ${domain}\n`);
    console.log('  Created:');
    console.log(`    ${domain}/skill-pack.json`);
    console.log(`    ${domain}/_skill.md`);
    console.log(`    ${domain}/_roles/qa.md`);
    console.log();
    console.log('  Next steps:');
    console.log(`    1. Edit ${chalk.bold('_skill.md')} with domain knowledge`);
    console.log(`    2. Edit ${chalk.bold('_roles/qa.md')} with test playbook`);
    console.log(`    3. Run ${chalk.bold('sidebutton validate ' + domain)} to check`);
    console.log(`    4. Run ${chalk.bold('sidebutton publish ' + domain + ' --registry <path>')} to publish`);
    console.log();
  });

program
  .command('validate [path]')
  .description('Validate skill pack structure')
  .action(async (packPath?: string) => {
    const dir = path.resolve(packPath || '.');

    console.log(chalk.cyan('\n  SideButton\n'));
    console.log(`  Validating: ${dir}\n`);

    const result = validateSkillPack(dir);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`  ${chalk.red('✗')} ${err}`);
      }
    }

    if (result.warnings.length > 0) {
      for (const warn of result.warnings) {
        console.log(`  ${chalk.yellow('!')} ${warn}`);
      }
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`  ${chalk.green('✓')} Valid skill pack`);
    } else if (result.errors.length === 0) {
      console.log(`\n  ${chalk.green('✓')} Valid (with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`);
    }

    console.log();

    if (result.errors.length > 0) {
      process.exit(1);
    }
  });

program
  .command('publish [source]')
  .description('Publish skill pack to registry')
  .requiredOption('--registry <path>', 'Target registry directory')
  .option('--dry-run', 'Validate without writing')
  .action(async (source: string | undefined, options: { registry: string; dryRun?: boolean }) => {
    const registryDir = path.resolve(options.registry);

    console.log(chalk.cyan('\n  SideButton\n'));

    if (!fs.existsSync(registryDir)) {
      console.error(chalk.red(`  Registry directory not found: ${registryDir}\n`));
      process.exit(1);
    }

    try {
      if (source) {
        // COPY MODE: validate source, copy into registry, regenerate index
        const sourceDir = path.resolve(source);

        const { errors, warnings } = validateSkillPack(sourceDir);
        for (const warn of warnings) {
          console.log(`  ${chalk.yellow('!')} ${warn}`);
        }
        if (errors.length > 0) {
          for (const err of errors) {
            console.log(`  ${chalk.red('✗')} ${err}`);
          }
          console.log(chalk.red('\n  Publish aborted due to validation errors.\n'));
          process.exit(1);
        }

        const manifest = readSkillPackManifest(sourceDir);
        const destDir = path.join(registryDir, manifest.domain);

        if (options.dryRun) {
          console.log(`  [dry-run] Would publish ${manifest.domain}@${manifest.version} to ${path.basename(registryDir)}`);
          console.log(`  [dry-run] Would copy ${sourceDir} → ${destDir}`);
          console.log(`  [dry-run] Would regenerate index.json\n`);
          return;
        }

        // Copy pack into registry
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true });
        }
        copyDirRecursive(sourceDir, destDir);
        // Also copy skill-pack.json (it's in SKIP_PATTERNS for install, but needed in registry)
        fs.copyFileSync(
          path.join(sourceDir, 'skill-pack.json'),
          path.join(destDir, 'skill-pack.json'),
        );

        generateRegistryIndex(registryDir);

        // Auto-commit if git repo
        if (isGitRepo(registryDir)) {
          await gitCommitChanges(registryDir, `publish: ${manifest.domain}@${manifest.version}`);
        }

        console.log(`  ${chalk.green('✓')} Published ${chalk.bold(manifest.domain)}@${manifest.version} to ${path.basename(registryDir)}\n`);
      } else {
        // IN-PLACE MODE: validate all packs in registry, regenerate index
        const entries = fs.readdirSync(registryDir, { withFileTypes: true });
        let packCount = 0;
        let hasErrors = false;

        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const packDir = path.join(registryDir, entry.name);
          if (!fs.existsSync(path.join(packDir, 'skill-pack.json'))) continue;

          packCount++;
          const { errors, warnings } = validateSkillPack(packDir);

          for (const warn of warnings) {
            console.log(`  ${chalk.yellow('!')} ${entry.name}: ${warn}`);
          }
          if (errors.length > 0) {
            hasErrors = true;
            for (const err of errors) {
              console.log(`  ${chalk.red('✗')} ${entry.name}: ${err}`);
            }
          }
        }

        if (hasErrors) {
          console.log(chalk.red('\n  Publish aborted due to validation errors.\n'));
          process.exit(1);
        }

        if (packCount === 0) {
          console.log(chalk.yellow('  No skill packs found in registry directory.\n'));
          process.exit(1);
        }

        if (options.dryRun) {
          console.log(`  [dry-run] Would reindex ${packCount} pack${packCount > 1 ? 's' : ''} in ${path.basename(registryDir)}\n`);
          return;
        }

        generateRegistryIndex(registryDir);

        // Auto-commit if git repo
        if (isGitRepo(registryDir)) {
          await gitCommitChanges(registryDir, `reindex: ${packCount} packs`);
        }

        console.log(`  ${chalk.green('✓')} Reindexed ${packCount} pack${packCount > 1 ? 's' : ''} in ${path.basename(registryDir)}\n`);
      }
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

// ============================================================================
// Registry commands
// ============================================================================

const registryCmd = program
  .command('registry')
  .description('Manage skill pack registries');

registryCmd
  .command('add <url>')
  .description('Add a registry (local directory or git repo)')
  .option('--name <name>', 'Custom registry name')
  .option('--type <type>', 'Registry type: local or git')
  .action(async (url: string, options) => {
    const configDir = getConfigDir();

    console.log(chalk.cyan('\n  SideButton\n'));

    try {
      const { registry, installed } = await addRegistry(url, configDir, {
        name: options.name,
        type: options.type,
      });

      const dir = registry.type === 'local' ? registry.url : path.join(configDir, 'registries', registry.name);
      console.log(`  ${chalk.green('✓')} Registry added: ${registry.name} (${registry.type})`);
      console.log(`  Location: ${dir}`);
      if (installed.length > 0) {
        console.log();
        for (const pack of installed) {
          console.log(`  ${chalk.green('✓')} Installed: ${pack.domain} (${pack.filesInstalled} files)`);
        }
      }
      console.log();
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

registryCmd
  .command('remove <name>')
  .description('Remove a registry')
  .action((name: string) => {
    const configDir = getConfigDir();

    console.log(chalk.cyan('\n  SideButton\n'));

    try {
      const uninstalled = removeRegistry(name, configDir);
      console.log(`  ${chalk.green('✓')} Registry removed: ${name}`);
      if (uninstalled.length > 0) {
        for (const domain of uninstalled) {
          console.log(`  ${chalk.green('✓')} Uninstalled: ${domain}`);
        }
      }
      console.log();
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

registryCmd
  .command('list')
  .description('Show configured registries with pack counts')
  .action(() => {
    const configDir = getConfigDir();
    const registries = listRegistries(configDir);

    console.log(chalk.cyan('\n  Skill Pack Registries\n'));

    if (registries.length === 0) {
      console.log('  No registries configured.');
      console.log(`  Add one: ${chalk.bold('sidebutton registry add <url>')}\n`);
      return;
    }

    for (const reg of registries) {
      const status = reg.enabled ? chalk.green('enabled') : chalk.yellow('disabled');
      console.log(`  ${chalk.bold(reg.name)} (${reg.type}) — ${status}`);
      console.log(`    URL: ${reg.url}`);
      console.log(`    Packs: ${reg.packCount}`);
      console.log();
    }
  });

registryCmd
  .command('update [name]')
  .description('Pull latest for git registries')
  .action(async (name?: string) => {
    const configDir = getConfigDir();

    console.log(chalk.cyan('\n  SideButton\n'));

    try {
      const results = await updateRegistry(configDir, name);

      for (const result of results) {
        const icon = result.status.startsWith('updated') ? chalk.green('✓') : chalk.yellow('—');
        console.log(`  ${icon} ${result.name}: ${result.status}`);
        for (const pack of result.installed) {
          if (pack.status !== 'skipped') {
            console.log(`    ${chalk.green('✓')} ${pack.domain} (${pack.filesInstalled} files)`);
          }
        }
      }
      console.log();
    } catch (error) {
      console.error(chalk.red(`\n  ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(1);
    }
  });

// ============================================================================
// Search command
// ============================================================================

program
  .command('search [query]')
  .description('Search available packs across all registries')
  .action((query?: string) => {
    const configDir = getConfigDir();
    const results = searchPacks(query, configDir);

    console.log(chalk.cyan('\n  Available Skill Packs\n'));

    if (results.length === 0) {
      if (query) {
        console.log(`  No packs matching "${query}".`);
      } else {
        console.log('  No packs found. Add a registry first:');
        console.log(`  ${chalk.bold('sidebutton registry add <url>')}`);
      }
      console.log();
      return;
    }

    for (const pack of results) {
      console.log(`  ${chalk.bold(pack.domain)} — ${pack.title}`);
      console.log(`    ${pack.name} v${pack.version} [${pack.registry}]`);
      if (pack.description) {
        console.log(`    ${pack.description}`);
      }
      console.log();
    }
  });

program.parse(parseArgs);
