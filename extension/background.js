// SideButton Browser Extension - Background Service Worker
// Handles WebSocket communication with server and CDP-based input simulation
// Supports both local server mode and hosted (Claude Desktop) mode

const SERVER_WS_URL = "ws://localhost:9876/ws";
const HOSTED_WS_URL = "wss://sidebutton.com/api/mcp/ws";
const RECONNECT_DELAY = 3000;

// Local mode state
let ws = null;
let connectedTabId = null;
let debuggerAttached = false;
let isRecording = false;
let pendingRequests = new Map(); // requestId -> { resolve, reject }
let requestCounter = 0;
let lastMousePosition = null; // Track last hover position for scroll targeting
let embedConfigCache = new Map(); // domain -> configs[]

// Hosted mode state
let hostedWs = null;
let hostedMode = false;
let hostedEmail = null;
let hostedUserCode = null;
let hostedMcpUrl = null;

// Feature toggle state
let embedButtonsEnabled = true;
let chatPanelEnabled = true;

// URLs where Chrome blocks debugger/content script access
const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
  "chrome-search://",
  "chrome-untrusted://",
  "chrome-distiller://",
];

const RESTRICTED_URL_PATTERNS = [
  "https://chromewebstore.google.com",
  "https://chrome.google.com/webstore",
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix)) ||
    RESTRICTED_URL_PATTERNS.some(pattern => url.startsWith(pattern))
  );
}

// ============================================================================
// Chat Panel State Management
// ============================================================================

const tabStates = new Map(); // tabId -> { messages, isOpen, isLoading, ... }

function getTabState(tabId) {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, {
      isOpen: false,
      messages: [],
      isLoading: false,
      buttonPosition: { bottom: 24 },
      contextOptions: {
        includeUrl: true,
        includeTitle: false,
        includeScreenshot: false,
      },
    });
  }
  return tabStates.get(tabId);
}

function updateTabState(tabId, updates) {
  const state = getTabState(tabId);
  Object.assign(state, updates);
  // Notify content script of state change
  chrome.tabs.sendMessage(tabId, {
    action: "panel:stateChanged",
    data: state,
  }).catch(() => {}); // Ignore if tab no longer exists
}

function addMessageToTab(tabId, message) {
  const state = getTabState(tabId);
  state.messages.push(message);
  // Notify content script
  chrome.tabs.sendMessage(tabId, {
    action: "panel:messageAdded",
    data: message,
  }).catch(() => {});
}

function updateMessageInTab(tabId, messageId, updates) {
  const state = getTabState(tabId);
  const msg = state.messages.find((m) => m.id === messageId);
  if (msg) {
    Object.assign(msg, updates);
    chrome.tabs.sendMessage(tabId, {
      action: "panel:messageUpdated",
      data: { id: messageId, ...updates },
    }).catch(() => {});
  }
}

// Generate unique message ID
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Chat Panel Message Handlers
// ============================================================================

async function handlePanelMessage(msg, sender, sendResponse) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ error: "No tab ID" });
    return true;
  }

  switch (msg.action) {
    case "panel:getState":
      sendResponse(getTabState(tabId));
      return true;

    case "panel:setState":
      updateTabState(tabId, msg.data);
      sendResponse({ ok: true });
      return true;

    case "panel:sendMessage":
      handlePanelSendMessage(tabId, msg.data);
      sendResponse({ ok: true });
      return true;

    case "panel:clearMessages":
      const state = getTabState(tabId);
      state.messages = [];
      updateTabState(tabId, { messages: [] });
      sendResponse({ ok: true });
      return true;

    case "panel:executeAction":
      handlePanelExecuteAction(tabId, msg.data);
      sendResponse({ ok: true });
      return true;

    case "panel:getMcpStatus":
      // Return connected MCPs based on settings and connection state
      handlePanelGetMcpStatus(sendResponse);
      return true;  // Will respond asynchronously

    case "panel:runWorkflow":
      // Run a workflow and return the result
      handlePanelRunWorkflow(tabId, msg.data, sendResponse);
      return true;  // Will respond asynchronously

    case "panel:createJiraIssue":
      // Create Jira issue via Atlassian MCP
      handlePanelCreateJiraIssue(tabId, msg.data, sendResponse);
      return true;  // Will respond asynchronously

    case "panel:captureElementScreenshot":
      // Capture screenshot of element bounds
      handlePanelCaptureElementScreenshot(tabId, msg.data, sendResponse);
      return true;  // Will respond asynchronously
  }

  return false;
}

