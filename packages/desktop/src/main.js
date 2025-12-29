/**
 * Electron Main Process
 * Spawns the Fastify server and opens the dashboard in a BrowserWindow
 */

import { app, BrowserWindow, shell, Menu, Tray, nativeImage } from 'electron';
import { startServer } from '@sidebutton/server';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9876;
const HEALTH_CHECK_INTERVAL = 100;
const HEALTH_CHECK_TIMEOUT = 30000;

let mainWindow = null;
let tray = null;
let serverReady = false;

/**
 * Find project root directory (where workflows/ and actions/ are)
 */
function findProjectRoot() {
  // Start from current working directory
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'workflows')) || fs.existsSync(path.join(dir, 'actions'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Fallback to home directory with .sidebutton
  const homeDir = app.getPath('home');
  const configDir = path.join(homeDir, '.sidebutton');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create default directories if they don't exist
  const actionsDir = path.join(configDir, 'actions');
  const workflowsDir = path.join(configDir, 'workflows');

  if (!fs.existsSync(actionsDir)) {
    fs.mkdirSync(actionsDir, { recursive: true });
  }
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  return configDir;
}

/**
 * Wait for server health check to pass
 */
async function waitForServer() {
  const startTime = Date.now();

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT) {
    try {
      const response = await fetch(`http://localhost:${PORT}/health`);
      if (response.ok) {
        serverReady = true;
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  throw new Error('Server failed to start within timeout');
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'SideButton',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // Don't show until ready
  });

  // Load the dashboard
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      // On macOS, hide window instead of quitting
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create system tray
 */
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

  // Create a small icon for the tray (16x16 or 22x22)
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Create a simple placeholder icon if no icon exists
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('SideButton');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/maxsv0/sidebutton');
          },
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/maxsv0/sidebutton/issues');
          },
        },
      ],
    },
  ];

  // Add macOS-specific menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Main application entry point
 */
async function main() {
  // Find project root and start server
  const projectRoot = findProjectRoot();
  console.log(`Project root: ${projectRoot}`);

  // Start the Fastify server
  console.log('Starting server...');
  startServer({
    port: PORT,
    actionsDir: path.join(projectRoot, 'actions'),
    workflowsDir: path.join(projectRoot, 'workflows'),
    templatesDir: path.join(projectRoot, 'templates'),
    runLogsDir: path.join(projectRoot, 'run_logs'),
  }).catch((err) => {
    console.error('Server error:', err);
  });

  // Wait for server to be ready
  console.log('Waiting for server...');
  await waitForServer();
  console.log('Server ready!');

  // Create UI
  createMenu();
  createTray();
  createWindow();
}

// App lifecycle events
app.whenReady().then(main);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// Graceful shutdown
app.on('before-quit', () => {
  // Server will be cleaned up when process exits
  console.log('Shutting down...');
});
