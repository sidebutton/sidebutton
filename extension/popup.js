// SideButton Browser Extension - Popup Script
// Supports both local server mode and hosted (Claude Desktop) mode

const DASHBOARD_URL = "http://localhost:9876";
const ACTIONS_URL = `${DASHBOARD_URL}/actions`;
const LOGIN_URL = "https://sidebutton.com/connect";
const DEFAULT_MCP_URL = "https://sidebutton.com/api/mcp";

// ============================================================================
// DOM Elements
// ============================================================================

const headerSubtitle = document.getElementById("header-subtitle");

// Views
const viewDisconnected = document.getElementById("view-disconnected");
const viewHosted = document.getElementById("view-hosted");
const viewLocal = document.getElementById("view-local");

// Disconnected view elements
const loginBtn = document.getElementById("login-btn");
const connectLocalBtn = document.getElementById("connect-local-btn");

// Hosted view elements
const hostedEmail = document.getElementById("hosted-email");
const hostedTabStatus = document.getElementById("hosted-tab-status");
const hostedTabLabel = document.getElementById("hosted-tab-label");
const hostedTabDetail = document.getElementById("hosted-tab-detail");
const hostedConnectTabBtn = document.getElementById("hosted-connect-tab-btn");
const mcpUrl = document.getElementById("mcp-url");
const copyUrlBtn = document.getElementById("copy-url-btn");
const signoutBtn = document.getElementById("signout-btn");

// Local view elements
const statusEl = document.getElementById("status");
const statusDetail = document.getElementById("status-detail");
const dashboardBtn = document.getElementById("dashboard-btn");
const actionsRow = document.getElementById("actions-row");
const actionsCount = document.getElementById("actions-count");
const disconnectBtn = document.getElementById("disconnect-btn");
const focusBtn = document.getElementById("focus-btn");
const recordBtn = document.getElementById("record-btn");

// Feature toggle elements
const toggleEmbed = document.getElementById("toggle-embed");
const toggleChatPanel = document.getElementById("toggle-chat-panel");

// ============================================================================
// State
// ============================================================================

let currentStatus = {
  mode: "disconnected", // "disconnected", "local", "hosted"
  connected: false,
  wsConnected: false,
  hostedConnected: false,
  tabId: null,
  recording: false,
  email: null,
  mcpUrl: null,
};

// ============================================================================
// View Switching
// ============================================================================

function showView(viewName) {
  viewDisconnected.classList.remove("active");
  viewHosted.classList.remove("active");
  viewLocal.classList.remove("active");

  switch (viewName) {
    case "disconnected":
      viewDisconnected.classList.add("active");
      headerSubtitle.textContent = "Choose connection";
      break;
    case "hosted":
      viewHosted.classList.add("active");
      headerSubtitle.textContent = "Claude Desktop Mode";
      break;
    case "local":
      viewLocal.classList.add("active");
      headerSubtitle.textContent = "Browser Automation";
      break;
  }
}

// ============================================================================
// UI Updates
// ============================================================================

function updateUI() {
  const { mode, connected, wsConnected, hostedConnected, tabId, recording, email } = currentStatus;

  // Determine which view to show
  if (mode === "hosted" && (email || hostedConnected)) {
    showView("hosted");
    hostedEmail.textContent = email || "Connected";
    mcpUrl.textContent = currentStatus.mcpUrl || DEFAULT_MCP_URL;

    // Update tab connection status in hosted view
    if (tabId && connected) {
      hostedTabStatus.classList.remove("disconnected");
      hostedTabStatus.classList.add("connected");
      hostedTabLabel.textContent = "Tab Connected";
      hostedTabDetail.textContent = "Ready for automation";
      hostedConnectTabBtn.textContent = "Disconnect Tab";
      hostedConnectTabBtn.classList.remove("btn-accent");
      hostedConnectTabBtn.classList.add("btn-secondary");
    } else {
      hostedTabStatus.classList.remove("connected");
      hostedTabStatus.classList.add("disconnected");
      hostedTabLabel.textContent = "No Tab Connected";
      hostedTabDetail.textContent = "Click below to connect a tab";
      hostedConnectTabBtn.textContent = "Connect Current Tab";
      hostedConnectTabBtn.classList.remove("btn-secondary");
      hostedConnectTabBtn.classList.add("btn-accent");
    }
  } else if (mode === "local" && connected) {
    showView("local");

    // Update status detail
    if (recording) {
      statusDetail.textContent = "Recording actions...";
      recordBtn.classList.add("active");
      recordBtn.closest(".icon-btn-wrapper").querySelector(".tooltip").textContent = "Stop Recording";
    } else {
      statusDetail.textContent = "Ready for automation";
      recordBtn.classList.remove("active");
      recordBtn.closest(".icon-btn-wrapper").querySelector(".tooltip").textContent = "Record";
    }
  } else {
    showView("disconnected");
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ from: "popup", action: "getStatus" }, (response) => {
    if (response) {
      currentStatus = {
        ...currentStatus,
        ...response,
      };
      updateUI();
    }
  });
}

