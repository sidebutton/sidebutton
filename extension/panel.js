// SideButton Chat Panel - Shadow DOM isolated chat interface
// Provides persistent AI assistant chat in the browser

// ============================================================================
// Chat Panel Manager
// ============================================================================

class ChatPanel {
  constructor() {
    this.shadowHost = null;
    this.shadowRoot = null;
    this.isOpen = false;
    this.isLoading = false;
    this.messages = [];
    this.buttonPosition = { bottom: 24 };
    this.contextOptions = {
      includePageInfo: true,
      includeElementScreenshot: false,
      includeElementContent: true,
    };

    // Element picker state
    this.isPickerActive = false;
    this.pickedElements = []; // Array of { selector, label, element }
    this.pendingContext = null; // Context waiting to be sent with next message

    // Connected MCPs (checked from background)
    this.connectedMcps = []; // Array of MCP names like "atlassian", "sidebutton"

    // DOM references
    this.button = null;
    this.panel = null;
    this.messageList = null;
    this.input = null;
    this.contextMenu = null;
    this.pickerBanner = null;

    // Bind methods
    this.handleToggle = this.handleToggle.bind(this);
    this.handleSend = this.handleSend.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);
    this.handlePickerClick = this.handlePickerClick.bind(this);
    this.handlePickerHover = this.handlePickerHover.bind(this);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async init() {
    // Check if shadow host already exists (SPA navigation can re-run script)
    const existingHost = document.getElementById("sidebutton-panel-host");
    if (existingHost) {
      console.log("[SideButton Panel] Already initialized, skipping");
      return;
    }

    // Create Shadow DOM host
    this.shadowHost = document.createElement("div");
    this.shadowHost.id = "sidebutton-panel-host";
    this.shadowHost.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
      z-index: 2147483646 !important;
      pointer-events: none !important;
    `;
    document.body.appendChild(this.shadowHost);

    // Create Shadow Root for style isolation
    this.shadowRoot = this.shadowHost.attachShadow({ mode: "closed" });

    // Inject styles
    this.shadowRoot.appendChild(this.createStyles());

    // Create button (always visible)
    this.button = this.createButton();
    this.shadowRoot.appendChild(this.button);
    this.updateButtonPosition(); // Set position immediately with default

    // Create panel (hidden initially)
    this.panel = this.createPanel();
    this.shadowRoot.appendChild(this.panel);

    // Get initial state from background
    try {
      const state = await chrome.runtime.sendMessage({ action: "panel:getState" });
      if (state) {
        this.applyState(state);
      }
    } catch (e) {
      console.log("[SideButton Panel] Could not get initial state:", e.message);
    }

    // Get connected MCPs
    try {
      const mcpStatus = await chrome.runtime.sendMessage({ action: "panel:getMcpStatus" });
      if (mcpStatus && mcpStatus.connectedMcps) {
        this.connectedMcps = mcpStatus.connectedMcps;
      }
    } catch (e) {
      console.log("[SideButton Panel] Could not get MCP status:", e.message);
      // Default: only sidebutton without hosted mode
      this.connectedMcps = ["sidebutton"];
    }

    // Check if chat panel is enabled
    try {
      const toggleData = await new Promise((resolve) => {
        chrome.storage.local.get(["chatPanelEnabled"], resolve);
      });
      if (toggleData.chatPanelEnabled === false) {
        this.shadowHost.style.display = "none";
      }
    } catch (e) {
      // Default: visible
    }

    // Listen for state changes from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "panel:stateChanged") {
        this.handleStateChange(msg.data);
      } else if (msg.action === "panel:messageAdded") {
        this.addMessage(msg.data);
      } else if (msg.action === "panel:messageUpdated") {
        this.updateMessage(msg.data.id, msg.data);
      } else if (msg.action === "panel:streamChunk") {
        this.appendStreamChunk(msg.data.messageId, msg.data.chunk);
      } else if (msg.action === "panel:setVisibility") {
        if (this.shadowHost) {
          this.shadowHost.style.display = msg.enabled ? "" : "none";
        }
      }
    });

    // Global keyboard shortcut
    document.addEventListener("keydown", (e) => {
      // Cmd/Ctrl + Shift + S
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault();
        this.handleToggle();
      }
    });

    console.log("[SideButton Panel] Initialized");
  }

  // ============================================================================
  // State Management
  // ============================================================================

  applyState(state) {
    const wasOpen = this.isOpen;

    this.messages = state.messages || [];
    this.isOpen = state.isOpen || false;
    this.isLoading = state.isLoading || false;
    this.buttonPosition = state.buttonPosition || { bottom: 24 };
    // Merge saved contextOptions with defaults to ensure all properties exist
    this.contextOptions = {
      includePageInfo: true,
      includeElementScreenshot: false,
      includeElementContent: true,
      ...state.contextOptions,
    };

    // Update UI
    this.updateButtonPosition();

    // Only update panel visibility if it actually changed
    if (this.isOpen && !wasOpen) {
      this.showPanel(true); // restored = true
    } else if (!this.isOpen && wasOpen) {
      this.hidePanel(true); // restored = true
    } else if (this.isOpen) {
      // Already open, just ensure classes are set (no animation)
      this.panel.classList.add("sb-panel--open");
    }

    this.renderMessages();
  }

  handleStateChange(state) {
    this.applyState(state);
  }

  async saveState(updates) {
    try {
      await chrome.runtime.sendMessage({
        action: "panel:setState",
        data: updates,
      });
    } catch (e) {
      console.log("[SideButton Panel] Could not save state:", e.message);
    }
  }

  clearChat() {
    // Reset all chat state
    this.messages = [];
    this.pendingContext = null;
    this.pickedElements = [];
    this.isLoading = false;

    // Re-render to show welcome state
    this.renderMessages();

    // Save cleared state
    this.saveState({ messages: [], isLoading: false });

    // Focus input
    this.input?.focus();

    console.log("[SideButton Panel] Chat cleared");
  }

  // ============================================================================
  // Create Styles
  // ============================================================================

  createStyles() {
    const style = document.createElement("style");
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* ========================================
         Brand Colors
         ======================================== */
      :host {
        --sb-primary: #15C39A;
        --sb-primary-hover: #0EA874;
        --sb-primary-light: #E6FAF5;
        --sb-primary-gradient: linear-gradient(135deg, #15C39A 0%, #0EA874 100%);
        --sb-success: #10B981;
        --sb-error: #EF4444;
        --sb-warning: #F59E0B;
        --sb-text: #1F2937;
        --sb-text-muted: #6B7280;
        --sb-border: #E5E7EB;
        --sb-bg: #FFFFFF;
        --sb-bg-secondary: #F9FAFB;
      }

      /* Floating Button */
      .sb-button {
        position: fixed;
        right: 20px;
        bottom: 24px;
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--sb-primary-gradient);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(21, 195, 154, 0.35), 0 2px 6px rgba(0,0,0,0.08);
        transition: all 0.2s ease;
        opacity: 1;
        pointer-events: auto;
        z-index: 2147483646;
      }

      .sb-button:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(21, 195, 154, 0.45), 0 4px 10px rgba(0,0,0,0.1);
      }

      .sb-button:active {
        transform: scale(0.95);
      }

      .sb-button svg {
        width: 24px;
        height: 24px;
        fill: white;
      }

      .sb-button--loading svg {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Chat Panel - BIGGER */
      .sb-panel {
        position: fixed;
        right: 20px;
        width: 400px;
        max-height: 600px;
        min-height: 300px;
        background: var(--sb-bg);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid var(--sb-border);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        z-index: 2147483644;
        opacity: 0;
        transform: translateY(12px) scale(0.96);
        transition: opacity 0.25s ease-out, transform 0.25s ease-out;
        visibility: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
      }

      .sb-panel--open {
        opacity: 1;
        transform: translateY(0) scale(1);
        visibility: visible;
      }

      .sb-panel--restored {
        animation: panelRestore 150ms ease-out;
      }

      @keyframes panelRestore {
        from { opacity: 0.7; }
        to { opacity: 1; }
      }

      /* Panel Header - Branded */
      .sb-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--sb-primary-gradient);
        border-bottom: none;
        min-height: 48px;
      }

      .sb-header-title {
        font-size: 14px;
        font-weight: 600;
        color: white;
        display: flex;
        align-items: center;
        gap: 8px;
        letter-spacing: -0.01em;
      }

      .sb-header-title svg {
        width: 18px;
        height: 18px;
        fill: white;
      }

      .sb-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sb-restart {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255,255,255,0.15);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        color: white;
        transition: all 0.15s;
      }

      .sb-restart:hover {
        background: rgba(255,255,255,0.25);
      }

      .sb-restart svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .sb-close {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255,255,255,0.15);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        color: white;
        font-size: 16px;
        font-weight: 300;
        transition: all 0.15s;
      }

      .sb-close:hover {
        background: rgba(255,255,255,0.25);
      }

      /* Messages Area - BIGGER */
      .sb-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-height: 200px;
        max-height: 440px;
        background: var(--sb-bg);
      }

      .sb-message {
        max-width: 88%;
        padding: 12px 16px;
        font-size: 14px;
        line-height: 1.55;
        animation: messageAppear 0.2s ease-out;
      }

      @keyframes messageAppear {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .sb-message--user {
        align-self: flex-end;
        background: var(--sb-primary);
        color: white;
        border-radius: 16px 16px 4px 16px;
        box-shadow: 0 2px 8px rgba(21, 195, 154, 0.2);
      }

      .sb-message--assistant {
        align-self: flex-start;
        background: var(--sb-bg);
        border: 1px solid var(--sb-border);
        color: var(--sb-text);
        border-radius: 16px 16px 16px 4px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      }

      .sb-message--loading {
        display: flex;
        gap: 5px;
        padding: 16px 20px;
      }

      .sb-dot {
        width: 8px;
        height: 8px;
        background: var(--sb-primary);
        border-radius: 50%;
        animation: dotPulse 1.4s infinite ease-in-out both;
      }

      .sb-dot:nth-child(1) { animation-delay: -0.32s; }
      .sb-dot:nth-child(2) { animation-delay: -0.16s; }

      @keyframes dotPulse {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Tool Calls */
      .sb-tool-call {
        margin-top: 8px;
        padding: 8px 10px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        font-size: 11px;
      }

      .sb-tool-call-header {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #6B7280;
        font-weight: 500;
      }

      .sb-tool-call-header svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }

      .sb-tool-call--pending .sb-tool-call-header {
        color: #D97706;
      }

      .sb-tool-call--running .sb-tool-call-header {
        color: #2563EB;
      }

      .sb-tool-call--complete .sb-tool-call-header {
        color: #059669;
      }

      .sb-tool-call--error .sb-tool-call-header {
        color: #DC2626;
      }

      .sb-tool-call-params {
        margin-top: 4px;
        color: #6B7280;
        font-family: monospace;
        font-size: 10px;
        white-space: pre-wrap;
        word-break: break-all;
      }

      /* Action Buttons */
      .sb-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
      }

      .sb-action-btn {
        width: 100%;
        padding: 8px 12px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        color: #374151;
        cursor: pointer;
        transition: all 0.15s;
        text-align: left;
      }

      .sb-action-btn:hover {
        background: #F3F4F6;
        border-color: #D1D5DB;
      }

      /* Input Bar - BIGGER */
      .sb-input-bar {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        padding: 12px 16px 16px;
        background: var(--sb-bg);
        border-top: 1px solid var(--sb-border);
        border-radius: 0 0 16px 16px;
      }

      .sb-context-btn {
        width: 40px;
        height: 40px;
        border: 1px solid var(--sb-border);
        background: var(--sb-bg);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        color: var(--sb-text-muted);
        transition: all 0.15s;
        flex-shrink: 0;
      }

      .sb-context-btn:hover {
        background: var(--sb-bg-secondary);
        border-color: var(--sb-primary);
        color: var(--sb-primary);
      }

      .sb-context-btn svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      .sb-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid var(--sb-border);
        border-radius: 12px;
        font-size: 14px;
        font-family: inherit;
        background: var(--sb-bg-secondary);
        color: var(--sb-text);
        outline: none;
        resize: none;
        min-height: 40px;
        max-height: 100px;
        line-height: 1.4;
      }

      .sb-input::placeholder {
        color: #9CA3AF;
      }

      .sb-input:focus {
        border-color: var(--sb-primary);
        background: var(--sb-bg);
        box-shadow: 0 0 0 3px rgba(21, 195, 154, 0.1);
      }

      .sb-send-btn {
        width: 40px;
        height: 40px;
        border: none;
        background: var(--sb-primary-gradient);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        transition: all 0.15s;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(21, 195, 154, 0.25);
      }

      .sb-send-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(21, 195, 154, 0.35);
      }

      .sb-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      .sb-send-btn svg {
        width: 18px;
        height: 18px;
        fill: white;
      }

      /* Context Menu */
      .sb-context-menu {
        position: absolute;
        bottom: 56px;
        left: 8px;
        width: 200px;
        background: #FFFFFF;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border: 1px solid #E5E7EB;
        padding: 8px 0;
        display: none;
        z-index: 10;
      }

      .sb-context-menu--open {
        display: block;
      }

      .sb-context-menu-title {
        padding: 4px 12px 8px;
        font-size: 11px;
        font-weight: 600;
        color: #9CA3AF;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .sb-context-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font-size: 12px;
        color: #374151;
        cursor: pointer;
        transition: background 0.15s;
      }

      .sb-context-item:hover {
        background: #F9FAFB;
      }

      .sb-context-item input {
        width: 14px;
        height: 14px;
        accent-color: #15C39A;
      }

      /* Empty State */
      .sb-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        color: #9CA3AF;
        gap: 8px;
      }

      .sb-empty svg {
        width: 32px;
        height: 32px;
        fill: #D1D5DB;
      }

      .sb-empty-text {
        font-size: 13px;
      }

      .sb-empty-hint {
        font-size: 11px;
        color: #D1D5DB;
      }

      /* Scrollbar */
      .sb-messages::-webkit-scrollbar {
        width: 6px;
      }

      .sb-messages::-webkit-scrollbar-track {
        background: transparent;
      }

      .sb-messages::-webkit-scrollbar-thumb {
        background: #E5E7EB;
        border-radius: 3px;
      }

      .sb-messages::-webkit-scrollbar-thumb:hover {
        background: #D1D5DB;
      }

      /* ========================================
         Welcome State (Enhanced & Branded)
         ======================================== */
      .sb-welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 24px 32px;
        text-align: center;
        gap: 16px;
      }

      .sb-welcome-icon {
        width: 56px;
        height: 56px;
        background: var(--sb-primary-gradient);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(21, 195, 154, 0.3);
      }

      .sb-welcome-icon svg {
        width: 28px;
        height: 28px;
        fill: white;
      }

      .sb-welcome-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--sb-text);
        letter-spacing: -0.02em;
      }

      .sb-welcome-subtitle {
        font-size: 14px;
        color: var(--sb-text-muted);
        line-height: 1.5;
        max-width: 280px;
      }

      .sb-quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-top: 8px;
      }

      .sb-quick-action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--sb-bg);
        border: 1px solid var(--sb-border);
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        color: var(--sb-text);
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      }

      .sb-quick-action:hover {
        background: var(--sb-primary-light);
        border-color: var(--sb-primary);
        color: var(--sb-primary-hover);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(21, 195, 154, 0.15);
      }

      .sb-quick-action svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
      }

      /* ========================================
         Collapsible Tool Blocks
         ======================================== */
      .sb-tool-block {
        margin-top: 8px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        overflow: hidden;
        font-size: 12px;
      }

      .sb-tool-block-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }

      .sb-tool-block-header:hover {
        background: #F3F4F6;
      }

      .sb-tool-block-chevron {
        width: 14px;
        height: 14px;
        fill: #9CA3AF;
        transition: transform 0.2s;
        flex-shrink: 0;
      }

      .sb-tool-block--expanded .sb-tool-block-chevron {
        transform: rotate(90deg);
      }

      .sb-tool-block-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .sb-tool-block-title {
        flex: 1;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sb-tool-block-status {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
        font-weight: 500;
      }

      .sb-tool-block--pending .sb-tool-block-status {
        background: #FEF3C7;
        color: #D97706;
      }

      .sb-tool-block--running .sb-tool-block-status {
        background: #DBEAFE;
        color: #2563EB;
      }

      .sb-tool-block--complete .sb-tool-block-status {
        background: #D1FAE5;
        color: #059669;
      }

      .sb-tool-block--error .sb-tool-block-status {
        background: #FEE2E2;
        color: #DC2626;
      }

      .sb-tool-block-content {
        display: none;
        padding: 0 10px 10px;
        border-top: 1px solid #E5E7EB;
      }

      .sb-tool-block--expanded .sb-tool-block-content {
        display: block;
      }

      .sb-tool-block-steps {
        margin-top: 8px;
      }

      .sb-tool-step {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 4px 0;
        font-size: 11px;
        color: #6B7280;
      }

      .sb-tool-step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 3px;
        flex-shrink: 0;
      }

      .sb-tool-step--done .sb-tool-step-dot {
        background: #10B981;
      }

      .sb-tool-step--active .sb-tool-step-dot {
        background: #2563EB;
        animation: pulse 1.5s infinite;
      }

      .sb-tool-step--pending .sb-tool-step-dot {
        background: #D1D5DB;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .sb-tool-block-params {
        margin-top: 8px;
        padding: 6px 8px;
        background: #FFFFFF;
        border: 1px solid #E5E7EB;
        border-radius: 4px;
        font-family: monospace;
        font-size: 10px;
        color: #6B7280;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 80px;
        overflow-y: auto;
      }

      /* ========================================
         Inline Action Buttons
         ======================================== */
      .sb-inline-actions {
        display: flex;
        gap: 4px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #E5E7EB;
      }

      .sb-inline-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
        color: #6B7280;
        cursor: pointer;
        transition: all 0.15s;
      }

      .sb-inline-btn:hover {
        background: #F3F4F6;
        color: #374151;
      }

      .sb-inline-btn svg {
        width: 10px;
        height: 10px;
        fill: currentColor;
      }

      .sb-inline-btn--success {
        background: #D1FAE5;
        color: #059669;
        border-color: #A7F3D0;
      }

      /* ========================================
         Success/Error Message States
         ======================================== */
      .sb-message--success {
        background: #ECFDF5 !important;
        border-color: #A7F3D0 !important;
      }

      .sb-message--error {
        background: #FEF2F2 !important;
        border-color: #FECACA !important;
      }

      .sb-success-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: #ECFDF5;
        border: 1px solid #A7F3D0;
        border-radius: 6px;
        margin-bottom: 8px;
      }

      .sb-success-banner svg {
        width: 16px;
        height: 16px;
        fill: #10B981;
        flex-shrink: 0;
      }

      .sb-success-banner-text {
        flex: 1;
        font-size: 12px;
        font-weight: 500;
        color: #065F46;
      }

      .sb-success-link {
        font-size: 11px;
        color: #059669;
        text-decoration: none;
        font-weight: 500;
      }

      .sb-success-link:hover {
        text-decoration: underline;
      }

      /* ========================================
         Context Message (Picked Elements)
         ======================================== */
      .sb-message--context {
        align-self: stretch;
        max-width: 100%;
        background: var(--sb-primary-light);
        border: 1px solid rgba(21, 195, 154, 0.2);
        border-radius: 12px;
        padding: 12px 14px;
      }

      .sb-context-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: var(--sb-primary-hover);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 10px;
      }

      .sb-context-header svg {
        width: 14px;
        height: 14px;
        fill: var(--sb-primary);
      }

      .sb-context-elements {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .sb-context-element {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: white;
        border: 1px solid var(--sb-border);
        border-radius: 8px;
        font-size: 12px;
        color: var(--sb-text);
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        width: 100%;
      }

      .sb-context-element-icon {
        width: 16px;
        height: 16px;
        background: var(--sb-bg-secondary);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(--sb-text-muted);
        font-weight: 600;
      }

      .sb-context-element-label {
        font-weight: 500;
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sb-context-element-tag {
        font-size: 10px;
        color: var(--sb-text-muted);
        background: var(--sb-bg-secondary);
        padding: 2px 5px;
        border-radius: 4px;
      }

      .sb-context-element-text {
        width: 100%;
        font-size: 11px;
        color: var(--sb-text-secondary);
        margin-top: 2px;
        padding: 6px 8px;
        background: var(--sb-bg-secondary);
        border-radius: 4px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .sb-context-element-header {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sb-context-element--has-screenshot {
        flex-direction: column;
        align-items: flex-start;
      }

      .sb-context-element-screenshot {
        width: 100%;
        margin-top: 8px;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid var(--sb-border);
      }

      .sb-context-element-screenshot img {
        width: 100%;
        height: auto;
        display: block;
        max-height: 200px;
        object-fit: contain;
        background: var(--sb-bg-secondary);
      }

      .sb-context-page-info {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(21, 195, 154, 0.15);
        font-size: 11px;
        color: var(--sb-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sb-context-page-info svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
        flex-shrink: 0;
      }

      .sb-context-page-info a {
        color: var(--sb-primary);
        text-decoration: none;
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sb-context-page-info a:hover {
        text-decoration: underline;
      }

      .sb-context-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(21, 195, 154, 0.15);
      }

      .sb-context-suggestion {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        background: white;
        border: 1px solid var(--sb-border);
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        color: var(--sb-text);
        cursor: pointer;
        transition: all 0.15s;
      }

      .sb-context-suggestion:hover {
        background: var(--sb-primary-light);
        border-color: var(--sb-primary);
        color: var(--sb-primary-hover);
      }

      .sb-context-suggestion svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
      }

      .sb-context-suggestion--issue {
        background: #E9F2FF;
        border-color: #579DFF;
        color: #0055CC;
      }

      .sb-context-suggestion--issue:hover {
        background: #CCE0FF;
        border-color: #0C66E4;
        color: #0055CC;
      }

      .sb-issue-input-container {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(21, 195, 154, 0.15);
      }

      .sb-issue-instructions-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #579DFF;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
        background: white;
      }

      .sb-issue-instructions-input:focus {
        border-color: #0C66E4;
        box-shadow: 0 0 0 2px rgba(12, 102, 228, 0.15);
      }

      .sb-issue-instructions-input::placeholder {
        color: #8993A4;
      }

      .sb-issue-create-btn {
        padding: 8px 16px;
        background: #0C66E4;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        color: white;
        cursor: pointer;
        transition: background 0.15s;
      }

      .sb-issue-create-btn:hover {
        background: #0055CC;
      }

      /* ========================================
         Element Picker Banner (Top) - Accent Style
         ======================================== */
      .sb-picker-banner {
        display: none;
        padding: 12px 14px;
        background: var(--sb-primary-light);
        border-bottom: 1px solid rgba(21, 195, 154, 0.2);
      }

      .sb-picker-banner--active {
        display: block;
      }

      .sb-picker-banner-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .sb-picker-banner-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--sb-primary-hover);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sb-picker-banner-title svg {
        width: 16px;
        height: 16px;
        fill: var(--sb-primary);
      }

      .sb-picker-done-btn {
        padding: 6px 14px;
        background: var(--sb-primary);
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        color: white;
        cursor: pointer;
        transition: all 0.15s;
        box-shadow: 0 2px 6px rgba(21, 195, 154, 0.25);
      }

      .sb-picker-done-btn:hover {
        background: var(--sb-primary-hover);
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(21, 195, 154, 0.3);
      }

      .sb-picker-picks {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .sb-picker-pick {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        background: white;
        border: 1px solid var(--sb-border);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        color: var(--sb-text);
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }

      .sb-picker-pick-remove {
        width: 14px;
        height: 14px;
        background: none;
        border: none;
        color: #9CA3AF;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
        padding: 0;
        transition: color 0.15s;
      }

      .sb-picker-pick-remove:hover {
        color: var(--sb-error);
      }

      .sb-picker-empty {
        font-size: 12px;
        color: var(--sb-text-muted);
        font-style: italic;
      }

      .sb-picker-controls {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }

      .sb-picker-control-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        background: white;
        border: 1px solid var(--sb-border);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        color: var(--sb-text-muted);
        cursor: pointer;
        transition: all 0.15s;
      }

      .sb-picker-control-btn:hover {
        background: var(--sb-bg-secondary);
        border-color: var(--sb-primary);
        color: var(--sb-primary);
      }

      .sb-picker-control-btn--active {
        background: var(--sb-primary);
        border-color: var(--sb-primary);
        color: white;
      }

      .sb-picker-control-btn--active:hover {
        background: var(--sb-primary-hover);
      }

      .sb-picker-control-btn svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }

      /* Markdown-like content */
      .sb-message--assistant p {
        margin-bottom: 8px;
      }

      .sb-message--assistant p:last-child {
        margin-bottom: 0;
      }

      .sb-message--assistant ul, .sb-message--assistant ol {
        margin: 8px 0;
        padding-left: 20px;
      }

      .sb-message--assistant li {
        margin-bottom: 4px;
      }

      .sb-message--assistant code {
        background: #F3F4F6;
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 12px;
        font-family: monospace;
      }

      .sb-message--assistant pre {
        background: #F3F4F6;
        padding: 8px 10px;
        border-radius: 6px;
        overflow-x: auto;
        margin: 8px 0;
      }

      .sb-message--assistant pre code {
        background: none;
        padding: 0;
      }
    `;
    return style;
  }

