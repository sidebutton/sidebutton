/**
 * CLI entry point for sidebutton
 */

import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { loadWorkflowsFromDir, type Workflow } from '@sidebutton/core';
import { startServer } from './server.js';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 9876;

// Bundle metadata type
interface BundleMetadata {
  name: string;
  version: string;
  title: string;
  description: string;
  workflows: string[];
  requires: { llm: boolean; browser: boolean };
  tos_warning: boolean;
  tags: string[];
}

// Find the project root (where workflows/ and actions/ are)
function findProjectRoot(): string {
  // Start from current working directory and traverse up
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'workflows')) || fs.existsSync(path.join(dir, 'actions'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Fallback to home directory with .sidebutton
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  const configDir = path.join(homeDir, '.sidebutton');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  return configDir;
}

// Find bundles directory (works from source and npm package)
function findBundlesDir(): string | null {
  // Try relative to this file (for development)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Development: packages/server/src/cli.ts -> bundles/
  const devBundlesDir = path.resolve(__dirname, '../../../bundles');
  if (fs.existsSync(devBundlesDir)) {
    return devBundlesDir;
  }

  // npm package: packages/server/bundles/
  const npmBundlesDir = path.resolve(__dirname, '../bundles');
  if (fs.existsSync(npmBundlesDir)) {
    return npmBundlesDir;
  }

  return null;
}

// List available bundles
function listAvailableBundles(bundlesDir: string): BundleMetadata[] {
  const bundles: BundleMetadata[] = [];

  const entries = fs.readdirSync(bundlesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const bundleJsonPath = path.join(bundlesDir, entry.name, 'bundle.json');
      if (fs.existsSync(bundleJsonPath)) {
        const metadata = JSON.parse(fs.readFileSync(bundleJsonPath, 'utf-8')) as BundleMetadata;
        bundles.push(metadata);
      }
    }
  }

  return bundles;
}

// Install a bundle to actions directory
function installBundle(bundlesDir: string, bundleName: string, actionsDir: string): { installed: number; skipped: number } {
  // Resolve short name to full name
  const shortName = bundleName.includes('/') ? bundleName.split('/')[1] : bundleName;
  const bundleDir = path.join(bundlesDir, shortName);
  const bundleJsonPath = path.join(bundleDir, 'bundle.json');

  if (!fs.existsSync(bundleJsonPath)) {
    throw new Error(`Bundle not found: ${bundleName}`);
  }

  const metadata = JSON.parse(fs.readFileSync(bundleJsonPath, 'utf-8')) as BundleMetadata;
  const workflowsDir = path.join(bundleDir, 'workflows');

  // Ensure actions directory exists
  if (!fs.existsSync(actionsDir)) {
    fs.mkdirSync(actionsDir, { recursive: true });
  }

  let installed = 0;
  let skipped = 0;

  for (const workflowFile of metadata.workflows) {
    const srcPath = path.join(workflowsDir, workflowFile);
    const destPath = path.join(actionsDir, workflowFile);

    if (fs.existsSync(destPath)) {
      skipped++;
      continue;
    }

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      installed++;
    }
  }

  // Update manifest
  const installedDir = path.join(actionsDir, '.installed');
  if (!fs.existsSync(installedDir)) {
    fs.mkdirSync(installedDir, { recursive: true });
  }

  const manifestPath = path.join(installedDir, 'manifest.json');
  let manifest: Record<string, string> = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  manifest[shortName] = metadata.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { installed, skipped };
}

const program = new Command();

program
  .name('sidebutton')
  .description('Workflow automation CLI')
  .version('1.0.0');

program
  .command('serve')
  .description('Start the server with dashboard')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PORT))
  .option('--headless', 'Run without dashboard')
  .action(async (options) => {
    const projectRoot = findProjectRoot();
    const port = Number(options.port);

    console.log(chalk.cyan('\n  SideButton\n'));
    console.log(`  Project root: ${projectRoot}`);

    await startServer({
      port,
      actionsDir: path.join(projectRoot, 'actions'),
      workflowsDir: path.join(projectRoot, 'workflows'),
      templatesDir: path.join(projectRoot, 'templates'),
      runLogsDir: path.join(projectRoot, 'run_logs'),
    });
  });

program
  .command('init [bundles...]')
  .description('Install workflow bundles')
  .option('--list', 'List available bundles')
  .action(async (bundleNames: string[], options) => {
    const bundlesDir = findBundlesDir();

    if (!bundlesDir) {
      console.error(chalk.red('\n  Error: Bundles directory not found.\n'));
      process.exit(1);
    }

    const availableBundles = listAvailableBundles(bundlesDir);

    // List mode
    if (options.list) {
      console.log(chalk.cyan('\n  Available Bundles\n'));

      for (const bundle of availableBundles) {
        const warning = bundle.tos_warning ? chalk.yellow(' [ToS warning]') : '';
        console.log(`  ${chalk.bold(bundle.name)}${warning}`);
        console.log(`    ${bundle.description}`);
        console.log(`    Workflows: ${bundle.workflows.length}`);
        if (bundle.requires.llm) console.log(`    Requires: LLM API key`);
        console.log();
      }
      return;
    }

    const projectRoot = findProjectRoot();
    const actionsDir = path.join(projectRoot, 'actions');

    console.log(chalk.cyan('\n  SideButton\n'));
    console.log('  Installing bundles...\n');

    // Default: install all bundles
    const toInstall = bundleNames.length > 0 ? bundleNames : availableBundles.map(b => b.name.split('/')[1]);

    let totalInstalled = 0;
    let totalSkipped = 0;

    for (const bundleName of toInstall) {
      const shortName = bundleName.includes('/') ? bundleName.split('/')[1] : bundleName;
      const bundle = availableBundles.find(b => b.name.endsWith(`/${shortName}`));

      if (!bundle) {
        console.log(`  ${chalk.red('✗')} ${bundleName} (not found)`);
        continue;
      }

      // Show ToS warning for bundles that need it
      if (bundle.tos_warning) {
        console.log(chalk.yellow(`  ⚠ ${bundle.name} - Target sites may prohibit scraping. Use at your own risk.`));
      }

      try {
        const { installed, skipped } = installBundle(bundlesDir, bundleName, actionsDir);
        totalInstalled += installed;
        totalSkipped += skipped;
        console.log(`  ${chalk.green('✓')} ${bundle.name} (${installed} installed, ${skipped} skipped)`);
      } catch (error) {
        console.log(`  ${chalk.red('✗')} ${bundleName} (${error instanceof Error ? error.message : 'unknown error'})`);
      }
    }

    console.log();
    console.log(`  ${totalInstalled} workflows installed to ${actionsDir}`);
    if (totalSkipped > 0) {
      console.log(`  ${totalSkipped} workflows skipped (already exist)`);
    }
    console.log();
    console.log(`  Run: ${chalk.bold('sidebutton serve')}\n`);
  });

program
  .command('list')
  .description('List available workflows')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const projectRoot = findProjectRoot();
    const actions = loadWorkflowsFromDir(path.join(projectRoot, 'actions'));
    const workflows = loadWorkflowsFromDir(path.join(projectRoot, 'workflows'));

    const all = [...actions, ...workflows];

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
    const projectRoot = findProjectRoot();
    const actions = loadWorkflowsFromDir(path.join(projectRoot, 'actions'));
    const workflows = loadWorkflowsFromDir(path.join(projectRoot, 'workflows'));

    const workflow = [...actions, ...workflows].find((w) => w.id === workflowId);

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

program.parse();
