// SideButton Browser Extension - Background Service Worker
// Handles WebSocket communication with server and CDP-based input simulation

const SERVER_WS_URL = "ws://localhost:9876/ws";
const RECONNECT_DELAY = 3000;

let ws = null;
let connectedTabId = null;
let debuggerAttached = false;
let isRecording = false;
let pendingRequests = new Map(); // requestId -> { resolve, reject }
let requestCounter = 0;
let lastMousePosition = null; // Track last hover position for scroll targeting
let embedConfigCache = new Map(); // domain -> configs[]
let embedEnabled = true; // Global toggle for embedded buttons

// ============================================================================
// WebSocket Connection
// ============================================================================

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(SERVER_WS_URL);

  ws.onopen = () => {
    console.log("[SideButton] Connected to server");
    broadcastStatus();
    broadcastEmbedStatus(); // Update embed buttons visibility
    embedConfigCache.clear(); // Clear cache to refresh configs
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      await handleCommand(msg);
    } catch (e) {
      console.error("[SideButton] Message parse error:", e);
    }
  };

  ws.onclose = () => {
    console.log("[SideButton] Disconnected from server");
    ws = null;
    broadcastEmbedStatus(); // Hide embed buttons when disconnected
    setTimeout(connect, RECONNECT_DELAY);
  };

  ws.onerror = (e) => {
    console.error("[SideButton] WebSocket error:", e);
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastStatus() {
  send({
    event: "status",
    connected: !!connectedTabId,
    tabId: connectedTabId,
    recording: isRecording,
  });
}

// ============================================================================
// CDP (Chrome DevTools Protocol) Management
// ============================================================================

async function attachDebugger(tabId) {
  if (debuggerAttached && connectedTabId === tabId) return true;

  try {
    if (debuggerAttached && connectedTabId !== tabId) {
      await chrome.debugger.detach({ tabId: connectedTabId });
    }

    await chrome.debugger.attach({ tabId }, "1.3");
    debuggerAttached = true;
    connectedTabId = tabId;
    console.log("[SideButton] Connected to tab", tabId);
    return true;
  } catch (e) {
    console.error("[SideButton] Connect failed:", e.message);
    debuggerAttached = false;
    connectedTabId = null;
    throw e;
  }
}

async function detachDebugger() {
  if (!debuggerAttached) return;

  try {
    await chrome.debugger.detach({ tabId: connectedTabId });
  } catch (e) {
    // Ignore - tab may already be closed
  }

  debuggerAttached = false;
  connectedTabId = null;
  console.log("[SideButton] Debugger detached");
}

async function cdp(method, params = {}) {
  if (!debuggerAttached || !connectedTabId) {
    throw new Error("Debugger not attached");
  }
  return chrome.debugger.sendCommand({ tabId: connectedTabId }, method, params);
}

// Listen for debugger detachment
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === connectedTabId) {
    debuggerAttached = false;
    connectedTabId = null;
    broadcastStatus();
  }
});

// ============================================================================
// Command Handlers
// ============================================================================

async function handleCommand(msg) {
  const { cmd, requestId } = msg;

  try {
    let result;

    switch (cmd) {
      case "connect":
        result = await cmdConnect(msg);
        break;
      case "disconnect":
        result = await cmdDisconnect();
        break;
      case "navigate":
        result = await cmdNavigate(msg);
        break;
      case "click":
        result = await cmdClick(msg);
        break;
      case "type":
        result = await cmdType(msg);
        break;
      case "scroll":
        result = await cmdScroll(msg);
        break;
      case "extract":
        result = await cmdExtract(msg);
        break;
      case "extractAll":
        result = await cmdExtractAll(msg);
        break;
      case "screenshot":
        result = await cmdScreenshot();
        break;
      case "wait":
        result = await cmdWait(msg);
        break;
      case "exists":
        result = await cmdExists(msg);
        break;
      case "hover":
        result = await cmdHover(msg);
        break;
      case "pressKey":
        result = await cmdPressKey(msg);
        break;
      case "snapshot":
        result = await cmdSnapshot();
        break;
      case "captureSelectors":
        result = await cmdCaptureSelectors();
        break;
      case "ariaSnapshot":
        result = await cmdAriaSnapshot(msg);
        break;
      case "clickRef":
        result = await cmdClickRef(msg);
        break;
      case "typeRef":
        result = await cmdTypeRef(msg);
        break;
      case "recording.start":
        result = await cmdRecordingStart();
        break;
      case "recording.stop":
        result = await cmdRecordingStop();
        break;
      case "status":
        broadcastStatus();
        return;
      case "focus":
        result = await cmdFocus();
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }

    send({ ok: true, requestId, result });
  } catch (e) {
    send({ ok: false, requestId, error: e.message });
  }
}