// Handle user sending a message from the chat panel
async function handlePanelSendMessage(tabId, data) {
  const { text, context } = data;
  const state = getTabState(tabId);

  // Add user message
  const userMessage = {
    id: generateMessageId(),
    role: "user",
    content: text,
    timestamp: Date.now(),
    context,
  };
  addMessageToTab(tabId, userMessage);

  // Set loading state
  updateTabState(tabId, { isLoading: true });

  try {
    // Build conversation for LLM
    // Include pickedElements and pageInfo for context messages
    const messages = state.messages.map((m) => {
      if (m.role === 'context') {
        // Log context message data for debugging
        console.log('[SideButton Background] Context message:', {
          hasPickedElements: !!m.pickedElements,
          elementCount: m.pickedElements?.length,
          elements: m.pickedElements?.map(e => ({
            label: e.label,
            hasText: !!e.text,
            textPreview: e.text?.substring(0, 30)
          }))
        });
        return {
          role: m.role,
          pickedElements: m.pickedElements,
          pageInfo: m.pageInfo,
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    // Call LLM via server (server handles tool execution)
    const assistantMessage = await callLLM(tabId, messages, null, context);

    // Add assistant message
    if (assistantMessage) {
      addMessageToTab(tabId, assistantMessage);
    }
  } catch (e) {
    console.error("[Panel] Error handling message:", e);
    // Add error message
    addMessageToTab(tabId, {
      id: generateMessageId(),
      role: "assistant",
      content: `Sorry, I encountered an error: ${e.message}`,
      timestamp: Date.now(),
    });
  } finally {
    updateTabState(tabId, { isLoading: false });
  }
}

// Handle running a workflow from the panel
async function handlePanelRunWorkflow(tabId, data, sendResponse) {
  const { workflowId, params } = data;

  console.log("[Panel] Running workflow:", workflowId, params);

  try {
    // Call the server to run the workflow
    const response = await fetch(`http://localhost:9876/api/workflows/${workflowId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Panel] Workflow API error:", response.status, errorText);
      sendResponse({
        success: false,
        error: `Server error: ${response.status} - ${errorText.substring(0, 200)}`,
      });
      return;
    }

    const result = await response.json();
    console.log("[Panel] Workflow result:", result);

    // Extract the message from the workflow output
    let message = result.message || result.outputMessage;
    let issueKey = null;

    // Try to extract issue key from the output
    if (message) {
      const keyMatch = message.match(/([A-Z]+-\d+)/);
      if (keyMatch) {
        issueKey = keyMatch[1];
      }
    }

    sendResponse({
      success: result.success !== false,
      message: message || "Workflow completed",
      issueKey,
      result,
    });
  } catch (e) {
    console.error("[Panel] Workflow execution failed:", e);

    // Check if it's a connection error
    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      sendResponse({
        success: false,
        error: "Cannot connect to SideButton server. Please make sure it is running.",
      });
    } else {
      sendResponse({
        success: false,
        error: e.message,
      });
    }
  }
}

// Handle getting MCP status - checks which external MCPs are enabled
async function handlePanelGetMcpStatus(sendResponse) {
  const connectedMcps = ["sidebutton"];

  try {
    // Check if server is running and get MCP settings
    const response = await fetch("http://localhost:9876/api/settings");
    if (response.ok) {
      const data = await response.json();
      const externalMcps = data.settings?.external_mcps || [];

      // Add enabled MCPs to the list
      for (const mcp of externalMcps) {
        if (mcp.enabled && mcp.name) {
          connectedMcps.push(mcp.name);
        }
      }
    }
  } catch (e) {
    console.log("[Panel] Could not fetch MCP settings:", e.message);
    // In hosted mode, assume Atlassian is available
    if (hostedMode) {
      connectedMcps.push("atlassian");
    }
  }

  sendResponse({ connectedMcps });
}

// Handle creating a Jira issue via Atlassian MCP
async function handlePanelCreateJiraIssue(tabId, data, sendResponse) {
  const { elementText, pageUrl, pageTitle, screenshots } = data;

  console.log("[Panel] Creating Jira issue via Atlassian MCP");

  try {
    // Step 1: Get Atlassian MCP config from server
    const configResponse = await fetch("http://localhost:9876/api/settings/mcp/atlassian");
    const config = await configResponse.json();

    if (!config.enabled) {
      sendResponse({
        success: false,
        error: "Atlassian MCP not enabled. Enable it in Dashboard Settings > External MCPs.",
      });
      return;
    }

    const { cloudId, defaultProject, defaultIssueType } = config.tools?.createIssue || {};

    if (!cloudId || !defaultProject) {
      sendResponse({
        success: false,
        error: "Atlassian MCP not configured. Set cloudId and defaultProject in Dashboard Settings.",
      });
      return;
    }

    // Step 2: Run jira_prepare_issue_fields workflow to convert element text to structured fields
    console.log("[Panel] Running jira_prepare_issue_fields workflow...");
    const workflowResponse = await fetch("http://localhost:9876/api/workflows/jira_prepare_issue_fields/run?sync=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        params: {
          element_text: elementText,
          page_url: pageUrl || "Unknown",
          page_title: pageTitle || "Unknown",
        }
      })
    });

    if (!workflowResponse.ok) {
      throw new Error(`Workflow error: ${workflowResponse.status}`);
    }

    const workflowResult = await workflowResponse.json();
    console.log("[Panel] Workflow result:", workflowResult);

    let issueFields;
    try {
      // Parse the issue_fields from workflow output
      const fieldsJson = workflowResult.variables?.issue_fields || workflowResult.variables?.issue_fields_json;
      if (fieldsJson) {
        const jsonMatch = fieldsJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          issueFields = JSON.parse(jsonMatch[0]);
        }
      }
      if (!issueFields) {
        throw new Error("No issue fields in workflow output");
      }
    } catch (parseError) {
      console.error("[Panel] Failed to parse workflow output:", workflowResult);
      // Fallback to basic fields
      issueFields = {
        summary: elementText.substring(0, 100),
        description: `Content from ${pageUrl}\n\n${elementText}`,
      };
    }

    // Step 3: Call Atlassian MCP to create the issue
    // This uses the mcp__atlassian__createJiraIssue tool via the server
    const createResponse = await fetch("http://localhost:9876/api/mcp/atlassian/createJiraIssue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cloudId,
        projectKey: defaultProject,
        issueTypeName: defaultIssueType || "Task",
        summary: issueFields.summary,
        description: issueFields.description,
        screenshots: screenshots || [], // Pass screenshots for attachment
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Atlassian API error: ${createResponse.status} - ${errorText}`);
    }

    const createResult = await createResponse.json();
    console.log("[Panel] Jira issue created:", createResult);

    // Handle different response formats
    if (createResult.transport === "claude-code") {
      // Claude Code will handle this via MCP tools
      sendResponse({
        success: true,
        issueKey: "Pending",
        cloudId,
        message: "Issue creation initiated via Claude Code MCP",
        mcpTool: createResult.tool,
        mcpParams: createResult.params,
      });
    } else if (createResult.key) {
      // Direct API response with issue key
      sendResponse({
        success: true,
        issueKey: createResult.key,
        issueUrl: `https://${cloudId}/browse/${createResult.key}`,
        cloudId,
      });
    } else if (createResult.result?.key) {
      // Wrapped response
      sendResponse({
        success: true,
        issueKey: createResult.result.key,
        issueUrl: `https://${cloudId}/browse/${createResult.result.key}`,
        cloudId,
      });
    } else {
      sendResponse({
        success: false,
        error: "Unexpected response format from Atlassian MCP",
      });
    }
  } catch (e) {
    console.error("[Panel] Jira issue creation failed:", e);

    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      sendResponse({
        success: false,
        error: "Cannot connect to SideButton server. Please make sure it is running.",
      });
    } else {
      sendResponse({
        success: false,
        error: e.message,
      });
    }
  }
}

// ============================================================================
// Screenshot Capture
// ============================================================================

async function handlePanelCaptureElementScreenshot(tabId, data, sendResponse) {
  const { bounds } = data; // { x, y, width, height, devicePixelRatio }

  try {
    // Capture visible tab as PNG
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

    // Crop to element bounds using OffscreenCanvas
    const cropped = await cropImage(dataUrl, bounds);

    sendResponse({ screenshot: cropped });
  } catch (e) {
    console.error("[Panel] Screenshot capture failed:", e);
    sendResponse({ error: e.message });
  }
}

async function cropImage(dataUrl, bounds) {
  // Fetch the image data
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  // Scale bounds by device pixel ratio
  const dpr = bounds.devicePixelRatio || 1;
  const srcX = Math.round(bounds.x * dpr);
  const srcY = Math.round(bounds.y * dpr);
  const srcWidth = Math.round(bounds.width * dpr);
  const srcHeight = Math.round(bounds.height * dpr);

  // Create offscreen canvas at element size (not scaled)
  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext("2d");

  // Draw cropped region, scaling down from high-DPI source
  ctx.drawImage(
    imageBitmap,
    srcX, srcY, srcWidth, srcHeight,  // Source rect (scaled)
    0, 0, bounds.width, bounds.height  // Dest rect (logical pixels)
  );

  // Convert to PNG blob and then base64
  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToBase64(croppedBlob);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// LLM Integration (via local server)
// ============================================================================

const CHAT_API_URL = "http://localhost:9876/api/chat";

// Call the LLM via the local server
async function callLLM(tabId, messages, pageContext, userContext) {
  // Build context for the server
  const context = {};
  if (userContext?.url) {
    context.url = userContext.url;
  }
  if (userContext?.title) {
    context.title = userContext.title;
  }

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages,
        context: context,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    // If server returned tool calls, they were already executed
    // Just return the final response
    return {
      id: generateMessageId(),
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls,
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error("[Panel] Chat API call failed:", e);

    // Check if it's a connection error (server not running)
    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      return {
        id: generateMessageId(),
        role: "assistant",
        content: "Cannot connect to SideButton server. Please make sure the SideButton app is running on localhost:9876.",
        timestamp: Date.now(),
      };
    }

    throw e;
  }
}

// Handle action button clicks in chat messages
async function handlePanelExecuteAction(tabId, data) {
  const { messageId, actionId } = data;
  // Future: handle suggested action buttons
  console.log("[Panel] Execute action:", messageId, actionId);
}

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

      // Handle workflow-installed event from server (one-click install)
      if (msg.type === 'workflow-installed') {
        handleWorkflowInstalled(msg.data);
        return;
      }

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
// Hosted Mode WebSocket Connection
// ============================================================================

function connectHosted() {
  if (hostedWs && hostedWs.readyState === WebSocket.OPEN) return;

  console.log("[SideButton] Connecting to hosted server...");
  hostedWs = new WebSocket(HOSTED_WS_URL);

  hostedWs.onopen = () => {
    console.log("[SideButton] Connected to hosted MCP server");
    hostedMode = true;
  };

  hostedWs.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "mcp_request") {
        // Execute MCP method locally and send response back
        try {
          const result = await executeHostedMcpMethod(msg.method, msg.params);
          hostedWs.send(JSON.stringify({
            type: "mcp_response",
            id: msg.id,
            originalId: msg.originalId,
            result
          }));
        } catch (error) {
          hostedWs.send(JSON.stringify({
            type: "mcp_error",
            id: msg.id,
            originalId: msg.originalId,
            error: { code: -32603, message: error.message }
          }));
        }
      } else if (msg.type === "ping") {
        hostedWs.send(JSON.stringify({ type: "heartbeat" }));
      }
    } catch (e) {
      console.error("[SideButton] Failed to parse hosted message:", e);
    }
  };

  hostedWs.onclose = () => {
    console.log("[SideButton] Hosted connection closed");
    hostedWs = null;
    // Reconnect if still in hosted mode
    chrome.storage.local.get(["mode"], (data) => {
      if (data.mode === "hosted") {
        setTimeout(connectHosted, RECONNECT_DELAY);
      }
    });
  };

  hostedWs.onerror = (err) => {
    console.error("[SideButton] Hosted WebSocket error:", err);
  };
}