  // ============================================================================
  // Create Button
  // ============================================================================

  createButton() {
    const button = document.createElement("button");
    button.className = "sb-button";
    button.title = "SideButton (Cmd+Shift+S)";
    // SideButton "S" Logo
    button.innerHTML = `
      <svg viewBox="80 240 420 420" fill="white">
        <path d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z"/>
      </svg>
    `;
    button.addEventListener("click", this.handleToggle);

    return button;
  }

  updateButtonPosition() {
    if (this.button) {
      this.button.style.bottom = `${this.buttonPosition.bottom}px`;
    }
  }

  // ============================================================================
  // Create Panel
  // ============================================================================

  createPanel() {
    const panel = document.createElement("div");
    panel.className = "sb-panel";

    panel.innerHTML = `
      <!-- Element Picker Banner (shown when picking) -->
      <div class="sb-picker-banner">
        <div class="sb-picker-banner-header">
          <div class="sb-picker-banner-title">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h4v4H7V7zm0 6h4v4H7v-4zm6-6h4v4h-4V7zm0 6h4v4h-4v-4z"/>
            </svg>
            Select elements
          </div>
          <button class="sb-picker-done-btn">Done</button>
        </div>
        <div class="sb-picker-picks">
          <span class="sb-picker-empty">Click elements on the page to select them</span>
        </div>
        <div class="sb-picker-controls">
          <button class="sb-picker-control-btn" data-action="screenshot">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            Screenshot
          </button>
          <button class="sb-picker-control-btn" data-action="clear">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Clear
          </button>
        </div>
      </div>

      <div class="sb-header">
        <div class="sb-header-title">
          <svg viewBox="80 240 420 420" fill="white">
            <path d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z"/>
          </svg>
          SideButton
        </div>
        <div class="sb-header-actions">
          <button class="sb-restart" title="New chat">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
          </button>
          <button class="sb-close" title="Close">&times;</button>
        </div>
      </div>

      <div class="sb-messages"></div>

      <div class="sb-input-bar">
        <button class="sb-context-btn" title="Pick elements (right-click for settings)">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3h6v2H5v4H3V3zm18 0v6h-2V5h-4V3h6zM3 21v-6h2v4h4v2H3zm18 0h-6v-2h4v-4h2v6zM8 8h8v8H8V8zm2 2v4h4v-4h-4z"/>
          </svg>
        </button>
        <textarea class="sb-input" placeholder="Message..." rows="1"></textarea>
        <button class="sb-send-btn" title="Send">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
          </svg>
        </button>
      </div>

      <div class="sb-context-menu">
        <div class="sb-context-menu-title">Capture settings</div>
        <label class="sb-context-item">
          <input type="checkbox" name="includePageInfo" checked> Page info
        </label>
        <label class="sb-context-item">
          <input type="checkbox" name="includeElementContent" checked> Element content
        </label>
        <label class="sb-context-item">
          <input type="checkbox" name="includeElementScreenshot"> Element screenshot
        </label>
      </div>
    `;

    // Get references
    this.messageList = panel.querySelector(".sb-messages");
    this.input = panel.querySelector(".sb-input");
    this.contextMenu = panel.querySelector(".sb-context-menu");
    this.pickerBanner = panel.querySelector(".sb-picker-banner");

    // Event handlers
    panel.querySelector(".sb-close").addEventListener("click", () => this.hidePanel());
    panel.querySelector(".sb-restart").addEventListener("click", () => this.clearChat());
    panel.querySelector(".sb-send-btn").addEventListener("click", this.handleSend);

    // + button starts picker directly
    const contextBtn = panel.querySelector(".sb-context-btn");
    contextBtn.addEventListener("click", () => {
      this.startPicker();
    });
    // Right-click or long-press shows settings
    contextBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.contextMenu.classList.toggle("sb-context-menu--open");
    });

    // Input handlers
    this.input.addEventListener("keydown", this.handleKeyDown);
    this.input.addEventListener("input", () => {
      // Auto-resize textarea
      this.input.style.height = "auto";
      this.input.style.height = Math.min(this.input.scrollHeight, 80) + "px";
    });

    // Context menu checkbox handlers
    panel.querySelectorAll(".sb-context-menu input").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        this.contextOptions[e.target.name] = e.target.checked;
        this.saveState({ contextOptions: this.contextOptions });
      });
    });

    // Picker banner event handlers
    panel.querySelector(".sb-picker-done-btn").addEventListener("click", () => {
      this.stopPicker();
    });

    panel.querySelector('[data-action="screenshot"]').addEventListener("click", (e) => {
      this.contextOptions.includeElementScreenshot = !this.contextOptions.includeElementScreenshot;
      e.currentTarget.classList.toggle("sb-picker-control-btn--active", this.contextOptions.includeElementScreenshot);
      this.saveState({ contextOptions: this.contextOptions });
    });

    panel.querySelector('[data-action="clear"]').addEventListener("click", () => {
      this.clearPicks();
    });

    // Close context menu when clicking outside
    panel.addEventListener("click", (e) => {
      if (!e.target.closest(".sb-context-btn") && !e.target.closest(".sb-context-menu")) {
        this.contextMenu.classList.remove("sb-context-menu--open");
      }
    });

    // Render initial welcome state
    this.renderMessages();

    // Update panel position based on button
    this.updatePanelPosition(panel);

    return panel;
  }

  updatePanelPosition(panel = this.panel) {
    if (panel) {
      // Panel appears above the button with 12px gap
      const panelBottom = this.buttonPosition.bottom + 48; // button height + gap
      panel.style.bottom = `${panelBottom}px`;
    }
  }

  // ============================================================================
  // Panel Toggle
  // ============================================================================

  handleToggle() {
    if (this.isOpen) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  showPanel(restored = false) {
    this.isOpen = true;
    this.panel.classList.add("sb-panel--open");
    if (restored) {
      this.panel.classList.add("sb-panel--restored");
      setTimeout(() => this.panel.classList.remove("sb-panel--restored"), 150);
    } else {
      // Only save state for user-initiated opens, not restores (avoids loop)
      this.saveState({ isOpen: true });
    }
    this.input.focus();
  }

  hidePanel(restored = false) {
    this.isOpen = false;
    this.panel.classList.remove("sb-panel--open");
    this.contextMenu.classList.remove("sb-context-menu--open");
    if (!restored) {
      // Only save state for user-initiated closes, not restores (avoids loop)
      this.saveState({ isOpen: false });
    }
  }

  // ============================================================================
  // Messages
  // ============================================================================

  renderMessages() {
    if (!this.messageList) return;

    if (this.messages.length === 0) {
      this.messageList.innerHTML = `
        <div class="sb-welcome">
          <div class="sb-welcome-icon">
            <svg viewBox="80 240 420 420" fill="white">
              <path d="M122.96,593.43l20.99-57.86c42.5,20.99,101.38,34.82,151.55,34.82,68.61,0,112.64-26.11,112.64-75.26,0-41.47-29.18-62.98-93.18-69.12-65.54-6.14-86.53-21.5-86.53-50.18,0-31.23,29.7-48.64,90.62-48.64,26.62,0,57.34,4.1,77.82,11.78v-20.99c-19.46-7.17-47.62-11.26-77.82-11.26-53.76,0-111.1,16.9-111.1,69.12,0,41.98,31.23,64,104.96,70.66,55.81,5.12,74.75,20.48,74.75,48.64,0,35.33-32.77,54.78-92.16,54.78-49.15,0-103.93-13.31-144.38-33.79l18.94-51.2c-27.14-18.94-40.96-48.64-40.96-84.48,0-95.23,91.13-129.53,189.95-129.53,50.18,0,103.93,9.73,146.94,26.62v136.7c22.02,19.46,33.79,47.1,33.79,79.36,0,98.81-96.25,132.61-199.17,132.61-68.09,0-134.65-12.8-177.66-32.77Z"/>
            </svg>
          </div>
          <div class="sb-welcome-title">How can I help?</div>
          <div class="sb-welcome-subtitle">Run workflows or control your browser with natural language.</div>
          <div class="sb-quick-actions">
            <button class="sb-quick-action" data-action="workflows">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              Workflows
            </button>
            <button class="sb-quick-action" data-action="pick">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 3h6v2H5v4H3V3zm18 0v6h-2V5h-4V3h6zM3 21v-6h2v4h4v2H3zm18 0h-6v-2h4v-4h2v6zM8 8h8v8H8V8zm2 2v4h4v-4h-4z"/>
              </svg>
              Pick element
            </button>
            <button class="sb-quick-action" data-action="ask">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/>
              </svg>
              Ask about page
            </button>
          </div>
        </div>
      `;

      // Add quick action handlers
      this.messageList.querySelector('[data-action="workflows"]')?.addEventListener("click", () => {
        this.input.value = "Show me available workflows";
        this.handleSend();
      });
      this.messageList.querySelector('[data-action="pick"]')?.addEventListener("click", () => {
        this.startPicker();
      });
      this.messageList.querySelector('[data-action="ask"]')?.addEventListener("click", () => {
        this.contextOptions.pageInfo = {
          url: window.location.href,
          title: document.title,
        };
        this.input.value = "What is this page about?";
        this.handleSend();
      });

      return;
    }

    this.messageList.innerHTML = "";
    for (const msg of this.messages) {
      this.messageList.appendChild(this.createMessageElement(msg));
    }

    // Add loading indicator if loading
    if (this.isLoading) {
      const loadingEl = document.createElement("div");
      loadingEl.className = "sb-message sb-message--assistant sb-message--loading";
      loadingEl.innerHTML = `
        <div class="sb-dot"></div>
        <div class="sb-dot"></div>
        <div class="sb-dot"></div>
      `;
      this.messageList.appendChild(loadingEl);
    }

    this.scrollToBottom();
  }

  createMessageElement(msg) {
    const el = document.createElement("div");

    // Handle context messages (picked elements)
    if (msg.role === "context") {
      return this.createContextMessageElement(msg);
    }

    // Build class list
    let className = `sb-message sb-message--${msg.role}`;
    if (msg.status === "success") className += " sb-message--success";
    if (msg.status === "error") className += " sb-message--error";
    el.className = className;
    el.dataset.id = msg.id;

    // Build content parts
    let contentParts = [];

    // Add success banner if present
    if (msg.successBanner) {
      contentParts.push(`
        <div class="sb-success-banner">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span class="sb-success-banner-text">${this.escapeHtml(msg.successBanner.text)}</span>
          ${msg.successBanner.link ? `<a href="${msg.successBanner.link.url}" target="_blank" class="sb-success-link">${this.escapeHtml(msg.successBanner.link.label)}</a>` : ""}
        </div>
      `);
    }

    // Render main content
    if (msg.content) {
      contentParts.push(this.formatContent(msg.content));
    }

    // Add tool calls if present
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      contentParts.push(msg.toolCalls.map((tc) => this.createToolCallHtml(tc)).join(""));
    }

    // Add action buttons if present (legacy style)
    if (msg.actions && msg.actions.length > 0) {
      contentParts.push(`
        <div class="sb-actions">
          ${msg.actions.map((a) => `<button class="sb-action-btn" data-action="${a.id}">${this.escapeHtml(a.label)}</button>`).join("")}
        </div>
      `);
    }

    // Add inline action buttons for assistant messages with copyable content
    if (msg.role === "assistant" && msg.content && msg.content.length > 50) {
      contentParts.push(`
        <div class="sb-inline-actions">
          <button class="sb-inline-btn" data-action="copy">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copy
          </button>
          ${msg.extractedData ? `
            <button class="sb-inline-btn" data-action="csv">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
              </svg>
              CSV
            </button>
            <button class="sb-inline-btn" data-action="json">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
              </svg>
              JSON
            </button>
          ` : ""}
        </div>
      `);
    }

    el.innerHTML = contentParts.join("");

    // Action button click handlers (legacy actions)
    el.querySelectorAll(".sb-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const actionId = btn.dataset.action;
        this.executeAction(msg.id, actionId);
      });
    });

    // Inline action button handlers
    el.querySelectorAll(".sb-inline-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        this.handleInlineAction(action, msg, btn);
      });
    });

    return el;
  }

  createContextMessageElement(msg) {
    const el = document.createElement("div");
    el.className = "sb-message sb-message--context";
    el.dataset.id = msg.id;

    // Build elements HTML
    const elementsHtml = msg.pickedElements
      .map((elem) => {
        const tagName = (elem.tagName || "div").toLowerCase();
        const textPreview = elem.text ? elem.text.substring(0, 100) + (elem.text.length > 100 ? '...' : '') : '';
        const screenshotHtml = elem.screenshot
          ? `<div class="sb-context-element-screenshot"><img src="${elem.screenshot}" alt="Element screenshot" /></div>`
          : '';
        return `
          <div class="sb-context-element ${elem.screenshot ? 'sb-context-element--has-screenshot' : ''}">
            <div class="sb-context-element-header">
              <span class="sb-context-element-tag">${this.escapeHtml(tagName)}</span>
              <span class="sb-context-element-label">${this.escapeHtml(elem.label)}</span>
            </div>
            ${screenshotHtml}
            ${textPreview ? `<div class="sb-context-element-text">${this.escapeHtml(textPreview)}</div>` : ''}
          </div>
        `;
      })
      .join("");

    // Build page info HTML if present
    let pageInfoHtml = "";
    if (msg.pageInfo) {
      const displayUrl = msg.pageInfo.url.length > 40
        ? msg.pageInfo.url.substring(0, 40) + "..."
        : msg.pageInfo.url;
      pageInfoHtml = `
        <div class="sb-context-page-info">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <a href="${this.escapeHtml(msg.pageInfo.url)}" target="_blank" title="${this.escapeHtml(msg.pageInfo.title)}">${this.escapeHtml(displayUrl)}</a>
        </div>
      `;
    }

    // Build suggestion buttons
    const hasAtlassian = this.connectedMcps.includes("atlassian");
    const suggestionsHtml = `
      <div class="sb-context-suggestions">
        <button class="sb-context-suggestion" data-suggestion="Summarize this">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
          </svg>
          Summary
        </button>
        <button class="sb-context-suggestion" data-suggestion="Extract data from this">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Extract
        </button>
        ${hasAtlassian ? `
          <button class="sb-context-suggestion sb-context-suggestion--issue" data-action="create-issue">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.53 2c-.55 0-1.07.22-1.46.61L2.61 10.1c-.78.78-.78 2.04 0 2.82l7.41 7.41c.78.78 2.04.78 2.82 0l7.41-7.41c.78-.78.78-2.04 0-2.82L12.99 2.61c-.39-.39-.91-.61-1.46-.61zm-.53 4l5 5-5 5-5-5 5-5z"/>
            </svg>
            Create Issue...
          </button>
        ` : ''}
      </div>
      <div class="sb-issue-input-container" style="display: none;">
        <input type="text" class="sb-issue-instructions-input" placeholder="Add instructions (optional)..." />
        <button class="sb-issue-create-btn">Create</button>
      </div>
    `;

    el.innerHTML = `
      <div class="sb-context-header">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3h6v2H5v4H3V3zm18 0v6h-2V5h-4V3h6zM3 21v-6h2v4h4v2H3zm18 0h-6v-2h4v-4h2v6zM8 8h8v8H8V8zm2 2v4h4v-4h-4z"/>
        </svg>
        Selected ${msg.pickedElements.length} element${msg.pickedElements.length > 1 ? "s" : ""}
      </div>
      <div class="sb-context-elements">
        ${elementsHtml}
      </div>
      ${pageInfoHtml}
      ${suggestionsHtml}
    `;

    // Add click handlers for suggestion buttons
    el.querySelectorAll(".sb-context-suggestion").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const suggestion = btn.dataset.suggestion;
        const action = btn.dataset.action;

        // Special handling for Create Issue - show input for instructions
        if (action === "create-issue") {
          const inputContainer = el.querySelector(".sb-issue-input-container");
          const input = el.querySelector(".sb-issue-instructions-input");

          // Toggle input visibility
          if (inputContainer.style.display === "none") {
            inputContainer.style.display = "flex";
            input.focus();
          } else {
            inputContainer.style.display = "none";
          }
          return;
        }

        if (suggestion) {
          this.sendSuggestion(suggestion);
        }
      });
    });

    // Handle issue create button click
    const issueCreateBtn = el.querySelector(".sb-issue-create-btn");
    if (issueCreateBtn) {
      issueCreateBtn.addEventListener("click", async () => {
        const input = el.querySelector(".sb-issue-instructions-input");
        const instructions = input?.value?.trim() || "";
        await this.runIssueWorkflow(msg, instructions);
      });
    }

    // Handle Enter key in instructions input
    const issueInput = el.querySelector(".sb-issue-instructions-input");
    if (issueInput) {
      issueInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const instructions = issueInput.value?.trim() || "";
          await this.runIssueWorkflow(msg, instructions);
        }
      });
    }

    return el;
  }

  sendSuggestion(text) {
    // Set input value and send
    this.input.value = text;
    this.handleSend();
  }

  /**
   * Run issue creation workflow (currently via Atlassian MCP, will support other systems)
   * @param {object} contextMsg - The context message with picked elements
   * @param {string} userInstructions - Optional user instructions for the issue
   */
  async runIssueWorkflow(contextMsg, userInstructions = "") {
    // Extract element data from context message
    const elem = contextMsg.pickedElements?.[0] || {};
    const pageInfo = contextMsg.pageInfo || {};

    // Build combined text from all picked elements
    let elementText = "";
    if (contextMsg.pickedElements) {
      elementText = contextMsg.pickedElements
        .map((e, i) => `[${e.label || i + 1}] ${e.text || ""}`)
        .filter((t) => t.length > 5)
        .join("\n\n");
    }

    // Prepend user instructions if provided
    if (userInstructions) {
      elementText = `Instructions: ${userInstructions}\n\n${elementText}`;
    }

    // Show workflow step message
    const workflowMsg = {
      role: "assistant",
      content: "Running workflow\n**Preparing Issue Fields**\n...",
      isLoading: true,
      timestamp: Date.now(),
    };
    this.messages.push(workflowMsg);
    this.renderMessages();
    this.saveState({ messages: this.messages });

    // Collect screenshots from picked elements
    const screenshots = [];
    if (contextMsg.pickedElements) {
      contextMsg.pickedElements.forEach((e, i) => {
        if (e.screenshot) {
          screenshots.push({
            name: `element-${i + 1}.png`,
            data: e.screenshot, // base64 data URL
          });
        }
      });
    }

    try {
      // Call background script to create issue via Atlassian MCP
      const result = await chrome.runtime.sendMessage({
        action: "panel:createJiraIssue",
        data: {
          elementText: elementText || elem.text || elem.label || "No content",
          pageUrl: pageInfo.url || window.location.href,
          pageTitle: pageInfo.title || document.title,
          screenshots: screenshots,
        },
      });

      // Update workflow message to show completion
      workflowMsg.isLoading = false;
      workflowMsg.content = "Workflow complete\n**Prepared Issue Fields**";
      this.renderMessages();

      if (result && result.success) {
        // Add success message with link
        const issueUrl = result.issueUrl || `https://${result.cloudId}/browse/${result.issueKey}`;
        this.messages.push({
          role: "assistant",
          content: `Issue created: **${result.issueKey}**\n\n[View in Jira](${issueUrl})`,
          timestamp: Date.now(),
        });
      } else {
        // Add error message
        this.messages.push({
          role: "assistant",
          content: `Failed to create issue: ${result?.error || "Unknown error"}`,
          isError: true,
          timestamp: Date.now(),
        });
      }

      this.saveState({ messages: this.messages });
      this.renderMessages();
    } catch (e) {
      // Update workflow message to show error
      workflowMsg.isLoading = false;
      workflowMsg.content = `Failed to create issue: ${e.message}`;
      workflowMsg.isError = true;
      this.saveState({ messages: this.messages });
      this.renderMessages();
    }
  }

  async handleInlineAction(action, msg, btn) {
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(msg.content);
        btn.classList.add("sb-inline-btn--success");
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Copied
        `;
        setTimeout(() => {
          btn.classList.remove("sb-inline-btn--success");
          btn.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copy
          `;
        }, 2000);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    } else if (action === "csv" && msg.extractedData) {
      this.downloadData(msg.extractedData, "csv", "extracted-data.csv");
    } else if (action === "json" && msg.extractedData) {
      this.downloadData(msg.extractedData, "json", "extracted-data.json");
    }
  }

  downloadData(data, format, filename) {
    let content, mimeType;

    if (format === "csv") {
      // Convert to CSV
      if (Array.isArray(data) && data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] || "")).join(","));
        content = [headers.join(","), ...rows].join("\n");
      } else {
        content = JSON.stringify(data);
      }
      mimeType = "text/csv";
    } else {
      content = JSON.stringify(data, null, 2);
      mimeType = "application/json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  createToolCallHtml(toolCall) {
    const statusLabels = {
      pending: "Pending",
      running: "Running",
      complete: "Done",
      error: "Error",
    };

    const statusLabel = statusLabels[toolCall.status] || toolCall.status;
    const toolName = this.formatToolName(toolCall.tool);
    const params = toolCall.params
      ? JSON.stringify(toolCall.params, null, 2).substring(0, 300)
      : "";

    // Build steps HTML if available
    let stepsHtml = "";
    if (toolCall.steps && toolCall.steps.length > 0) {
      stepsHtml = `
        <div class="sb-tool-block-steps">
          ${toolCall.steps.map((step, i) => {
            const stepStatus = i < toolCall.currentStep ? "done" : i === toolCall.currentStep ? "active" : "pending";
            return `
              <div class="sb-tool-step sb-tool-step--${stepStatus}">
                <div class="sb-tool-step-dot"></div>
                <span>${this.escapeHtml(step)}</span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <div class="sb-tool-block sb-tool-block--${toolCall.status}" data-tool-id="${toolCall.id || ""}">
        <div class="sb-tool-block-header" onclick="this.parentElement.classList.toggle('sb-tool-block--expanded')">
          <svg class="sb-tool-block-chevron" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
          <span class="sb-tool-block-title">${toolName}</span>
          <span class="sb-tool-block-status">${statusLabel}</span>
        </div>
        <div class="sb-tool-block-content">
          ${stepsHtml}
          ${params ? `<div class="sb-tool-block-params">${this.escapeHtml(params)}</div>` : ""}
        </div>
      </div>
    `;
  }

  formatToolName(tool) {
    // Convert tool names like "browser_click" to "Click element"
    const toolMappings = {
      browser_click: "Click element",
      browser_type: "Type text",
      browser_navigate: "Navigate",
      browser_extract: "Extract content",
      browser_snapshot: "Get page structure",
      run_workflow: "Running workflow",
      list_workflows: "List workflows",
      get_run_log: "Get run log",
      screenshot: "Capture screenshot",
    };

    if (toolMappings[tool]) {
      return toolMappings[tool];
    }

    // Convert snake_case to Title Case
    return tool
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  formatContent(text) {
    // Simple markdown-like formatting
    // Convert **bold** to <strong>
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Convert `code` to <code>
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Convert [text](url) to <a href="url">text</a>
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Convert newlines to <br>
    text = text.replace(/\n/g, "<br>");

    return text;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  addMessage(msg) {
    this.messages.push(msg);
    if (this.messageList) {
      // Remove empty state if present
      const empty = this.messageList.querySelector(".sb-empty");
      if (empty) empty.remove();

      // Remove loading indicator
      const loading = this.messageList.querySelector(".sb-message--loading");
      if (loading) loading.remove();

      this.messageList.appendChild(this.createMessageElement(msg));
      this.scrollToBottom();
    }
  }

  updateMessage(id, updates) {
    const idx = this.messages.findIndex((m) => m.id === id);
    if (idx !== -1) {
      Object.assign(this.messages[idx], updates);

      // Re-render that message
      const el = this.messageList?.querySelector(`[data-id="${id}"]`);
      if (el) {
        const newEl = this.createMessageElement(this.messages[idx]);
        el.replaceWith(newEl);
      }
    }
  }

  appendStreamChunk(messageId, chunk) {
    const idx = this.messages.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      this.messages[idx].content = (this.messages[idx].content || "") + chunk;

      const el = this.messageList?.querySelector(`[data-id="${messageId}"]`);
      if (el) {
        el.innerHTML = this.formatContent(this.messages[idx].content);
        this.scrollToBottom();
      }
    }
  }

  scrollToBottom() {
    if (this.messageList) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
  }

  // ============================================================================
  // Send Message
  // ============================================================================

  handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  async handleSend() {
    const text = this.input.value.trim();
    if (!text || this.isLoading) return;

    // Clear input
    this.input.value = "";
    this.input.style.height = "auto";

    // Close context menu
    this.contextMenu.classList.remove("sb-context-menu--open");

    // Build context from pending context message and options
    const context = {};

    // Include page info if enabled
    if (this.contextOptions.includePageInfo) {
      context.url = window.location.href;
      context.title = document.title;
    }

    // Include pending context (picked elements)
    if (this.pendingContext) {
      context.pickedElements = this.pendingContext.pickedElements;
      if (this.pendingContext.pageInfo) {
        context.pageInfo = this.pendingContext.pageInfo;
      }
      // Clear pending context after including it
      this.pendingContext = null;
    }

    // Include element screenshot if enabled
    if (this.contextOptions.includeElementScreenshot && context.pickedElements) {
      context.requestElementScreenshots = true;
    }

    // Send to background
    try {
      await chrome.runtime.sendMessage({
        action: "panel:sendMessage",
        data: { text, context },
      });
    } catch (e) {
      console.error("[SideButton Panel] Failed to send message:", e);
    }
  }

  async executeAction(messageId, actionId) {
    try {
      await chrome.runtime.sendMessage({
        action: "panel:executeAction",
        data: { messageId, actionId },
      });
    } catch (e) {
      console.error("[SideButton Panel] Failed to execute action:", e);
    }
  }

  // ============================================================================
  // Element Picker
  // ============================================================================

  startPicker() {
    if (this.isPickerActive) return;

    this.isPickerActive = true;
    this.pickedElements = [];

    // Show picker banner
    if (this.pickerBanner) {
      this.pickerBanner.classList.add("sb-picker-banner--active");
      this.updatePickerBanner();
    }

    // Add event listeners to the page
    document.addEventListener("mouseover", this.handlePickerHover, true);
    document.addEventListener("click", this.handlePickerClick, true);
    document.addEventListener("keydown", this.handlePickerKeyDown);

    // Add picker overlay style
    this.injectPickerStyles();

    console.log("[SideButton Panel] Picker started");
  }

  async stopPicker() {
    if (!this.isPickerActive) return;

    this.isPickerActive = false;

    // Hide picker banner
    if (this.pickerBanner) {
      this.pickerBanner.classList.remove("sb-picker-banner--active");
    }

    // Remove event listeners
    document.removeEventListener("mouseover", this.handlePickerHover, true);
    document.removeEventListener("click", this.handlePickerClick, true);
    document.removeEventListener("keydown", this.handlePickerKeyDown);

    // Remove highlight from any element
    this.clearPickerHighlight();

    // Remove picker styles
    this.removePickerStyles();

    // If we have picked elements, add them as a context message (no LLM call)
    const pickedCount = this.pickedElements.length;
    if (pickedCount > 0) {
      await this.addPickedElementsAsMessage();
    }

    // Reset picker state for next session
    this.pickedElements = [];

    console.log("[SideButton Panel] Picker stopped with", pickedCount, "elements");
  }

  handlePickerHover(e) {
    // Don't highlight our own panel
    if (this.shadowHost?.contains(e.target) || e.target === this.shadowHost) {
      return;
    }

    // Remove previous highlight
    this.clearPickerHighlight();

    // Add highlight to hovered element
    e.target.classList.add("sb-picker-highlight");
    this.currentHoveredElement = e.target;
  }

  handlePickerClick(e) {
    // Don't capture clicks on our panel
    if (this.shadowHost?.contains(e.target) || e.target === this.shadowHost) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;

    // Check if already picked
    const existingIdx = this.pickedElements.findIndex((p) => p.element === element);
    if (existingIdx !== -1) {
      // Unpick it
      this.pickedElements.splice(existingIdx, 1);
      element.classList.remove("sb-picker-selected");
    } else {
      // Pick it
      const selector = this.generateSelector(element);
      const label = this.generateLabel(element);
      this.pickedElements.push({ element, selector, label });
      element.classList.add("sb-picker-selected");
    }

    this.updatePickerBanner();
  }

  handlePickerKeyDown = (e) => {
    if (e.key === "Escape") {
      this.stopPicker();
    } else if (e.key === "Enter") {
      this.stopPicker();
    }
  };

  clearPicks() {
    // Remove selected class from all picked elements
    this.pickedElements.forEach((p) => {
      p.element?.classList.remove("sb-picker-selected");
    });
    this.pickedElements = [];
    this.updatePickerBanner();
  }

  clearPickerHighlight() {
    if (this.currentHoveredElement) {
      this.currentHoveredElement.classList.remove("sb-picker-highlight");
      this.currentHoveredElement = null;
    }
  }

  updatePickerBanner() {
    if (!this.pickerBanner) return;

    const picksContainer = this.pickerBanner.querySelector(".sb-picker-picks");
    if (!picksContainer) return;

    if (this.pickedElements.length === 0) {
      picksContainer.innerHTML = `<span class="sb-picker-empty">Click elements on the page to select them</span>`;
    } else {
      picksContainer.innerHTML = this.pickedElements
        .map(
          (p, i) => `
          <div class="sb-picker-pick">
            <span>${this.escapeHtml(p.label)}</span>
            <button class="sb-picker-pick-remove" data-idx="${i}">&times;</button>
          </div>
        `
        )
        .join("");

      // Add remove handlers
      picksContainer.querySelectorAll(".sb-picker-pick-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx, 10);
          if (this.pickedElements[idx]) {
            this.pickedElements[idx].element?.classList.remove("sb-picker-selected");
            this.pickedElements.splice(idx, 1);
            this.updatePickerBanner();
          }
        });
      });
    }
  }

  generateSelector(element) {
    // Generate a CSS selector for the element
    if (element.id) {
      return `#${element.id}`;
    }

    let path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .split(/\s+/)
          .filter((c) => c && !c.startsWith("sb-picker"))
          .slice(0, 2);
        if (classes.length > 0) {
          selector += "." + classes.join(".");
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // Limit depth
      if (path.length >= 3) break;
    }

    return path.join(" > ");
  }

  generateLabel(element) {
    // Generate a human-readable label for the element
    const tag = element.tagName.toLowerCase();

    // Use text content if short
    const text = element.textContent?.trim().substring(0, 30);
    if (text && text.length > 0 && text.length <= 25) {
      return text + (element.textContent.length > 30 ? "..." : "");
    }

    // Use aria-label or title
    if (element.getAttribute("aria-label")) {
      return element.getAttribute("aria-label").substring(0, 25);
    }
    if (element.title) {
      return element.title.substring(0, 25);
    }

    // Use tag + class
    const className = element.className?.split?.(" ")?.[0];
    if (className && !className.startsWith("sb-")) {
      return `${tag}.${className}`;
    }

    return tag;
  }

  async addPickedElementsAsMessage() {
    // Build element data for context
    const elementsData = [];

    for (const p of this.pickedElements) {
      // Always capture text content - it's essential for the LLM to understand the element
      const textContent = p.element?.textContent?.trim() || '';
      const elementData = {
        selector: p.selector,
        label: p.label,
        tagName: p.element?.tagName,
        attributes: this.getElementAttributes(p.element),
        // Always include text content (not just when option enabled)
        text: textContent.substring(0, 500) || null,
      };

      // Include innerHTML if option enabled
      if (this.contextOptions.includeElementContent) {
        elementData.innerHTML = p.element?.innerHTML?.substring(0, 1000);
      }

      // Capture screenshot if enabled and element exists
      if (this.contextOptions.includeElementScreenshot && p.element) {
        try {
          const rect = p.element.getBoundingClientRect();
          // Only capture if element is visible and has dimensions
          if (rect.width > 0 && rect.height > 0) {
            // Hide panel before screenshot to avoid capturing it
            if (this.shadowHost) {
              this.shadowHost.style.display = 'none';
            }
            // Small delay to ensure panel is hidden before capture
            await new Promise(r => setTimeout(r, 50));

            const response = await chrome.runtime.sendMessage({
              action: "panel:captureElementScreenshot",
              data: {
                bounds: {
                  x: rect.x,
                  y: rect.y,
                  width: Math.min(rect.width, 800),  // Cap width at 800px
                  height: Math.min(rect.height, 600), // Cap height at 600px
                  devicePixelRatio: window.devicePixelRatio,
                }
              }
            });

            // Show panel again
            if (this.shadowHost) {
              this.shadowHost.style.display = '';
            }

            if (response?.screenshot) {
              elementData.screenshot = response.screenshot;
              console.log('[SideButton Panel] Screenshot captured for element:', elementData.label);
            }
          }
        } catch (e) {
          console.error('[SideButton Panel] Screenshot capture failed:', e);
          // Ensure panel is shown even if error occurs
          if (this.shadowHost) {
            this.shadowHost.style.display = '';
          }
        }
      }

      console.log('[SideButton Panel] Element captured:', {
        label: elementData.label,
        textLength: textContent.length,
        textPreview: textContent.substring(0, 50),
        hasText: !!elementData.text,
        hasScreenshot: !!elementData.screenshot,
      });

      elementsData.push(elementData);
    }

    // Build page info if enabled
    let pageInfo = null;
    if (this.contextOptions.includePageInfo) {
      pageInfo = {
        url: window.location.href,
        title: document.title,
      };
    }

    // Create a context message (special type, not user/assistant)
    const contextMsg = {
      id: `ctx-${Date.now()}`,
      role: "context",
      pickedElements: elementsData,
      pageInfo: pageInfo,
      timestamp: Date.now(),
    };

    // Accumulate pending context (merge with existing if any)
    if (this.pendingContext && this.pendingContext.pickedElements) {
      // Merge elements from multiple picker sessions
      this.pendingContext.pickedElements = [
        ...this.pendingContext.pickedElements,
        ...elementsData,
      ];
    } else {
      this.pendingContext = {
        pickedElements: elementsData,
        pageInfo: pageInfo,
      };
    }

    // Add to messages and render
    this.messages.push(contextMsg);
    this.renderMessages();
    this.scrollToBottom();

    // Save state
    this.saveState({ messages: this.messages });

    // Focus input for user to type their request
    this.input?.focus();
  }

  addPickedElementsToContext() {
    // Legacy method - now handled by addPickedElementsAsMessage
    // Keep for compatibility
    this.contextOptions.pickedElements = this.pickedElements.map((p) => ({
      selector: p.selector,
      label: p.label,
      tagName: p.element?.tagName,
      attributes: this.getElementAttributes(p.element),
      text: p.element?.textContent?.trim().substring(0, 500),
    }));

    if (this.contextOptions.includePageInfo) {
      this.contextOptions.pageInfo = {
        url: window.location.href,
        title: document.title,
      };
    }
  }

  getElementAttributes(element) {
    if (!element) return {};
    const attrs = {};
    const importantAttrs = ["href", "src", "alt", "placeholder", "value", "type", "name", "id", "class"];
    importantAttrs.forEach((attr) => {
      if (element.hasAttribute(attr)) {
        attrs[attr] = element.getAttribute(attr)?.substring(0, 100);
      }
    });
    return attrs;
  }

  injectPickerStyles() {
    // Inject picker styles into the main document (not shadow DOM)
    if (document.getElementById("sb-picker-styles")) return;

    const style = document.createElement("style");
    style.id = "sb-picker-styles";
    style.textContent = `
      .sb-picker-highlight {
        outline: 2px dashed #15C39A !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
      }
      .sb-picker-selected {
        outline: 2px solid #15C39A !important;
        outline-offset: 2px !important;
        background-color: rgba(21, 195, 154, 0.1) !important;
      }
    `;
    document.head.appendChild(style);
  }

  removePickerStyles() {
    const style = document.getElementById("sb-picker-styles");
    if (style) {
      style.remove();
    }

    // Remove any lingering classes
    document.querySelectorAll(".sb-picker-highlight, .sb-picker-selected").forEach((el) => {
      el.classList.remove("sb-picker-highlight", "sb-picker-selected");
    });
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  destroy() {
    if (this.shadowHost) {
      this.shadowHost.remove();
    }
  }
}

// ============================================================================
// Export for content script
// ============================================================================

// Create singleton instance
let chatPanelInstance = null;

function initChatPanel() {
  // Check both memory reference and DOM for duplicates (SPA navigation resets JS but keeps DOM)
  if (chatPanelInstance) return chatPanelInstance;
  if (document.getElementById("sidebutton-panel-host")) {
    console.log("[SideButton Panel] Host already exists in DOM, skipping init");
    return null;
  }

  chatPanelInstance = new ChatPanel();
  chatPanelInstance.init();
  return chatPanelInstance;
}

// Auto-init when script loads
if (typeof window !== "undefined") {
  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatPanel);
  } else {
    initChatPanel();
  }
}
