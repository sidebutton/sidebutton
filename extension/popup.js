// SideButton Browser Extension - Popup Script
// Local server mode with auto-connect

const DASHBOARD_URL = "http://localhost:9876";
const ACTIONS_URL = `${DASHBOARD_URL}/actions`;

// ============================================================================
// DOM Elements
// ============================================================================

const headerSubtitle = document.getElementById("header-subtitle");

// State containers
const stateConnecting = document.getElementById("state-connecting");
const stateConnected = document.getElementById("state-connected");
const stateDisconnected = document.getElementById("state-disconnected");

// Connected state elements
const statusEl = document.getElementById("status");
const statusDetail = document.getElementById("status-detail");
const dashboardBtn = document.getElementById("dashboard-btn");
const actionsRow = document.getElementById("actions-row");
const actionsCount = document.getElementById("actions-count");
const disconnectBtn = document.getElementById("disconnect-btn");
const focusBtn = document.getElementById("focus-btn");
const recordBtn = document.getElementById("record-btn");

// Disconnected state elements
const connectBtn = document.getElementById("connect-btn");
const dashboardBtnDisconnected = document.getElementById("dashboard-btn-disconnected");

// Feature toggle
const toggleEmbed = document.getElementById("toggle-embed");

// ============================================================================
// State
// ============================================================================

let currentStatus = {
  connected: false,
  wsConnected: false,
  tabId: null,
  recording: false,
};

let autoConnectAttempted = false;

// ============================================================================
// View Switching
// ============================================================================

function showState(stateName) {
  stateConnecting.classList.remove("active");
  stateConnected.classList.remove("active");
  stateDisconnected.classList.remove("active");

  switch (stateName) {
    case "connecting":
      stateConnecting.classList.add("active");
      headerSubtitle.textContent = "Connecting...";
      break;
    case "connected":
      stateConnected.classList.add("active");
      headerSubtitle.textContent = "Browser Automation";
      break;
    case "disconnected":
      stateDisconnected.classList.add("active");
      headerSubtitle.textContent = "Not Connected";
      break;
  }
}

// ============================================================================
// UI Updates
// ============================================================================

function updateUI() {
  const { connected, wsConnected, tabId, recording } = currentStatus;

  if (connected && tabId) {
    showState("connected");

    if (!wsConnected) {
      statusEl.classList.remove("connected");
      statusEl.classList.add("disconnected");
      statusDetail.textContent = "Server not reachable";
      recordBtn.classList.remove("active");
      recordBtn.closest(".icon-btn-wrapper").querySelector(".tooltip").textContent = "Record";
    } else if (recording) {
      statusEl.classList.remove("disconnected");
      statusEl.classList.add("connected");
      statusDetail.textContent = "Recording actions...";
      recordBtn.classList.add("active");
      recordBtn.closest(".icon-btn-wrapper").querySelector(".tooltip").textContent = "Stop Recording";
    } else {
      statusEl.classList.remove("disconnected");
      statusEl.classList.add("connected");
      statusDetail.textContent = "Ready for automation";
      recordBtn.classList.remove("active");
      recordBtn.closest(".icon-btn-wrapper").querySelector(".tooltip").textContent = "Record";
    }
  } else {
    showState("disconnected");
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ from: "popup", action: "getStatus" }, (response) => {
    if (response) {
      currentStatus = { ...currentStatus, ...response };
      updateUI();
    }
  });
}

// ============================================================================
// Auto-Connect
// ============================================================================

function attemptAutoConnect() {
  if (autoConnectAttempted) return;
  autoConnectAttempted = true;

  showState("connecting");

  chrome.runtime.sendMessage({ from: "popup", action: "connect" }, (response) => {
    if (response?.error) {
      // Auto-connect failed, show disconnected state
      showState("disconnected");
    }
    refreshStatus();
  });
}

// ============================================================================
// Actions
// ============================================================================

// Manual connect button
connectBtn.addEventListener("click", () => {
  showState("connecting");
  chrome.runtime.sendMessage({ from: "popup", action: "connect" }, (response) => {
    if (response?.error) {
      connectBtn.textContent = "Connection failed";
      showState("disconnected");
      setTimeout(() => {
        connectBtn.textContent = "Connect";
      }, 2000);
    }
    refreshStatus();
  });
});

// Dashboard buttons
dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

dashboardBtnDisconnected.addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

// Actions row
actionsRow.addEventListener("click", () => {
  chrome.tabs.create({ url: ACTIONS_URL });
});

// Disconnect button
disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ from: "popup", action: "disconnect" }, () => {
    refreshStatus();
  });
});

// Focus tab button
focusBtn.addEventListener("click", () => {
  if (currentStatus.tabId) {
    chrome.tabs.update(currentStatus.tabId, { active: true });
  }
});

// Recording button
recordBtn.addEventListener("click", () => {
  if (currentStatus.recording) {
    chrome.runtime.sendMessage({ from: "popup", action: "stopRecording" }, () => {
      refreshStatus();
    });
  } else {
    chrome.runtime.sendMessage({ from: "popup", action: "startRecording" }, () => {
      refreshStatus();
    });
  }
});

// ============================================================================
// Feature Toggle
// ============================================================================

toggleEmbed.addEventListener("change", () => {
  const enabled = toggleEmbed.checked;
  chrome.storage.local.set({ embedButtonsEnabled: enabled });
  chrome.runtime.sendMessage({ from: "popup", action: "setEmbedEnabled", enabled });
});

// ============================================================================
// Fetch Actions Count
// ============================================================================

async function fetchActionsCount() {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/workflows`);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const count = data.workflows?.length || 0;
    actionsCount.textContent = `${count} Action${count !== 1 ? "s" : ""}`;
  } catch (e) {
    actionsCount.textContent = "-- Actions";
  }
}

// ============================================================================
// Initialize
// ============================================================================

async function initialize() {
  // Restore feature toggle state
  const data = await chrome.storage.local.get(["embedButtonsEnabled"]);
  toggleEmbed.checked = data.embedButtonsEnabled !== false;

  // Check current status first
  chrome.runtime.sendMessage({ from: "popup", action: "getStatus" }, (response) => {
    if (response) {
      currentStatus = { ...currentStatus, ...response };

      if (currentStatus.connected && currentStatus.tabId) {
        // Already connected - show connected state
        updateUI();
      } else {
        // Not connected - attempt auto-connect
        attemptAutoConnect();
      }
    } else {
      // No response - try auto-connect
      attemptAutoConnect();
    }
  });

  fetchActionsCount();
}

initialize();

// Poll for status updates
setInterval(refreshStatus, 2000);

// Refresh actions count periodically
setInterval(fetchActionsCount, 10000);