function disconnectHosted() {
  hostedMode = false;
  hostedEmail = null;
  hostedUserCode = null;
  hostedMcpUrl = null;
  if (hostedWs) {
    hostedWs.close();
    hostedWs = null;
  }
}

// Execute MCP method for hosted mode (proxied from Claude Desktop)
async function executeHostedMcpMethod(method, params) {
  console.log("[SideButton] Executing hosted MCP method:", method, params);

  // Ensure browser is connected for browser operations
  if (!connectedTabId && method !== "get_browser_status" && method !== "initialize" && method !== "tools/list") {
    // Auto-connect to active tab for hosted mode
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && !isRestrictedUrl(tab.url)) {
        await attachDebugger(tab.id);
      }
    } catch (e) {
      console.log("[SideButton] Could not auto-connect:", e.message);
    }
  }

  switch (method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "sidebutton", version: chrome.runtime.getManifest().version }
      };

    case "tools/list":
      return {
        tools: [
          { name: "navigate", description: "Navigate to URL", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
          { name: "click", description: "Click element", inputSchema: { type: "object", properties: { selector: { type: "string" }, ref: { type: "number" }, element: { type: "string" } } } },
          { name: "type", description: "Type text", inputSchema: { type: "object", properties: { text: { type: "string" }, selector: { type: "string" }, ref: { type: "number" }, submit: { type: "boolean" } }, required: ["text"] } },
          { name: "snapshot", description: "Get accessibility snapshot", inputSchema: { type: "object", properties: { includeContent: { type: "boolean" } } } },
          { name: "screenshot", description: "Take screenshot", inputSchema: { type: "object", properties: {} } },
          { name: "scroll", description: "Scroll page", inputSchema: { type: "object", properties: { direction: { type: "string" }, amount: { type: "number" } }, required: ["direction"] } },
          { name: "get_browser_status", description: "Get browser status", inputSchema: { type: "object", properties: {} } },
          { name: "hover", description: "Hover element", inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } },
          { name: "extract", description: "Extract text", inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } },
          { name: "capture_page", description: "Capture page selectors", inputSchema: { type: "object", properties: {} } },
          { name: "injectCSS", description: "Inject CSS styles into the page", inputSchema: { type: "object", properties: { css: { type: "string", description: "CSS rules to inject" }, id: { type: "string", description: "Optional style element ID for replacement" } }, required: ["css"] } },
        ]
      };

    case "tools/call":
      return await executeToolCall(params?.name, params?.arguments);

    // Direct method calls (for compatibility)
    case "navigate":
      return await cmdNavigate({ url: params?.url });
    case "click":
      if (params?.ref !== undefined) {
        return await cmdClickRef({ ref: params.ref });
      }
      return await cmdClick({ selector: params?.selector });
    case "type":
      if (params?.ref !== undefined) {
        return await cmdTypeRef({ ref: params.ref, text: params?.text, submit: params?.submit });
      }
      return await cmdType({ selector: params?.selector, text: params?.text, submit: params?.submit });
    case "snapshot":
      return await cmdAriaSnapshot({ includeContent: params?.includeContent });
    case "screenshot":
      return await cmdScreenshot();
    case "scroll":
      return await cmdScroll({ direction: params?.direction, amount: params?.amount });
    case "get_browser_status":
      return { connected: !!connectedTabId, tabId: connectedTabId };
    case "hover":
      return await cmdHover({ selector: params?.selector });
    case "extract":
      return await cmdExtract({ selector: params?.selector });
    case "capture_page":
      return await cmdCaptureSelectors();
    case "injectCSS":
      return await cmdInjectCSS({ css: params?.css, id: params?.id });

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// Execute a tool call (MCP tools/call format)
async function executeToolCall(toolName, args) {
  let result;
  switch (toolName) {
    case "navigate":
      result = await cmdNavigate({ url: args?.url });
      break;
    case "click":
      if (args?.ref !== undefined) {
        result = await cmdClickRef({ ref: args.ref });
      } else {
        result = await cmdClick({ selector: args?.selector });
      }
      break;
    case "type":
      if (args?.ref !== undefined) {
        result = await cmdTypeRef({ ref: args.ref, text: args?.text, submit: args?.submit });
      } else {
        result = await cmdType({ selector: args?.selector, text: args?.text, submit: args?.submit });
      }
      break;
    case "snapshot":
      result = await cmdAriaSnapshot({ includeContent: args?.includeContent });
      break;
    case "screenshot":
      result = await cmdScreenshot();
      break;
    case "scroll":
      result = await cmdScroll({ direction: args?.direction, amount: args?.amount });
      break;
    case "get_browser_status":
      result = { connected: !!connectedTabId, tabId: connectedTabId };
      break;
    case "hover":
      result = await cmdHover({ selector: args?.selector });
      break;
    case "extract":
      result = await cmdExtract({ selector: args?.selector });
      break;
    case "capture_page":
      result = await cmdCaptureSelectors();
      break;
    case "injectCSS":
      result = await cmdInjectCSS({ css: args?.css, id: args?.id });
      break;
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }

  // Wrap in MCP content format
  return {
    content: [{ type: "text", text: JSON.stringify(result) }]
  };
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
      case "injectCSS":
        result = await cmdInjectCSS(msg);
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
  if (isRestrictedUrl(targetTab.url)) {
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

async function cmdInjectCSS(msg) {
  if (!connectedTabId) throw new Error("No browser connected");

  const { css, id } = msg;
  if (!css) throw new Error("CSS content is required");

  const result = await sendToContentScript("injectCSS", { css, id });
  return result;
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
  if (isRestrictedUrl(tab.url)) {
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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle panel messages first
  if (msg.action?.startsWith("panel:")) {
    const handled = handlePanelMessage(msg, sender, sendResponse);
    if (handled) return true; // async response
  }

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
  // Clean up tab state for closed tabs
  tabStates.delete(tabId);
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
      // Return both local and hosted mode status
      chrome.storage.local.get(["mode", "hostedEmail", "hostedMcpUrl"], (data) => {
        sendResponse({
          mode: data.mode || (connectedTabId ? "local" : "disconnected"),
          connected: !!connectedTabId,
          wsConnected: ws && ws.readyState === WebSocket.OPEN,
          hostedConnected: hostedWs && hostedWs.readyState === WebSocket.OPEN,
          tabId: connectedTabId,
          recording: isRecording,
          email: data.hostedEmail || hostedEmail,
          mcpUrl: data.hostedMcpUrl || hostedMcpUrl,
        });
      });
      return true; // async response
    } else if (msg.action === "connect") {
      // Connect to tab - only set mode to local if not in hosted mode
      chrome.storage.local.get(["mode"], (data) => {
        if (data.mode !== "hosted") {
          chrome.storage.local.set({ mode: "local" });
        }
        cmdConnect({})
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ error: e.message }));
      });
      return true;
    } else if (msg.action === "disconnect") {
      // Disconnect from tab - only change mode if not in hosted mode
      chrome.storage.local.get(["mode"], (data) => {
        if (data.mode !== "hosted") {
          chrome.storage.local.set({ mode: "disconnected" });
        }
        cmdDisconnect()
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ error: e.message }));
      });
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
    } else if (msg.action === "hostedSignout") {
      disconnectHosted();
      chrome.storage.local.remove(["mode", "hostedEmail", "hostedUserCode", "hostedMcpUrl"]);
      sendResponse({ ok: true });
      return false;
    } else if (msg.action === "setEmbedEnabled") {
      embedButtonsEnabled = msg.enabled;
      chrome.storage.local.set({ embedButtonsEnabled: msg.enabled });
      broadcastEmbedStatusToAllTabs();
      sendResponse({ ok: true });
      return false;
    } else if (msg.action === "setChatPanelEnabled") {
      chatPanelEnabled = msg.enabled;
      chrome.storage.local.set({ chatPanelEnabled: msg.enabled });
      broadcastPanelVisibility();
      sendResponse({ ok: true });
      return false;
    }
  }

  // Return extension state to web pages via content script relay
  if (msg.action === "getWebStatus") {
    chrome.storage.local.get(["mode", "hostedEmail", "embedButtonsEnabled", "chatPanelEnabled"], (data) => {
      sendResponse({
        mode: data.mode || (connectedTabId ? "local" : "disconnected"),
        email: data.hostedEmail || hostedEmail || null,
        embedEnabled: data.embedButtonsEnabled !== false,
        chatEnabled: data.chatPanelEnabled !== false,
        connected: !!connectedTabId,
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
        hostedConnected: hostedWs && hostedWs.readyState === WebSocket.OPEN,
      });
    });
    return true;
  }

  // Handle fetch proxy requests from content script (bypasses Private Network Access)
  if (msg.action === "fetchProxy") {
    const { url, options } = msg;
    // Only allow proxying to localhost
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        sendResponse({ ok: false, error: 'Only localhost requests allowed' });
        return false;
      }
    } catch {
      sendResponse({ ok: false, error: 'Invalid URL' });
      return false;
    }

    fetch(url, {
      method: options?.method || 'GET',
      headers: options?.headers || {},
      body: options?.body || undefined,
    })
      .then(async (resp) => {
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        sendResponse({ ok: resp.ok, status: resp.status, data });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e.message || 'Fetch failed' });
      });
    return true; // async response
  }

  // Handle login success from website (via content script or external message)
  if (msg.type === "SIDEBUTTON_LOGIN" || msg.type === "login_success") {
    handleHostedLogin(msg);
    sendResponse({ ok: true });
    return false;
  }
});