// ============================================================================
// Hosted Mode Actions
// ============================================================================

// Login button - opens website login page
loginBtn.addEventListener("click", () => {
  // Get extension ID to pass to login page
  const extId = chrome.runtime.id;
  const url = `${LOGIN_URL}?ext=${extId}`;
  chrome.tabs.create({ url });
  window.close();
});

// Copy URL button
copyUrlBtn.addEventListener("click", () => {
  const url = mcpUrl.textContent;
  navigator.clipboard.writeText(url).then(() => {
    copyUrlBtn.textContent = "Copied!";
    setTimeout(() => {
      copyUrlBtn.textContent = "Copy URL";
    }, 2000);
  });
});

// Sign out button
signoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ from: "popup", action: "hostedSignout" });
  await chrome.storage.local.remove(["hostedEmail", "hostedUserCode", "hostedMcpUrl", "mode"]);
  currentStatus = {
    ...currentStatus,
    mode: "disconnected",
    email: null,
    mcpUrl: null,
    hostedConnected: false,
  };
  updateUI();
});

// Hosted mode: Connect/Disconnect tab button
hostedConnectTabBtn.addEventListener("click", () => {
  if (currentStatus.tabId && currentStatus.connected) {
    // Disconnect from tab
    chrome.runtime.sendMessage({ from: "popup", action: "disconnect" }, () => {
      refreshStatus();
    });
  } else {
    // Connect to current tab
    chrome.runtime.sendMessage({ from: "popup", action: "connect" }, (response) => {
      if (response?.error) {
        console.error("[SideButton]", response.error);
        hostedConnectTabBtn.textContent = "Connection failed";
        setTimeout(() => {
          hostedConnectTabBtn.textContent = "Connect Current Tab";
        }, 2000);
      }
      refreshStatus();
    });
  }
});

// ============================================================================
// Local Mode Actions
// ============================================================================

// Connect to local server
connectLocalBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ from: "popup", action: "connect" }, (response) => {
    if (response?.error) {
      console.error("[SideButton]", response.error);
      // Show error state
      connectLocalBtn.textContent = "Connection failed";
      setTimeout(() => {
        connectLocalBtn.textContent = "Connect Local Server";
      }, 2000);
    }
    refreshStatus();
  });
});

// Dashboard button - opens dashboard in new tab
dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

// Actions row - opens actions page
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
// Feature Toggles
// ============================================================================

toggleEmbed.addEventListener("change", () => {
  const enabled = toggleEmbed.checked;
  chrome.storage.local.set({ embedButtonsEnabled: enabled });
  chrome.runtime.sendMessage({ from: "popup", action: "setEmbedEnabled", enabled });
});

toggleChatPanel.addEventListener("change", () => {
  const enabled = toggleChatPanel.checked;
  chrome.storage.local.set({ chatPanelEnabled: enabled });
  chrome.runtime.sendMessage({ from: "popup", action: "setChatPanelEnabled", enabled });
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

// Load saved hosted credentials on popup open
async function initialize() {
  const data = await chrome.storage.local.get([
    "hostedEmail", "hostedUserCode", "hostedMcpUrl", "mode",
    "embedButtonsEnabled", "chatPanelEnabled",
  ]);

  if (data.mode === "hosted" && data.hostedEmail) {
    currentStatus.mode = "hosted";
    currentStatus.email = data.hostedEmail;
    currentStatus.mcpUrl = data.hostedMcpUrl || DEFAULT_MCP_URL;
  }

  // Restore feature toggle states (default: true)
  toggleEmbed.checked = data.embedButtonsEnabled !== false;
  toggleChatPanel.checked = data.chatPanelEnabled !== false;

  refreshStatus();
  fetchActionsCount();
}

initialize();

// Poll for status updates
setInterval(refreshStatus, 2000);

// Refresh actions count periodically (less frequently)
setInterval(fetchActionsCount, 10000);