async function cmdConnect(msg) {
  const tabId = msg.tabId;
  let targetTab;

  if (tabId) {
    targetTab = await chrome.tabs.get(tabId);
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found");
    targetTab = tab;
  }

  // Check for restricted URLs before attempting to attach
  const restrictedPrefixes = ["chrome://", "chrome-extension://", "devtools://", "edge://", "about:"];
  const isRestricted = restrictedPrefixes.some(prefix => targetTab.url?.startsWith(prefix));
  if (isRestricted) {
    throw new Error(`Cannot connect to restricted URL: ${targetTab.url}. Navigate to a regular webpage first.`);
  }

  await attachDebugger(targetTab.id);

  if (!connectedTabId) throw new Error("Failed to connect to tab");

  broadcastStatus();
  return { tabId: connectedTabId, url: targetTab.url };
}

async function cmdFocus() {
  if (!connectedTabId) throw new Error("No tab connected");

  // Get the tab to find its window
  const tab = await chrome.tabs.get(connectedTabId);

  // Focus the window containing the tab
  await chrome.windows.update(tab.windowId, { focused: true });

  // Activate the tab within the window
  await chrome.tabs.update(connectedTabId, { active: true });

  return { focused: true, tabId: connectedTabId };
}

async function cmdDisconnect() {
  await detachDebugger();
  broadcastStatus();
  return { disconnected: true };
}

async function cmdNavigate(msg) {
  if (!connectedTabId) throw new Error("No browser connected");

  await chrome.tabs.update(connectedTabId, { url: msg.url });

  // Wait for navigation to complete
  return new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === connectedTabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ url: msg.url });
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout after 30s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ url: msg.url, timeout: true });
    }, 30000);
  });
}

async function cmdClick(msg) {
  const { selector } = msg;
  const coords = await getElementCoordinates(selector);

  // Move mouse (CDP uses CSS pixels, same as getBoundingClientRect)
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: coords.x,
    y: coords.y,
  });

  // Click sequence: down, up
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: coords.x,
    y: coords.y,
    button: "left",
    clickCount: 1,
  });

  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: coords.x,
    y: coords.y,
    button: "left",
    clickCount: 1,
  });

  return { clicked: selector, x: coords.x, y: coords.y };
}

async function cmdType(msg) {
  const { selector, text, clear = true, submit = false } = msg;

  // First click to focus
  await cmdClick({ selector });

  // Clear existing content if requested
  if (clear) {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 2, // Ctrl/Cmd
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: 2,
    });
  }

  // Insert text directly (faster than individual keystrokes)
  await cdp("Input.insertText", { text });

  // Press Enter if submit requested
  if (submit) {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
    });
  }

  return { typed: text, selector };
}

async function cmdScroll(msg) {
  const { direction = "down", amount = 300, selector } = msg;

  let x = 0, y = 0;

  if (selector) {
    const coords = await getElementCoordinates(selector);
    x = coords.x;
    y = coords.y;
  } else if (lastMousePosition) {
    // Use last hover position (enables hover-then-scroll pattern)
    x = lastMousePosition.x;
    y = lastMousePosition.y;
  } else {
    // Fallback to center of viewport
    const metrics = await cdp("Page.getLayoutMetrics");
    x = metrics.visualViewport.clientWidth / 2;
    y = metrics.visualViewport.clientHeight / 2;
  }

  const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
  const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;

  await cdp("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x,
    y,
    deltaX,
    deltaY,
  });

  return { scrolled: direction, amount, x, y };
}