// ============================================================================
// Hosted Login Handler
// ============================================================================

function handleHostedLogin(msg) {
  console.log("[SideButton] Received hosted login:", msg.email);

  hostedEmail = msg.email;
  hostedUserCode = msg.userCode;
  hostedMcpUrl = msg.mcpUrl;
  hostedMode = true;

  // Save to storage for persistence
  chrome.storage.local.set({
    mode: "hosted",
    hostedEmail: msg.email,
    hostedUserCode: msg.userCode,
    hostedMcpUrl: msg.mcpUrl,
  });

  // Connect to hosted WebSocket
  connectHosted();
}

// Listen for external messages (from website login page)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === "login_success" || msg.type === "SIDEBUTTON_LOGIN") {
    handleHostedLogin(msg);
    sendResponse({ ok: true });
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
  console.log("[SideButton] fetchEmbedConfigs for domain:", domain);

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
  console.log("[SideButton] sendEmbedConfigsToTab:", tabId, url);

  // Skip if embed buttons are disabled
  if (!embedButtonsEnabled) return;

  // Skip restricted URLs early - cannot inject content scripts
  if (isRestrictedUrl(url)) {
    return; // Silently skip - this is expected behavior
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const allConfigs = await fetchEmbedConfigs(domain);

    // Filter configs by allowed_domains policy and org/repo match
    const configs = allConfigs.filter((config) => {
      const allowed = config.policies?.allowed_domains;
      if (Array.isArray(allowed) && allowed.length > 0) {
        const domainMatch = allowed.some((d) => {
          if (d.startsWith("*.")) {
            const base = d.slice(2);
            return domain === base || domain.endsWith("." + base);
          }
          return domain === d || domain.endsWith("." + d);
        });
        if (!domainMatch) return false;
      }
      return matchesOrgRepo(url, config.embed);
    });

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
    if (!tabs || !tabs.length) return;
    const tab = tabs[0];
    if (!tab?.id || !tab.url) return;

    // Skip restricted URLs
    if (isRestrictedUrl(tab.url)) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: "embedStatus",
      connected,
      enabled: embedButtonsEnabled,
    }).catch(() => {});
  });
}

