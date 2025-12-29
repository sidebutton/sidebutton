// SideButton Browser Extension - Popup Script

const statusEl = document.getElementById("status");
const statusDetail = document.getElementById("status-detail");
const connectBtn = document.getElementById("connect-btn");
const recordingSection = document.getElementById("recording-section");
const recordBtn = document.getElementById("record-btn");
const recordingStatus = document.getElementById("recording-status");

let currentStatus = {
  connected: false,
  wsConnected: false,
  tabId: null,
  recording: false,
};

function updateUI() {
  const { connected, wsConnected, tabId, recording } = currentStatus;

  // Get focus button
  const focusBtn = document.getElementById("focus-btn");

  if (connected) {
    statusEl.className = "status connected";
    statusEl.querySelector(".status-label").textContent = "Connected";

    if (recording) {
      statusDetail.textContent = "Recording actions...";
    } else {
      statusDetail.textContent = "Ready for automation";
    }

    connectBtn.textContent = "Disconnect";
    connectBtn.className = "secondary";

    // Show focus button when connected
    if (focusBtn) {
      focusBtn.style.display = "block";
      focusBtn.onclick = () => {
        if (tabId) {
          chrome.tabs.update(tabId, { active: true });
        }
      };
    }

    // Show recording section when connected
    recordingSection.style.display = "block";

    // Update recording button state
    if (recording) {
      recordBtn.className = "record-btn recording";
      recordBtn.innerHTML = '<span class="record-dot"></span>Stop Recording';
      recordingStatus.style.display = "flex";
    } else {
      recordBtn.className = "record-btn";
      recordBtn.innerHTML = '<span class="record-dot"></span>Start Recording';
      recordingStatus.style.display = "none";
    }
  } else {
    statusEl.className = "status disconnected";
    statusEl.querySelector(".status-label").textContent = "Disconnected";

    if (!wsConnected) {
      statusDetail.textContent = "Waiting for SideButton server...";
      connectBtn.disabled = true;
    } else {
      statusDetail.textContent = "Click to connect";
      connectBtn.disabled = false;
    }

    connectBtn.textContent = "Connect";
    connectBtn.className = "primary";

    // Hide focus button when disconnected
    if (focusBtn) {
      focusBtn.style.display = "none";
    }

    // Hide recording section when disconnected
    recordingSection.style.display = "none";
  }
}

function refreshStatus() {
  chrome.runtime.sendMessage({ from: "popup", action: "getStatus" }, (response) => {
    if (response) {
      currentStatus = response;
      updateUI();
    }
  });
}

connectBtn.addEventListener("click", () => {
  if (currentStatus.connected) {
    chrome.runtime.sendMessage({ from: "popup", action: "disconnect" }, () => {
      refreshStatus();
    });
  } else {
    connectBtn.disabled = true;
    connectBtn.textContent = "Connecting...";

    chrome.runtime.sendMessage({ from: "popup", action: "connect" }, (response) => {
      if (response?.error) {
        console.error("[Assistant]", response.error);
      }
      refreshStatus();
    });
  }
});

// Recording button handler
recordBtn.addEventListener("click", () => {
  if (currentStatus.recording) {
    // Stop recording
    chrome.runtime.sendMessage({ from: "popup", action: "stopRecording" }, () => {
      refreshStatus();
    });
  } else {
    // Start recording
    chrome.runtime.sendMessage({ from: "popup", action: "startRecording" }, () => {
      refreshStatus();
    });
  }
});

// Embed toggle handler
const embedToggle = document.getElementById("embed-toggle");

// Load embed setting
chrome.runtime.sendMessage({ from: "popup", action: "getEmbedEnabled" }, (response) => {
  if (response) {
    embedToggle.checked = response.enabled !== false;
  }
});

embedToggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    from: "popup",
    action: "setEmbedEnabled",
    enabled: embedToggle.checked,
  });
});

// Initial status
refreshStatus();

// Poll for updates
setInterval(refreshStatus, 2000);