async function cmdExtract(msg) {
  const { selector } = msg;
  const result = await sendToContentScript("extract", { selector });
  return { text: result.text };
}

async function cmdExtractAll(msg) {
  const { selector, separator } = msg;
  const result = await sendToContentScript("extractAll", { selector, separator });
  return { text: result.text };
}

async function cmdScreenshot() {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    quality: 80,
  });

  return { image: `data:image/png;base64,${result.data}` };
}

async function cmdWait(msg) {
  const { ms, selector, timeout = 30000 } = msg;

  if (ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { waited: ms };
  }

  if (selector) {
    const startTime = Date.now();
    const endTime = startTime + timeout;

    // Retry loop to handle page navigation
    while (Date.now() < endTime) {
      try {
        // Wait for page to be ready (in case of navigation)
        await waitForPageReady();

        const remainingTimeout = Math.max(1000, endTime - Date.now());
        const result = await sendToContentScript("waitForElement", {
          selector,
          timeout: remainingTimeout,
        });

        if (result.found) {
          return { found: true };
        }

        // Element not found within timeout, but no error - break out
        break;
      } catch (e) {
        // If content script failed (likely due to navigation), wait and retry
        if (Date.now() < endTime) {
          console.log(`[SideButton] waitForElement failed, retrying: ${e.message}`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw e;
      }
    }

    throw new Error(`Timeout waiting for element: ${selector}`);
  }

  return { waited: 0 };
}

async function cmdExists(msg) {
  const { selector, timeout = 1000 } = msg;

  try {
    await waitForPageReady();
    const result = await sendToContentScript("exists", { selector, timeout });
    return { exists: result.exists };
  } catch (e) {
    // On error, return false instead of failing
    console.log(`[SideButton] exists check failed: ${e.message}`);
    return { exists: false };
  }
}

// Wait for the page to be in a ready state
async function waitForPageReady() {
  if (!connectedTabId) return;

  // Check if page is still loading
  const tab = await chrome.tabs.get(connectedTabId);
  if (tab.status === "loading") {
    // Wait for page to complete loading
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === connectedTabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout after 10s
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
    // Give content script time to initialize
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function cmdHover(msg) {
  const { selector } = msg;
  const coords = await getElementCoordinates(selector);

  await cdp("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: coords.x,
    y: coords.y,
  });

  // Track position for subsequent scroll commands
  lastMousePosition = { x: coords.x, y: coords.y };

  return { hovered: selector, x: coords.x, y: coords.y };
}

async function cmdPressKey(msg) {
  const { key, selector } = msg;

  // If selector provided, focus that element first
  if (selector) {
    await sendToContentScript("focus", { selector });
    await new Promise((r) => setTimeout(r, 100));
  }

  // Map common key names to CDP key info
  // Based on Browser MCP implementation
  const keyMap = {
    // Modifier keys
    Alt: { key: "Alt", code: "AltLeft", keyCode: 18, location: 1 },
    Control: { key: "Control", code: "ControlLeft", keyCode: 17, location: 1 },
    Ctrl: { key: "Control", code: "ControlLeft", keyCode: 17, location: 1 },
    Meta: { key: "Meta", code: "MetaLeft", keyCode: 91, location: 1 },
    Cmd: { key: "Meta", code: "MetaLeft", keyCode: 91, location: 1 },
    Command: { key: "Meta", code: "MetaLeft", keyCode: 91, location: 1 },
    Shift: { key: "Shift", code: "ShiftLeft", keyCode: 16, location: 1 },
    // Navigation keys
    Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Space: { key: " ", code: "Space", keyCode: 32, text: " " },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    // Function keys
    F1: { key: "F1", code: "F1", keyCode: 112 },
    F2: { key: "F2", code: "F2", keyCode: 113 },
    F3: { key: "F3", code: "F3", keyCode: 114 },
    F4: { key: "F4", code: "F4", keyCode: 115 },
    F5: { key: "F5", code: "F5", keyCode: 116 },
    F6: { key: "F6", code: "F6", keyCode: 117 },
    F7: { key: "F7", code: "F7", keyCode: 118 },
    F8: { key: "F8", code: "F8", keyCode: 119 },
    F9: { key: "F9", code: "F9", keyCode: 120 },
    F10: { key: "F10", code: "F10", keyCode: 121 },
    F11: { key: "F11", code: "F11", keyCode: 122 },
    F12: { key: "F12", code: "F12", keyCode: 123 },
  };

  // Modifier values for CDP
  const modifierFlags = {
    Alt: 1,
    Control: 2,
    Ctrl: 2,
    Meta: 4,
    Cmd: 4,
    Command: 4,
    Shift: 8,
  };

  // Support key combinations like "Ctrl+A", "Shift+Enter"
  const keys = key.split("+").map((k) => k.trim());
  let modifiers = 0;

  // Press all keys down (modifiers first)
  for (const k of keys) {
    const info = keyMap[k] || {
      key: k,
      code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
      keyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0,
      text: k.length === 1 ? k : undefined,
    };

    // Track modifiers
    if (modifierFlags[k]) {
      modifiers |= modifierFlags[k];
    }

    await cdp("Input.dispatchKeyEvent", {
      type: info.text ? "keyDown" : "rawKeyDown",
      modifiers,
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
      nativeVirtualKeyCode: info.keyCode,
      text: info.text,
      unmodifiedText: info.text,
      location: info.location || 0,
    });
  }

  // Release all keys in reverse order
  const reversedKeys = [...keys].reverse();
  for (const k of reversedKeys) {
    const info = keyMap[k] || {
      key: k,
      code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
      keyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0,
    };

    // Remove modifier flag on release
    if (modifierFlags[k]) {
      modifiers &= ~modifierFlags[k];
    }

    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers,
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
      nativeVirtualKeyCode: info.keyCode,
      location: info.location || 0,
    });
  }

  return { pressed: key, selector: selector || null };
}

async function cmdSnapshot() {
  const result = await sendToContentScript("snapshot");
  return result;
}

async function cmdCaptureSelectors() {
  const result = await sendToContentScript("captureSelectors");
  return result;
}

async function cmdAriaSnapshot(msg = {}) {
  const { includeContent = false } = msg;
  const result = await sendToContentScript("ariaSnapshot", { includeContent });
  return { snapshot: result.snapshot, refCount: result.refCount };
}

async function cmdClickRef(msg) {
  const { ref } = msg;
  const coords = await sendToContentScript("getCoordinatesByRef", { ref: parseInt(ref, 10) });

  if (!coords.found) {
    throw new Error(coords.error || `Element not found for ref=${ref}`);
  }

  // Move mouse
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: coords.x,
    y: coords.y,
  });

  // Click sequence: down, up
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: coords.x,
    y: coords.y,
    button: "left",
    clickCount: 1,
  });

  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: coords.x,
    y: coords.y,
    button: "left",
    clickCount: 1,
  });

  return { clicked: `ref=${ref}`, x: coords.x, y: coords.y };
}