// Broadcast panel visibility to all tabs
function broadcastPanelVisibility() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab?.id || !tab.url) continue;

      // Skip restricted URLs
      if (isRestrictedUrl(tab.url)) continue;

      chrome.tabs.sendMessage(tab.id, {
        action: "panel:setVisibility",
        enabled: chatPanelEnabled,
      }).catch(() => {});
    }
  });
}

// Broadcast embed status to all tabs (used when toggle changes)
function broadcastEmbedStatusToAllTabs() {
  const connected = ws && ws.readyState === WebSocket.OPEN;

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab?.id || !tab.url) continue;

      if (isRestrictedUrl(tab.url)) continue;

      chrome.tabs.sendMessage(tab.id, {
        action: "embedStatus",
        connected,
        enabled: embedButtonsEnabled,
      }).catch(() => {});
    }
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

    // Use REST API with sync mode to get result directly
    // (MCP endpoint returns 202 with empty body when SSE client is connected)
    const response = await fetch(`${APP_API_URL}/api/workflows/${workflowId}/run?sync=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("[SideButton] Workflow result:", workflowId, result);

    if (result.status === "failed") {
      return { error: result.output_message || "Workflow failed" };
    }

    // Return output message as content
    const content = result.output_message || null;
    return { success: true, content };
  } catch (e) {
    console.error("[SideButton] Failed to run workflow:", e);
    return { error: e.message };
  }
}

// ============================================================================
// One-Click Install Badge
// ============================================================================

let installBadgeCount = 0;
let installBadgeTimeout = null;

/**
 * Handle workflow-installed event from server.
 * Shows a +N badge on the extension icon with green background.
 */
function handleWorkflowInstalled(data) {
  console.log("[SideButton] Workflow installed:", data?.workflowId || data);

  // Increment badge count
  installBadgeCount++;

  // Clear any existing timeout
  if (installBadgeTimeout) {
    clearTimeout(installBadgeTimeout);
  }

  // Update badge
  chrome.action.setBadgeText({ text: `+${installBadgeCount}` });
  chrome.action.setBadgeBackgroundColor({ color: '#22C55E' }); // green

  // Clear badge after 10 seconds
  installBadgeTimeout = setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    installBadgeCount = 0;
    installBadgeTimeout = null;
  }, 10000);
}

// ============================================================================
// Initialization
// ============================================================================

// Connect to local server
connect();

// Restore hosted mode if previously connected
chrome.storage.local.get(["mode", "hostedEmail", "hostedUserCode", "hostedMcpUrl"], (data) => {
  if (data?.mode === "hosted" && data.hostedEmail) {
    console.log("[SideButton] Restoring hosted mode for:", data.hostedEmail);
    hostedEmail = data.hostedEmail;
    hostedUserCode = data.hostedUserCode;
    hostedMcpUrl = data.hostedMcpUrl;
    hostedMode = true;
    connectHosted();
  }
});

// Restore feature toggle state
chrome.storage.local.get(["embedButtonsEnabled", "chatPanelEnabled"], (data) => {
  if (data.embedButtonsEnabled === false) embedButtonsEnabled = false;
  if (data.chatPanelEnabled === false) chatPanelEnabled = false;
});

console.log("[SideButton] Background service worker started");