async function cmdTypeRef(msg) {
  const { ref, text, clear = true, submit = false } = msg;

  // First click to focus using ref
  await cmdClickRef({ ref });

  // Clear existing content if requested
  if (clear) {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 2, // Ctrl/Cmd
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: 2,
    });
  }

  // Insert text directly
  await cdp("Input.insertText", { text });

  // Press Enter if submit requested
  if (submit) {
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
    });
  }

  return { typed: text, ref: `ref=${ref}` };
}

async function cmdRecordingStart() {
  isRecording = true;
  await sendToContentScript("recording.start");
  broadcastStatus();
  return { recording: true };
}

async function cmdRecordingStop() {
  isRecording = false;
  await sendToContentScript("recording.stop");
  broadcastStatus();
  return { recording: false };
}

// ============================================================================
// Content Script Communication
// ============================================================================

async function ensureContentScriptInjected(tabId) {
  // Check if tab is on a restricted URL before attempting injection
  const tab = await chrome.tabs.get(tabId);
  const restrictedPrefixes = ["chrome://", "chrome-extension://", "devtools://", "edge://", "about:"];
  const isRestricted = restrictedPrefixes.some(prefix => tab.url?.startsWith(prefix));
  if (isRestricted) {
    throw new Error(`Cannot operate on restricted URL: ${tab.url}. Please navigate to a regular webpage first.`);
  }

  try {
    // Try to ping the content script first
    const response = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    if (response?.pong) return true;
  } catch (e) {
    // Content script not loaded, inject it
    console.log("[SideButton] Content script not found, injecting...");
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    console.log("[SideButton] Content script injected");
    // Give it a moment to initialize
    await new Promise((r) => setTimeout(r, 100));
    return true;
  } catch (e) {
    console.error("[SideButton] Failed to inject content script:", e.message);
    throw new Error(`Cannot inject content script: ${e.message}`);
  }
}

async function sendToContentScript(action, data = {}) {
  if (!connectedTabId) throw new Error("No browser connected");

  // Ensure content script is loaded before sending
  await ensureContentScriptInjected(connectedTabId);

  return new Promise((resolve, reject) => {
    const requestId = ++requestCounter;
    pendingRequests.set(requestId, { resolve, reject });

    chrome.tabs.sendMessage(connectedTabId, {
      action,
      requestId,
      ...data,
    }).catch((e) => {
      // Handle send failure
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Failed to send to content script: ${e.message}`));
      }
    });

    // Timeout
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error("Content script timeout"));
      }
    }, 30000);
  });
}

async function getElementCoordinates(selector) {
  const result = await sendToContentScript("getCoordinates", { selector });
  if (!result.found) {
    throw new Error(`Element not found: ${selector}`);
  }
  return result;
}

// Handle responses from content script
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.responseId && pendingRequests.has(msg.responseId)) {
    const { resolve, reject } = pendingRequests.get(msg.responseId);
    pendingRequests.delete(msg.responseId);

    if (msg.error) {
      reject(new Error(msg.error));
    } else {
      resolve(msg);
    }
    return;
  }

  // Handle recording events from content script
  if (msg.event && isRecording) {
    console.log("[SideButton] Forwarding recording event to server:", msg.event, msg.selector || msg.url);
    send(msg); // Forward to server
  }

  // Handle embed button clicks from content script (V2: with param mapping)
  if (msg.action === "embedClick") {
    handleEmbedClick(msg.workflowId, msg.context, msg.paramMap)
      .then((result) => {
        // Send result back to content script
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "embedResult",
            workflowId: msg.workflowId,
            buttonId: msg.buttonId,
            result,
          }).catch(() => {});
        }
      });
  }

  // Handle request for embed configs from content script
  if (msg.action === "requestEmbedConfigs") {
    console.log("[SideButton] requestEmbedConfigs from tab:", sender.tab?.id, sender.tab?.url);
    if (sender.tab?.url) {
      sendEmbedConfigsToTab(sender.tab.id, sender.tab.url);
    }
  }
});

// ============================================================================
// Tab Event Handlers
// ============================================================================

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === connectedTabId) {
    detachDebugger();
    broadcastStatus();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only send navigate events when recording
  if (tabId === connectedTabId && changeInfo.url && isRecording) {
    send({
      event: "navigate",
      url: changeInfo.url,
    });
  }

  // Re-initialize recording on content script after navigation completes
  if (tabId === connectedTabId && changeInfo.status === "complete" && isRecording) {
    try {
      await sendToContentScript("recording.start");
      console.log("[SideButton] Re-initialized recording after navigation");
    } catch (e) {
      console.warn("[SideButton] Failed to re-initialize recording:", e.message);
    }
  }

  // Send embed configs when page finishes loading - only for active tab
  // Content scripts in background tabs will request configs when they become active
  if (changeInfo.status === "complete" && tab.url && tab.active) {
    sendEmbedConfigsToTab(tabId, tab.url);
  }
});

// ============================================================================
// Popup Communication
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.from === "popup") {
    if (msg.action === "getStatus") {
      sendResponse({
        connected: !!connectedTabId,
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        tabId: connectedTabId,
        recording: isRecording,
      });
    } else if (msg.action === "connect") {
      cmdConnect({})
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    } else if (msg.action === "disconnect") {
      cmdDisconnect()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    } else if (msg.action === "startRecording") {
      cmdRecordingStart()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    } else if (msg.action === "stopRecording") {
      cmdRecordingStop()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ error: e.message }));
      return true;
    } else if (msg.action === "getEmbedEnabled") {
      sendResponse({ enabled: embedEnabled });
    } else if (msg.action === "setEmbedEnabled") {
      embedEnabled = msg.enabled;
      chrome.storage.local.set({ embedEnabled });
      embedConfigCache.clear();
      broadcastEmbedStatus();
      sendResponse({ enabled: embedEnabled });
    }
  }
});

// ============================================================================
// Embedded Workflow Buttons
// ============================================================================

const APP_API_URL = "http://localhost:9876";

// Match URL against embed config's org/repo filters
// Returns true if the URL matches (or no filters are set)
function matchesOrgRepo(url, embedConfig) {
  const { org, repo } = embedConfig || {};

  // Empty = match all (default behavior)
  if (!org && !repo) return true;

  try {
    // Extract org/repo from URL path (works for GitHub, GitLab, etc.)
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const urlOrg = pathParts[0] || '';
    const urlRepo = pathParts[1] || '';

    // Match org if specified (case-insensitive)
    if (org && org.toLowerCase() !== urlOrg.toLowerCase()) return false;

    // Match repo if specified (case-insensitive)
    if (repo && repo.toLowerCase() !== urlRepo.toLowerCase()) return false;

    return true;
  } catch {
    return false;
  }
}

// Fetch embed configs for a domain from the app
async function fetchEmbedConfigs(domain) {
  console.log("[SideButton] fetchEmbedConfigs for domain:", domain, "enabled:", embedEnabled);
  if (!embedEnabled) return [];

  // Check cache first
  if (embedConfigCache.has(domain)) {
    console.log("[SideButton] Using cached configs for:", domain);
    return embedConfigCache.get(domain);
  }

  try {
    const url = `${APP_API_URL}/api/embed-workflows?domain=${encodeURIComponent(domain)}`;
    console.log("[SideButton] Fetching embed configs from:", url);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[SideButton] Failed to fetch embed configs:", response.status);
      return [];
    }
    const data = await response.json();
    console.log("[SideButton] Received embed configs:", data.workflows?.length || 0, data);
    embedConfigCache.set(domain, data.workflows || []);
    return data.workflows || [];
  } catch (e) {
    // App not running or network error
    console.log("[SideButton] Could not fetch embed configs:", e.message);
    return [];
  }
}

// Send embed configs to a tab's content script
async function sendEmbedConfigsToTab(tabId, url) {
  console.log("[SideButton] sendEmbedConfigsToTab:", tabId, url, "enabled:", embedEnabled);
  if (!embedEnabled) return;

  // Skip restricted URLs early - cannot inject content scripts
  const restrictedPrefixes = ["chrome://", "chrome-extension://", "devtools://", "edge://", "about:"];
  if (restrictedPrefixes.some(prefix => url?.startsWith(prefix))) {
    return; // Silently skip - this is expected behavior
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const allConfigs = await fetchEmbedConfigs(domain);

    // Filter configs by org/repo match
    const configs = allConfigs.filter((config) => matchesOrgRepo(url, config.embed));

    console.log("[SideButton] Configs to send:", configs.length, "(filtered from", allConfigs.length, ") for URL:", url);
    if (configs.length === 0) return;

    // Ensure content script is injected
    await ensureContentScriptInjected(tabId);

    // Send configs to content script
    console.log("[SideButton] Sending embedConfigs to tab:", tabId);
    chrome.tabs.sendMessage(tabId, {
      action: "embedConfigs",
      configs,
      connected: ws && ws.readyState === WebSocket.OPEN,
    }).catch((e) => {
      console.log("[SideButton] Failed to send embedConfigs:", e.message);
    });
  } catch (e) {
    console.log("[SideButton] sendEmbedConfigsToTab error:", e.message);
  }
}

// Broadcast connection status to active tab only for embed button visibility
// We only need to update the tab user is actively viewing
function broadcastEmbedStatus() {
  const connected = ws && ws.readyState === WebSocket.OPEN;

  // Only send to active tab in current window
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url) return;

    // Skip restricted URLs
    const restrictedPrefixes = ["chrome://", "chrome-extension://", "devtools://", "edge://", "about:"];
    if (restrictedPrefixes.some(prefix => tab.url.startsWith(prefix))) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: "embedStatus",
      connected,
      enabled: embedEnabled,
    }).catch(() => {});
  });
}

// Resolve context value with dot notation support for arrays
// e.g., "_path.0" -> context._path[0], "_path.1" -> context._path[1]
function resolveContextValue(context, key) {
  if (!context) return undefined;

  // Handle dot notation: "_path.0" -> context._path[0]
  if (key.includes('.')) {
    const [base, index] = key.split('.');
    const arr = context[base];
    if (Array.isArray(arr)) {
      const idx = parseInt(index, 10);
      if (!isNaN(idx) && idx >= 0 && idx < arr.length) {
        return arr[idx];
      }
    }
    return undefined;
  }

  return context[key];
}

// Handle embed button click - run workflow via MCP HTTP API
// V2: Apply param_map to map extracted context to workflow params
async function handleEmbedClick(workflowId, context, paramMap) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { error: "App not connected" };
  }

  try {
    // V2: Apply param_map to create workflow params
    let params = {};

    if (paramMap && typeof paramMap === "object") {
      // param_map format: { paramName: "{{contextKey}}" or "literal" }
      // e.g., { topic: "{{topic}}", style: "concise" }
      for (const [paramName, valueTemplate] of Object.entries(paramMap)) {
        // Check if value is a template like "{{contextKey}}"
        const templateMatch = String(valueTemplate).match(/^\{\{(.+?)\}\}$/);
        if (templateMatch) {
          // Extract context key from template and resolve it
          const contextKey = templateMatch[1];
          const value = resolveContextValue(context, contextKey);
          if (value !== undefined) {
            params[paramName] = value;
          }
        } else {
          // Use literal value
          params[paramName] = valueTemplate;
        }
      }
      console.log("[SideButton] Mapped params:", params, "from context:", context);
    } else {
      // Fallback: pass context directly (for V1 compatibility)
      params = context || {};
    }

    // Build MCP JSON-RPC request to run workflow
    const mcpRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "run_workflow",
        arguments: {
          workflow_id: workflowId,
          params: params,
        },
      },
    };

    const response = await fetch(`${APP_API_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log("[SideButton] Workflow triggered:", workflowId, result);

    // Check for MCP error response
    if (result.error) {
      return { error: result.error.message || "Workflow failed" };
    }

    // Extract content from MCP result
    // Format: { result: { content: [{ type: "text", text: "..." }] } }
    let content = null;
    if (result.result?.content) {
      const textContent = result.result.content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("\n");

      if (textContent) {
        // Clean up: remove "Run ID: ..." prefix line if present
        content = textContent.replace(/^Run ID:.*\n+/i, "").trim();
      }
    }

    return { success: true, content };
  } catch (e) {
    console.error("[SideButton] Failed to run workflow:", e);
    return { error: e.message };
  }
}

// Load embed enabled setting from storage
chrome.storage.local.get(["embedEnabled"], (result) => {
  embedEnabled = result.embedEnabled !== false; // Default to true
});

// ============================================================================
// Initialization
// ============================================================================

connect();
console.log("[SideButton] Background service worker started");
