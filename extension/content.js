// SideButton Browser Extension - Content Script
// Handles element finding, coordinate calculation, and recording

let isRecording = false;
let lastInputValue = new Map(); // element -> value for debounced input capture
let extractOverlay = null; // Visual indicator for extract mode
let embedManager = null; // Initialized after class definition

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle ping synchronously for injection check
  if (msg.action === "ping") {
    sendResponse({ pong: true });
    return;
  }

  // Handle embed-related messages (no response needed)
  if (msg.action === "embedConfigs") {
    if (embedManager) {
      embedManager.setConfigs(msg.configs, msg.connected);
    }
    return;
  }
  if (msg.action === "embedStatus") {
    if (embedManager) {
      embedManager.setConnectionStatus(msg.connected, msg.enabled);
    }
    return;
  }
  if (msg.action === "embedResult") {
    if (embedManager) {
      embedManager.handleResult(msg.workflowId, msg.buttonId, msg.result);
    }
    return;
  }

  handleMessage(msg)
    .then((result) => {
      chrome.runtime.sendMessage({
        responseId: msg.requestId,
        ...result,
      }).catch(() => {}); // Ignore if extension context invalidated
    })
    .catch((e) => {
      chrome.runtime.sendMessage({
        responseId: msg.requestId,
        error: e.message,
      }).catch(() => {}); // Ignore if extension context invalidated
    });

  return true; // async response
});

async function handleMessage(msg) {
  switch (msg.action) {
    case "getCoordinates":
      return getCoordinates(msg.selector);

    case "extract":
      return extract(msg.selector);

    case "extractAll":
      return extractAll(msg.selector, msg.separator || ", ");

    case "waitForElement":
      return waitForElement(msg.selector, msg.timeout);

    case "exists":
      return checkExists(msg.selector, msg.timeout);

    case "snapshot":
      return getSnapshot();

    case "captureSelectors":
      return captureSelectors();

    case "focus":
      return focusElement(msg.selector);

    case "ariaSnapshot":
      return getAriaSnapshot(msg);

    case "getCoordinatesByRef":
      return getCoordinatesByRef(msg.ref);

    case "recording.start":
      startRecording();
      return { recording: true };

    case "recording.stop":
      stopRecording();
      return { recording: false };

    default:
      throw new Error(`Unknown action: ${msg.action}`);
  }
}

// ============================================================================
// Selector Engine
// ============================================================================

function findElement(selector, timeout = 0) {
  let element = null;

  // Check for custom pseudo-selectors FIRST (before querySelector which would throw)
  // If a custom pseudo-selector is matched, we handle it and return - don't fall through to querySelector

  // Handle custom :has-text() pseudo-selector
  const hasTextMatch = selector.match(/^(.+?):has-text\(['"](.+?)['"]\)$/);
  if (hasTextMatch) {
    const [, baseSelector, text] = hasTextMatch;
    return findByText(baseSelector, text); // Return result (or null) - don't try querySelector
  }

  // Handle :contains() (jQuery-style)
  const containsMatch = selector.match(/^(.+?):contains\(['"](.+?)['"]\)$/);
  if (containsMatch) {
    const [, baseSelector, text] = containsMatch;
    return findByText(baseSelector, text); // Return result (or null) - don't try querySelector
  }

  // Handle text-only selector (no base)
  const textOnlyMatch = selector.match(/^:has-text\(['"](.+?)['"]\)$/);
  if (textOnlyMatch) {
    return findByText("*", textOnlyMatch[1]); // Return result (or null) - don't try querySelector
  }

  // Try standard querySelector (for valid CSS selectors)
  try {
    element = document.querySelector(selector);
    if (element) return element;
  } catch (e) {
    // Invalid selector syntax - truly invalid CSS
    console.warn("[Assistant] Invalid selector:", selector, e.message);
  }

  return null;
}

function findByText(baseSelector, text) {
  const candidates = baseSelector === "*"
    ? document.body.querySelectorAll("*")
    : document.querySelectorAll(baseSelector);

  const lowerText = text.toLowerCase();

  for (const el of candidates) {
    // Check direct text content (not nested)
    const directText = getDirectTextContent(el).toLowerCase();
    if (directText.includes(lowerText)) {
      return el;
    }
  }

  // Fallback: check full textContent
  for (const el of candidates) {
    if (el.textContent?.toLowerCase().includes(lowerText)) {
      return el;
    }
  }

  return null;
}

function getDirectTextContent(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}

// ============================================================================
// Coordinate Calculation
// ============================================================================

async function getCoordinates(selector) {
  const element = findElement(selector);
  if (!element) {
    return { found: false, error: `Element not found: ${selector}` };
  }

  // Scroll into view if needed
  await scrollIntoViewIfNeeded(element);

  // Wait for element to be stable (not animating)
  await waitForStable(element);

  // Get center coordinates
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return {
    found: true,
    x: Math.round(x),
    y: Math.round(y),
    width: rect.width,
    height: rect.height,
  };
}

async function scrollIntoViewIfNeeded(element) {
  const rect = element.getBoundingClientRect();
  const isVisible =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!isVisible) {
    element.scrollIntoView({ behavior: "instant", block: "center" });
    // Wait for scroll to complete
    await sleep(100);
  }
}

async function waitForStable(element, timeout = 1000) {
  let lastRect = element.getBoundingClientRect();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await sleep(50);
    const newRect = element.getBoundingClientRect();

    if (
      Math.abs(newRect.x - lastRect.x) < 1 &&
      Math.abs(newRect.y - lastRect.y) < 1 &&
      Math.abs(newRect.width - lastRect.width) < 1 &&
      Math.abs(newRect.height - lastRect.height) < 1
    ) {
      return true; // Stable
    }

    lastRect = newRect;
  }

  return true; // Timeout reached, proceed anyway
}

// ============================================================================
// Wait for Element
// ============================================================================

async function waitForElement(selector, timeout = 30000) {
  const startTime = Date.now();

  // Check immediately
  let element = findElement(selector);
  if (element) return { found: true };

  // Use MutationObserver for efficient waiting
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      element = findElement(selector);
      if (element) {
        observer.disconnect();
        resolve({ found: true });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve({ found: false, timeout: true });
    }, timeout);

    // Also poll periodically (backup)
    const poll = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        clearInterval(poll);
        return;
      }
      element = findElement(selector);
      if (element) {
        clearInterval(poll);
        observer.disconnect();
        resolve({ found: true });
      }
    }, 500);
  });
}

// ============================================================================
// Check Element Existence (Non-Blocking)
// ============================================================================

/**
 * Check if an element exists on the page.
 * Unlike waitForElement, this does a quick check with short timeout
 * and returns true/false - it never throws or fails.
 */
async function checkExists(selector, timeout = 1000) {
  const startTime = Date.now();

  // Check immediately
  let element = findElement(selector);
  if (element) return { exists: true };

  // Short polling for the timeout duration
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      element = findElement(selector);
      if (element) {
        clearInterval(poll);
        resolve({ exists: true });
        return;
      }

      if (Date.now() - startTime >= timeout) {
        clearInterval(poll);
        resolve({ exists: false });
      }
    }, 100); // Check every 100ms for responsive feel

    // Safety timeout
    setTimeout(() => {
      clearInterval(poll);
      resolve({ exists: false });
    }, timeout + 50);
  });
}

/**
 * Focus an element on the page.
 */
function focusElement(selector) {
  const element = findElement(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  element.focus();
  return { focused: selector };
}

// ============================================================================
// Extract Text (Visible Only)
// ============================================================================

function extract(selector) {
  const element = findElement(selector);
  if (!element) {
    return { text: null, error: `Element not found: ${selector}` };
  }

  // For inputs, get value
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    return { text: element.value };
  }

  // Extract only visible text content
  const visibleText = getVisibleText(element);
  return { text: visibleText };
}

function extractAll(selector, separator) {
  const elements = document.querySelectorAll(selector);
  if (!elements || elements.length === 0) {
    return { text: null, error: `No elements found: ${selector}` };
  }

  const texts = [];
  for (const element of elements) {
    // For inputs, get value
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      if (element.value) texts.push(element.value);
    } else {
      const visibleText = getVisibleText(element);
      if (visibleText) texts.push(visibleText);
    }
  }

  return { text: texts.join(separator) };
}

/**
 * Extract visible text from an element, filtering out hidden content
 * and cleaning up whitespace for readable output.
 */
function getVisibleText(element) {
  const lines = [];

  function walk(node) {
    // Skip non-element nodes except text
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // Skip hidden elements
    const style = window.getComputedStyle(node);
    if (style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        node.getAttribute("aria-hidden") === "true") {
      return;
    }

    // Skip non-visible tags
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "path", "template"].includes(tag)) {
      return;
    }

    // For inputs, get value
    if (tag === "input" || tag === "textarea") {
      const val = node.value || node.placeholder;
      if (val) lines.push(val);
      return;
    }

    // Recurse into children
    for (const child of node.childNodes) {
      walk(child);
    }
  }

  walk(element);

  // Dedupe consecutive identical lines and join
  const deduped = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join("\n");
}

// ============================================================================
// Selector Capture (for workflow development)
// ============================================================================

/**
 * Capture useful selectors from the current page.
 * Returns structured data to help with workflow development.
 */
function captureSelectors() {
  const result = {
    url: window.location.href,
    title: document.title,
    selectors: {
      by_data_testid: [],
      by_aria_label: [],
      by_role: [],
      by_class: [],
    },
    interactive: [],
    forms: [],
  };

  // 1. Collect data-testid selectors
  const testIdElements = document.querySelectorAll("[data-testid]");
  const testIdCounts = new Map();
  for (const el of testIdElements) {
    const testId = el.getAttribute("data-testid");
    testIdCounts.set(testId, (testIdCounts.get(testId) || 0) + 1);
  }
  for (const [testId, count] of testIdCounts) {
    result.selectors.by_data_testid.push({
      selector: `[data-testid="${testId}"]`,
      count,
    });
  }

  // 2. Collect aria-label selectors
  const ariaElements = document.querySelectorAll("[aria-label]");
  const ariaCounts = new Map();
  for (const el of ariaElements) {
    const label = el.getAttribute("aria-label");
    if (label && label.length < 100) {
      ariaCounts.set(label, (ariaCounts.get(label) || 0) + 1);
    }
  }
  for (const [label, count] of ariaCounts) {
    result.selectors.by_aria_label.push({
      selector: `[aria-label="${label}"]`,
      count,
    });
  }

  // 3. Collect role selectors
  const roleElements = document.querySelectorAll("[role]");
  const roleCounts = new Map();
  for (const el of roleElements) {
    const role = el.getAttribute("role");
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }
  for (const [role, count] of roleCounts) {
    result.selectors.by_role.push({
      selector: `[role="${role}"]`,
      count,
    });
  }

  // 4. Collect semantic class selectors (skip utility classes)
  const allElements = document.querySelectorAll("*");
  const classCounts = new Map();
  const skipPatterns = /^(p-|m-|w-|h-|flex|grid|text-|bg-|border|rounded|shadow|hover:|focus:)/;

  for (const el of allElements) {
    if (!el.className || typeof el.className !== "string") continue;
    const classes = el.className.split(/\s+/).filter((c) => c.length > 3 && !skipPatterns.test(c));
    for (const cls of classes) {
      // Only count classes that look semantic (contain - or _ or are long)
      if (cls.includes("-") || cls.includes("_") || cls.length > 10) {
        classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
      }
    }
  }
  // Get top 50 most used semantic classes
  const sortedClasses = Array.from(classCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  for (const [cls, count] of sortedClasses) {
    result.selectors.by_class.push({
      selector: `.${CSS.escape(cls)}`,
      count,
    });
  }

  // 5. Collect interactive elements
  const interactiveSelectors = [
    "button",
    "a[href]",
    "input",
    "textarea",
    "select",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='tab']",
    "[onclick]",
  ];

  for (const sel of interactiveSelectors) {
    try {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const info = {
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          text: getDirectTextContent(el).substring(0, 50) || null,
          placeholder: el.placeholder || null,
          ariaLabel: el.getAttribute("aria-label") || null,
          testId: el.getAttribute("data-testid") || null,
          name: el.name || null,
          selector: generateSelector(el),
        };

        // Only add if we have some identifying info
        if (info.text || info.placeholder || info.ariaLabel || info.testId || info.name) {
          result.interactive.push(info);
        }
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  // Dedupe interactive elements by selector
  const seenSelectors = new Set();
  result.interactive = result.interactive.filter((el) => {
    if (seenSelectors.has(el.selector)) return false;
    seenSelectors.add(el.selector);
    return true;
  });

  // Limit to top 100 interactive elements
  result.interactive = result.interactive.slice(0, 100);

  // 6. Collect form elements
  const forms = document.querySelectorAll("form");
  for (const form of forms) {
    const formInfo = {
      id: form.id || null,
      name: form.name || null,
      action: form.action || null,
      fields: [],
    };

    const inputs = form.querySelectorAll("input, textarea, select");
    for (const input of inputs) {
      formInfo.fields.push({
        tag: input.tagName.toLowerCase(),
        type: input.type || null,
        name: input.name || null,
        placeholder: input.placeholder || null,
        selector: generateSelector(input),
      });
    }

    if (formInfo.fields.length > 0) {
      result.forms.push(formInfo);
    }
  }

  return result;
}

// ============================================================================
// DOM Snapshot
// ============================================================================

function getSnapshot() {
  const tree = buildTree(document.body);
  return { tree };
}

function buildTree(element, maxDepth = 5, currentDepth = 0) {
  if (currentDepth >= maxDepth) return null;
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

  // Skip hidden elements
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return null;
  }

  // Skip script/style tags
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "noscript", "svg", "path"].includes(tag)) {
    return null;
  }

  const node = {
    tag,
    text: getDirectTextContent(element).substring(0, 100),
  };

  // Include useful attributes
  if (element.id) node.id = element.id;
  if (element.className && typeof element.className === "string") {
    node.class = element.className.substring(0, 100);
  }
  if (element.getAttribute("aria-label")) {
    node.ariaLabel = element.getAttribute("aria-label");
  }
  if (element.getAttribute("data-testid")) {
    node.testId = element.getAttribute("data-testid");
  }
  if (element.name) node.name = element.name;
  if (element.type) node.type = element.type;
  if (element.href) node.href = element.href;

  // Recurse into children
  const children = [];
  for (const child of element.children) {
    const childNode = buildTree(child, maxDepth, currentDepth + 1);
    if (childNode) children.push(childNode);
  }

  if (children.length > 0) {
    node.children = children;
  }

  return node;
}

// ============================================================================
// Recording Mode
// ============================================================================

let scrollTimeout = null;
let lastScrollTime = 0;

function startRecording() {
  if (isRecording) return;
  isRecording = true;

  document.addEventListener("click", onRecordClick, true);
  document.addEventListener("input", onRecordInput, true);
  document.addEventListener("change", onRecordChange, true);
  window.addEventListener("scroll", onRecordScroll, true);
  document.addEventListener("keydown", onExtractKeyDown, true);
  document.addEventListener("keyup", onExtractKeyUp, true);

  console.log("[Assistant] Recording started");
}

function stopRecording() {
  if (!isRecording) return;

  // Flush any pending scroll event before stopping
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
    scrollTimeout = null;

    // Send final scroll event if there was significant scroll
    const currentScrollY = window.scrollY;
    const deltaY = currentScrollY - lastScrollY;
    if (Math.abs(deltaY) >= 50) {
      const direction = deltaY > 0 ? "down" : "up";
      const amount = Math.abs(Math.round(deltaY));
      const msg = {
        event: "scroll",
        direction,
        amount,
      };
      console.log("[Assistant] Flushing pending scroll:", direction, amount);
      chrome.runtime.sendMessage(msg).catch(() => {});
      lastScrollY = currentScrollY;
    }
  }

  isRecording = false;

  document.removeEventListener("click", onRecordClick, true);
  document.removeEventListener("input", onRecordInput, true);
  document.removeEventListener("change", onRecordChange, true);
  window.removeEventListener("scroll", onRecordScroll, true);
  document.removeEventListener("keydown", onExtractKeyDown, true);
  document.removeEventListener("keyup", onExtractKeyUp, true);

  lastInputValue.clear();
  hideExtractOverlay();
  console.log("[Assistant] Recording stopped");
}

function onRecordClick(e) {
  if (!isRecording) return;

  const element = e.target;
  const selector = generateSelector(element);
  const text = getDirectTextContent(element).substring(0, 50);
  const rect = element.getBoundingClientRect();

  // Alt+Click = Extract mode (capture text instead of click)
  if (e.altKey) {
    e.preventDefault();
    e.stopPropagation();

    // Get full text content for extraction (not truncated)
    const fullText = element.tagName === "INPUT" || element.tagName === "TEXTAREA"
      ? element.value
      : element.textContent?.trim() || "";

    const msg = {
      event: "extract",
      selector,
      text: fullText.substring(0, 500), // Reasonable limit for preview
      tag: element.tagName.toLowerCase(),
      position: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      },
    };

    console.log("[Assistant] Recording extract:", selector, fullText.substring(0, 50));
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }

  // Normal click
  const msg = {
    event: "click",
    selector,
    text,
    tag: element.tagName.toLowerCase(),
    position: {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    },
  };

  console.log("[Assistant] Recording click:", selector, text);
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function onRecordInput(e) {
  if (!isRecording) return;

  const element = e.target;

  // Debounce: store value, send on change/blur
  lastInputValue.set(element, element.value);
}

function onRecordChange(e) {
  if (!isRecording) return;

  const element = e.target;
  const selector = generateSelector(element);
  const value = element.value;

  // Clear debounce
  lastInputValue.delete(element);

  const msg = {
    event: "input",
    selector,
    value,
    tag: element.tagName.toLowerCase(),
  };

  console.log("[Assistant] Recording input:", selector, value.substring(0, 20));
  chrome.runtime.sendMessage(msg).catch(() => {});
}

let lastScrollY = window.scrollY;

function onRecordScroll(e) {
  if (!isRecording) return;

  // Debounce: only record scroll after 150ms of no scrolling
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    const currentScrollY = window.scrollY;
    const deltaY = currentScrollY - lastScrollY;

    // Only record significant scrolls (more than 50px)
    if (Math.abs(deltaY) < 50) {
      lastScrollY = currentScrollY;
      return;
    }

    const direction = deltaY > 0 ? "down" : "up";
    const amount = Math.abs(Math.round(deltaY));

    const msg = {
      event: "scroll",
      direction,
      amount,
    };

    console.log("[Assistant] Recording scroll:", direction, amount);
    chrome.runtime.sendMessage(msg).catch(() => {});

    lastScrollY = currentScrollY;
    scrollTimeout = null;
  }, 150);
}

// ============================================================================
// Extract Mode Overlay (Alt Key Visual Feedback)
// ============================================================================

function onExtractKeyDown(e) {
  if (!isRecording) return;
  if (e.key === "Alt") {
    showExtractOverlay();
  }
}

function onExtractKeyUp(e) {
  if (!isRecording) return;
  if (e.key === "Alt") {
    hideExtractOverlay();
  }
}

function showExtractOverlay() {
  if (extractOverlay) return;

  extractOverlay = document.createElement("div");
  extractOverlay.id = "assistant-extract-overlay";
  extractOverlay.innerHTML = `
    <div style="
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: #15C39A;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(21, 195, 154, 0.4);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideDown 0.2s ease-out;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"></path>
        <rect x="9" y="3" width="6" height="4" rx="2"></rect>
        <path d="M9 14l2 2 4-4"></path>
      </svg>
      Extract Mode: Click to capture text
    </div>
    <style>
      @keyframes slideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      #assistant-extract-overlay * {
        pointer-events: none;
      }
    </style>
  `;
  document.body.appendChild(extractOverlay);
}

function hideExtractOverlay() {
  if (extractOverlay) {
    extractOverlay.remove();
    extractOverlay = null;
  }
}

// ============================================================================
// Selector Generation (Element -> Selector)
// ============================================================================

function generateSelector(element) {
  // Priority 1: data-testid
  if (element.getAttribute("data-testid")) {
    return `[data-testid="${element.getAttribute("data-testid")}"]`;
  }
  if (element.getAttribute("data-test")) {
    return `[data-test="${element.getAttribute("data-test")}"]`;
  }
  if (element.getAttribute("data-cy")) {
    return `[data-cy="${element.getAttribute("data-cy")}"]`;
  }

  // Priority 2: unique ID
  if (element.id && isUniqueId(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  // Priority 3: aria-label
  if (element.getAttribute("aria-label")) {
    const label = element.getAttribute("aria-label");
    const selector = `[aria-label="${label}"]`;
    if (document.querySelectorAll(selector).length === 1) {
      return selector;
    }
  }

  // Priority 4: name (for form elements)
  if (element.name) {
    const selector = `[name="${element.name}"]`;
    if (document.querySelectorAll(selector).length === 1) {
      return selector;
    }
  }

  // Priority 5: role + text for buttons/links
  const tag = element.tagName.toLowerCase();
  if (["button", "a", "label"].includes(tag)) {
    const text = getDirectTextContent(element).trim();
    if (text && text.length < 50) {
      return `${tag}:has-text('${text.replace(/'/g, "\\'")}')`;
    }
  }

  // Priority 6: type + placeholder for inputs
  if (tag === "input") {
    const type = element.type || "text";
    const placeholder = element.placeholder;
    if (placeholder) {
      return `input[type="${type}"][placeholder="${placeholder}"]`;
    }
  }

  // Priority 7: class-based selector (be specific)
  if (element.className && typeof element.className === "string") {
    const classes = element.className.split(/\s+/).filter((c) => c.length > 0 && !c.includes(":"));
    if (classes.length > 0) {
      const selector = `${tag}.${classes.slice(0, 2).map(c => CSS.escape(c)).join(".")}`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Priority 8: nth-child path (fallback)
  return getNthChildPath(element);
}

function isUniqueId(id) {
  // Check it's not auto-generated (starts with :, contains random chars)
  if (id.startsWith(":") || id.match(/^[a-f0-9-]{32,}$/i)) {
    return false;
  }
  return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
}

function getNthChildPath(element, maxDepth = 3) {
  const parts = [];
  let current = element;
  let depth = 0;

  while (current && current !== document.body && depth < maxDepth) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;

    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
      } else {
        parts.unshift(tag);
      }
    } else {
      parts.unshift(tag);
    }

    current = parent;
    depth++;
  }

  return parts.join(" > ");
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Result Bubble - Displays workflow results in a popup below the button
// ============================================================================

class ResultBubble {
  constructor() {
    this.bubble = null;
    this.currentAnchor = null;
    this.clickOutsideHandler = this.handleClickOutside.bind(this);
  }

  /**
   * Show the result bubble below the anchor element
   */
  show(anchor, content, isError = false) {
    // Close any existing bubble first
    this.hide();

    this.currentAnchor = anchor;
    this.bubble = this.createBubbleElement(content, isError);
    document.body.appendChild(this.bubble);

    // Position below the anchor
    this.positionAt(anchor);

    // Animate in
    requestAnimationFrame(() => {
      this.bubble.style.opacity = "1";
      this.bubble.style.transform = "translateY(0)";
    });

    // Add click outside listener (delayed to avoid immediate trigger)
    setTimeout(() => {
      document.addEventListener("click", this.clickOutsideHandler, true);
    }, 100);
  }

  /**
   * Hide and remove the bubble
   */
  hide() {
    if (this.bubble) {
      document.removeEventListener("click", this.clickOutsideHandler, true);
      this.bubble.remove();
      this.bubble = null;
      this.currentAnchor = null;
    }
  }

  /**
   * Handle clicks outside the bubble
   */
  handleClickOutside(e) {
    if (this.bubble && !this.bubble.contains(e.target) && e.target !== this.currentAnchor) {
      this.hide();
    }
  }

  /**
   * Create the bubble DOM element with header and improved readability
   */
  createBubbleElement(content, isError) {
    const bubble = document.createElement("div");
    bubble.className = "ta-result-bubble";

    // Inline styles for the bubble container - Sidebutton schema (teal primary)
    Object.assign(bubble.style, {
      position: "absolute",
      zIndex: "2147483647",
      maxWidth: "520px",
      minWidth: "300px",
      maxHeight: "480px",
      backgroundColor: "#ffffff",
      borderRadius: "12px",
      border: "1px solid #E2E8F0",
      borderLeft: "3px solid #15C39A",
      boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "14px",
      lineHeight: "1.6",
      color: "#0F172A",
      opacity: "0",
      transform: "translateY(-6px)",
      transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
      overflow: "hidden",
    });

    // Arrow pointing up - matches header background
    const arrow = document.createElement("div");
    Object.assign(arrow.style, {
      position: "absolute",
      top: "-8px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "0",
      height: "0",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderBottom: "8px solid #F8FAFC",
      filter: "drop-shadow(0 -1px 2px rgba(15, 23, 42, 0.06))",
    });
    bubble.appendChild(arrow);

    // Header bar - subtle surface
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      background: "#F8FAFC",
      borderBottom: "1px solid #E2E8F0",
    });

    // Header title
    const headerTitle = document.createElement("span");
    headerTitle.textContent = isError ? "Error" : "Summary";
    Object.assign(headerTitle.style, {
      color: "#475569",
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.3px",
      textTransform: "none",
    });
    header.appendChild(headerTitle);

    // Close button in header
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      fontSize: "14px",
      color: "#94A3B8",
      cursor: "pointer",
      padding: "0",
      lineHeight: "1",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "6px",
      transition: "all 0.15s ease",
    });
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "#E2E8F0";
      closeBtn.style.color = "#475569";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "transparent";
      closeBtn.style.color = "#94A3B8";
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });
    header.appendChild(closeBtn);
    bubble.appendChild(header);

    // Content area with refined typography - Neutral Graphite
    const contentArea = document.createElement("div");
    Object.assign(contentArea.style, {
      padding: "16px 20px",
      maxHeight: "360px",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontSize: "15px",
      lineHeight: "1.7",
      color: "#1E293B",
      letterSpacing: "0.1px",
    });

    // Display content as-is
    contentArea.textContent = content;

    // Add error styling if needed - subtle error state
    if (isError) {
      bubble.style.borderLeft = "3px solid #EF4444";
      header.style.background = "#FEF2F2";
      header.style.borderBottom = "1px solid #FECACA";
      headerTitle.style.color = "#DC2626";
      arrow.style.borderBottomColor = "#FEF2F2";
      contentArea.style.color = "#991B1B";
      contentArea.style.backgroundColor = "#FFFBFB";
    }

    bubble.appendChild(contentArea);

    return bubble;
  }

  /**
   * Position the bubble below the anchor element
   */
  positionAt(anchor) {
    if (!this.bubble || !anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const bubbleRect = this.bubble.getBoundingClientRect();

    // Position below anchor, centered
    let left = anchorRect.left + (anchorRect.width / 2) - (bubbleRect.width / 2);
    let top = anchorRect.bottom + window.scrollY + 12; // 12px gap for arrow

    // Keep within viewport horizontally
    const padding = 10;
    if (left < padding) {
      left = padding;
    } else if (left + bubbleRect.width > window.innerWidth - padding) {
      left = window.innerWidth - bubbleRect.width - padding;
    }

    // Adjust arrow position based on bubble offset
    const arrow = this.bubble.querySelector("div");
    if (arrow) {
      const arrowOffset = anchorRect.left + (anchorRect.width / 2) - left;
      arrow.style.left = `${arrowOffset}px`;
    }

    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
  }
}

// ============================================================================
// Embedded Workflow Buttons (V2 - Multi-target with context extraction)
// ============================================================================

class EmbedManager {
  constructor() {
    this.configs = [];
    // Map: buttonId -> { button, target, config }
    // buttonId format: `${workflowId}_${targetIndex}`
    this.injectedButtons = new Map();
    this.observer = null;
    this.connected = false;
    this.enabled = true;
    this.resultBubble = new ResultBubble();
  }

  setConfigs(configs, connected) {
    console.log(`[Assistant] EmbedManager.setConfigs: ${configs?.length || 0} configs, connected=${connected}`);
    if (configs?.length) {
      configs.forEach(c => console.log(`[Assistant]   - ${c.id}: ${c.title}`, c.embed));
    }
    this.configs = configs || [];
    this.connected = connected;
    this.refresh();
  }

  setConnectionStatus(connected, enabled) {
    this.connected = connected;
    this.enabled = enabled !== false;
    this.updateButtonVisibility();
  }

  refresh() {
    // Remove old buttons
    this.removeAllButtons();

    if (!this.enabled || !this.connected || this.configs.length === 0) {
      this.stopObserver();
      return;
    }

    // Inject buttons for each config
    for (const config of this.configs) {
      this.injectButtons(config);
    }

    // Start observing DOM for dynamic content
    this.startObserver();
  }

  /**
   * Validate that all required params have mappings configured.
   * A param is "satisfied" if it has a mapping in param_map that is either:
   * - A literal value (e.g., "tldr")
   * - A template referencing a built-in key (e.g., "{{_url}}", "{{_path.0}}")
   * - A template referencing an extract key (e.g., "{{pr_number}}")
   */
  validateRequiredParams(config) {
    const { params, embed } = config;
    if (!params) return true; // No params = nothing required

    const paramMap = embed?.param_map || {};
    const extractKeys = embed?.extract ? Object.keys(embed.extract) : [];
    const builtinKeys = ['_url', '_domain', '_pathname', '_title', '_path'];

    for (const paramName of Object.keys(params)) {
      const mapValue = paramMap[paramName];

      // No mapping at all - param not configured
      if (mapValue === undefined || mapValue === null || mapValue === '') {
        console.log(`[Assistant] validateRequiredParams: Missing mapping for '${paramName}'`);
        return false;
      }

      // Check if it's a template reference like "{{contextKey}}"
      const templateMatch = String(mapValue).match(/^\{\{(.+?)\}\}$/);
      if (templateMatch) {
        const contextKey = templateMatch[1];
        // Built-in context keys are always available
        const isBuiltin = builtinKeys.includes(contextKey) || contextKey.startsWith('_path.');
        if (!isBuiltin && !extractKeys.includes(contextKey)) {
          console.log(`[Assistant] validateRequiredParams: No extract config for '${contextKey}' (param: ${paramName})`);
          return false;
        }
      }
      // Literal values are always valid
    }

    return true;
  }

  /**
   * V2: Inject buttons for ALL matching targets (not just first)
   */
  injectButtons(config) {
    const { id, title, embed } = config;

    console.log(`[Assistant] injectButtons for ${id}:`, embed);

    // Validate required params have mappings before injecting
    if (!this.validateRequiredParams(config)) {
      console.log(`[Assistant] ${id}: Required params not configured, skipping injection`);
      return;
    }

    // Check "when" condition if specified
    if (embed.when && !document.querySelector(embed.when)) {
      console.log(`[Assistant] ${id}: 'when' condition not met:`, embed.when);
      return;
    }

    // V2: Find ALL target elements (querySelectorAll)
    const targets = document.querySelectorAll(embed.selector);
    console.log(`[Assistant] ${id}: Found ${targets.length} targets for selector:`, embed.selector);
    if (!targets.length) return;

    let injectedCount = 0;
    let filteredCount = 0;

    targets.forEach((target, index) => {
      const buttonId = `${id}_${index}`;

      // Don't inject duplicate - but check if button is still in DOM
      if (this.injectedButtons.has(buttonId)) {
        const entry = this.injectedButtons.get(buttonId);
        // If button was removed from DOM (SPA navigation), clean up and re-inject
        if (!entry.button.isConnected) {
          this.injectedButtons.delete(buttonId);
        } else {
          return;
        }
      }

      // V2: Check parent_filter if specified
      if (embed.parent_filter && !this.matchesParentFilter(target, embed.parent_filter)) {
        filteredCount++;
        return;
      }

      this.injectSingleButton(buttonId, target, config);
      injectedCount++;
    });

    console.log(`[Assistant] ${id}: Injected ${injectedCount} buttons, filtered out ${filteredCount}`);
  }

  /**
   * V2: Evaluate parent_filter condition
   */
  matchesParentFilter(target, filter) {
    // Find ancestor matching the selector
    const parent = target.closest(filter.selector);
    if (!parent) {
      console.log(`[Assistant] parent_filter: No parent found for selector:`, filter.selector);
      return false;
    }

    const match = filter.match;
    if (!match) return true;

    // Find element to check (parent itself or a child)
    const element = match.child_selector
      ? parent.querySelector(match.child_selector)
      : parent;
    if (!element) {
      console.log(`[Assistant] parent_filter: No child element found for:`, match.child_selector);
      return false;
    }

    // Get the value to check
    let value;
    if (match.attribute === "textContent") {
      value = element.textContent?.trim();
    } else if (match.attribute === "innerText") {
      value = element.innerText?.trim();
    } else {
      value = element.getAttribute(match.attribute);
    }

    console.log(`[Assistant] parent_filter: attribute='${match.attribute}', value='${value?.substring(0, 50)}...'`);

    // Check match criteria
    if (match.equals !== undefined && match.equals !== null) {
      const result = value === match.equals;
      console.log(`[Assistant] parent_filter: equals '${match.equals}' = ${result}`);
      return result;
    }
    if (match.contains !== undefined && match.contains !== null) {
      const result = value?.includes(match.contains) || false;
      console.log(`[Assistant] parent_filter: contains '${match.contains}' = ${result}`);
      return result;
    }

    return true;
  }

  /**
   * Create and inject a single button for a target
   */
  injectSingleButton(buttonId, target, config) {
    const { id, title, embed } = config;

    // Create button
    const button = document.createElement("button");
    button.className = "ta-embed-btn";
    button.setAttribute("data-workflow-id", id);
    button.setAttribute("data-button-id", buttonId);
    button.textContent = embed.label || title;
    button.title = title;

    // Style as modern button - Sidebutton schema with teal primary
    // Using cssText with !important for site compatibility
    button.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      vertical-align: middle !important;
      position: relative !important;
      z-index: 9999 !important;
      gap: 8px !important;
      padding: 8px 16px !important;
      margin: 8px 12px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      background: linear-gradient(135deg, #15C39A 0%, #0EA87D 100%) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 20px !important;
      color: white !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      white-space: nowrap !important;
      box-shadow: 0 2px 8px rgba(21, 195, 154, 0.35) !important;
      min-height: 36px !important;
      letter-spacing: 0.2px !important;
      outline: none !important;
      text-decoration: none !important;
      width: auto !important;
      max-width: fit-content !important;
    `;

    button.addEventListener("mouseenter", () => {
      button.style.setProperty("background", "linear-gradient(135deg, #0EA87D 0%, #0a7c6a 100%)", "important");
      button.style.setProperty("box-shadow", "0 4px 16px rgba(21, 195, 154, 0.5), 0 0 0 3px rgba(21, 195, 154, 0.2)", "important");
    });
    button.addEventListener("mouseleave", () => {
      button.style.setProperty("background", "linear-gradient(135deg, #15C39A 0%, #0EA87D 100%)", "important");
      button.style.setProperty("box-shadow", "0 2px 8px rgba(21, 195, 154, 0.35)", "important");
    });

    // Click handler - V2: extract context from this specific target
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleButtonClick(buttonId, target, config);
    });

    // Insert at position
    switch (embed.position) {
      case "before":
        target.parentNode.insertBefore(button, target);
        break;
      case "after":
        target.parentNode.insertBefore(button, target.nextSibling);
        break;
      case "prepend":
        target.insertBefore(button, target.firstChild);
        break;
      case "append":
      default:
        target.appendChild(button);
        break;
    }

    // Store button with its target and config for context extraction
    this.injectedButtons.set(buttonId, { button, target, config });
  }

  /**
   * V2: Handle button click with context extraction
   */
  handleButtonClick(buttonId, target, config) {
    const { id, title, embed } = config;
    const entry = this.injectedButtons.get(buttonId);
    if (!entry) return;

    const { button } = entry;

    // Visual feedback - result handler will update when complete
    button.style.setProperty("opacity", "0.7", "important");
    button.textContent = "Running...";

    // V2: Extract context from the target element
    const context = {
      _url: window.location.href,
      _domain: window.location.hostname,
      _pathname: window.location.pathname,
      _title: document.title,
      _path: window.location.pathname.split('/').filter(Boolean),
    };

    // Extract configured values relative to target
    if (embed.extract) {
      for (const [key, extractConfig] of Object.entries(embed.extract)) {
        try {
          // Support "self" selector to extract from target element itself
          // Use document.querySelector for absolute selectors (starting with # or containing spaces)
          const useDocument = extractConfig.selector?.startsWith('#') || extractConfig.selector?.includes(' ') || extractConfig.multiple;

          // Handle multiple: true - extract from all matching elements
          if (extractConfig.multiple) {
            const elements = document.querySelectorAll(extractConfig.selector);
            if (elements.length > 0) {
              const values = [];
              elements.forEach(el => {
                let value;
                if (extractConfig.attribute === "textContent") {
                  value = el.textContent?.trim();
                } else if (extractConfig.attribute === "innerText") {
                  value = el.innerText?.trim();
                } else {
                  value = el.getAttribute(extractConfig.attribute);
                }
                if (value) {
                  values.push(value);
                }
              });
              if (values.length > 0) {
                const separator = extractConfig.separator || "\n";
                context[key] = values.join(separator);
              }
            }
            continue;
          }

          // Single element extraction
          let el;
          if (extractConfig.selector === 'self' || !extractConfig.selector) {
            el = target;
          } else if (useDocument) {
            el = document.querySelector(extractConfig.selector);
          } else {
            el = target.querySelector(extractConfig.selector);
          }
          if (el) {
            let value;
            if (extractConfig.attribute === "textContent") {
              value = el.textContent?.trim();
            } else if (extractConfig.attribute === "innerText") {
              value = el.innerText?.trim();
            } else {
              value = el.getAttribute(extractConfig.attribute);
            }
            // Apply pattern regex if specified
            if (value && extractConfig.pattern) {
              try {
                const match = value.match(new RegExp(extractConfig.pattern));
                value = match ? (match[1] || match[0]) : value;
              } catch (regexErr) {
                console.warn(`[Assistant] Invalid pattern for ${key}:`, regexErr.message);
              }
            }
            if (value) {
              context[key] = value;
            }
          }
        } catch (e) {
          console.warn(`[Assistant] Failed to extract ${key}:`, e.message);
        }
      }
    }

    console.log("[Assistant] Embed click context:", context);

    // Send to background with extracted context and param_map
    chrome.runtime.sendMessage({
      action: "embedClick",
      workflowId: id,
      buttonId,
      context,
      paramMap: embed.param_map || null,
    }).catch(() => {}); // Ignore if extension context invalidated
  }

  /**
   * Handle result from background after workflow run
   * Supports result.action: "bubble" (default) or "type" (type into selector)
   */
  handleResult(workflowId, buttonId, result) {
    const entry = this.injectedButtons.get(buttonId);
    if (!entry) return;

    const { button, config } = entry;
    const originalText = config.embed.label || config.title;
    const resultConfig = config.embed.result || {};
    const action = resultConfig.action || "bubble";

    // Reset button state - Sidebutton teal
    button.textContent = originalText;
    button.style.setProperty("opacity", "1", "important");
    button.style.setProperty("background", "linear-gradient(135deg, #15C39A 0%, #0EA87D 100%)", "important");

    if (result?.error) {
      // Always show errors in bubble
      this.resultBubble.show(button, result.error, true);
    } else if (action === "none") {
      // Suppress result display - workflow handles its own output (e.g., types into field)
      this.showSuccessState(button, originalText, buttonId);
    } else if (result?.content) {
      // Handle based on action type
      if (action === "type" && resultConfig.selector) {
        // Type the result into the specified element
        this.typeResultIntoElement(resultConfig.selector, result.content, button, originalText, buttonId);
      } else {
        // Default: show result content in bubble
        this.resultBubble.show(button, result.content, false);
      }
    } else {
      // Fallback: just show success state on button briefly
      this.showSuccessState(button, originalText, buttonId);
    }
  }

  /**
   * Type result content into a target element (for LinkedIn-style integrations)
   */
  typeResultIntoElement(selector, content, button, originalText, buttonId) {
    const targetElement = document.querySelector(selector);
    if (!targetElement) {
      console.warn(`[Assistant] Result target not found: ${selector}`);
      this.resultBubble.show(button, content, false); // Fallback to bubble
      return;
    }

    try {
      // Focus the element first
      targetElement.focus();

      // Handle contenteditable elements (like LinkedIn's message box)
      if (targetElement.isContentEditable || targetElement.contentEditable === "true") {
        // Step 1: Clear existing content by selecting all and deleting
        // This properly triggers React/framework state updates
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(targetElement);
        selection.removeAllRanges();
        selection.addRange(range);

        // Delete selected content first (triggers proper state updates)
        document.execCommand("delete", false, null);

        // Step 2: Insert new text
        document.execCommand("insertText", false, content);

        // Step 3: Dispatch events to ensure framework picks up changes
        targetElement.dispatchEvent(new Event("input", { bubbles: true }));
        targetElement.dispatchEvent(new Event("change", { bubbles: true }));

        console.log(`[Assistant] Typed into contenteditable: ${selector}`);
      } else if (targetElement.tagName === "INPUT" || targetElement.tagName === "TEXTAREA") {
        // Handle regular input/textarea
        targetElement.select(); // Select all
        targetElement.value = content;
        targetElement.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: content }));
      } else {
        // Fallback: set textContent
        targetElement.textContent = content;
      }

      // Show success state on button
      this.showSuccessState(button, originalText, buttonId);
    } catch (e) {
      console.error(`[Assistant] Failed to type into ${selector}:`, e);
      this.resultBubble.show(button, content, false); // Fallback to bubble
    }
  }

  /**
   * Show brief success state on button
   */
  showSuccessState(button, originalText, buttonId) {
    button.textContent = "Done";
    button.style.setProperty("background", "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)", "important");
    setTimeout(() => {
      if (this.injectedButtons.has(buttonId)) {
        button.textContent = originalText;
        button.style.setProperty("background", "linear-gradient(135deg, #15C39A 0%, #0EA87D 100%)", "important");
      }
    }, 2000);
  }

  updateButtonVisibility() {
    const shouldShow = this.connected && this.enabled;
    for (const [id, entry] of this.injectedButtons) {
      entry.button.style.display = shouldShow ? "inline-flex" : "none";
    }
  }

  removeAllButtons() {
    for (const [id, entry] of this.injectedButtons) {
      entry.button.remove();
    }
    this.injectedButtons.clear();
  }

  startObserver() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      // Debounce: check after DOM settles
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        for (const config of this.configs) {
          this.injectButtons(config);
        }
      }, 500);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

embedManager = new EmbedManager();

// ============================================================================
// Accessibility Snapshot (BrowserMCP-compatible)
// ============================================================================

let ariaRefCounter = 0;
let ariaRefMap = new Map(); // ref number -> element

/**
 * Generate accessibility snapshot in YAML format with element refs.
 * Compatible with BrowserMCP's snapshot format for AI agent interaction.
 * @param {Object} options
 * @param {boolean} options.includeContent - If true, includes visible text content as markdown
 */
function getAriaSnapshot(options = {}) {
  const { includeContent = false } = options;

  ariaRefCounter = 0;
  ariaRefMap.clear();

  const lines = [];
  const url = window.location.href;
  const title = document.title;

  lines.push(`- Page URL: ${url}`);
  lines.push(`- Page Title: ${title}`);

  // Include page content if requested
  if (includeContent) {
    lines.push(`- Page Content`);
    lines.push("```markdown");
    const content = extractPageContent();
    lines.push(content);
    lines.push("```");
  }

  lines.push(`- Page Snapshot`);
  lines.push("```yaml");

  buildAriaTree(document.body, lines, 0);

  lines.push("```");

  return {
    snapshot: lines.join("\n"),
    refCount: ariaRefCounter,
  };
}

/**
 * Build YAML tree representation of accessible elements
 */
function buildAriaTree(element, lines, indent) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  // Skip hidden elements
  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return;
    }
  } catch (e) {
    // Skip if we can't get computed style
  }

  // Skip script/style/svg tags
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "noscript", "svg", "path", "template", "head", "meta", "link"].includes(tag)) {
    return;
  }

  const prefix = "  ".repeat(indent);
  const info = getAriaInfo(element);

  // Only include elements that have meaningful accessible information
  if (info.role || info.name || info.isInteractive) {
    const ref = ++ariaRefCounter;
    ariaRefMap.set(ref, element);

    let line = `${prefix}- ${info.role || tag}`;

    if (info.name) {
      line += ` "${info.name}"`;
    }

    // Add ref for interactive elements or elements with names
    if (info.isInteractive || info.name) {
      line += ` [ref=${ref}]`;
    }

    // Add state indicators
    if (info.checked !== undefined) {
      line += info.checked ? " [checked]" : " [unchecked]";
    }
    if (info.disabled) {
      line += " [disabled]";
    }
    if (info.expanded !== undefined) {
      line += info.expanded ? " [expanded]" : " [collapsed]";
    }
    if (info.selected) {
      line += " [selected]";
    }
    if (info.value) {
      line += `: "${info.value}"`;
    }

    lines.push(line);

    // Recurse into children
    for (const child of element.children) {
      buildAriaTree(child, lines, indent + 1);
    }
  } else {
    // Container element - just process children at same indent
    for (const child of element.children) {
      buildAriaTree(child, lines, indent);
    }
  }
}

/**
 * Extract accessible information from an element
 */
function getAriaInfo(element) {
  const tag = element.tagName.toLowerCase();
  const info = {
    role: null,
    name: null,
    value: null,
    checked: undefined,
    disabled: false,
    expanded: undefined,
    selected: false,
    isInteractive: false,
  };

  // Get explicit role or infer from tag
  info.role = element.getAttribute("role") || inferRole(element);

  // Get accessible name
  info.name = getAccessibleName(element);

  // Check if interactive
  const interactiveTags = ["a", "button", "input", "select", "textarea", "details", "summary"];
  const interactiveRoles = ["button", "link", "checkbox", "radio", "textbox", "combobox", "listbox", "menuitem", "tab", "switch"];
  info.isInteractive = interactiveTags.includes(tag) ||
    interactiveRoles.includes(info.role) ||
    element.hasAttribute("onclick") ||
    element.hasAttribute("tabindex") ||
    element.getAttribute("contenteditable") === "true";

  // Get value for form elements
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const type = element.type?.toLowerCase();
    if (type === "checkbox" || type === "radio") {
      info.checked = element.checked;
    } else if (element.value && type !== "password") {
      info.value = element.value.substring(0, 50);
    }
  }

  // Get states
  info.disabled = element.disabled || element.getAttribute("aria-disabled") === "true";
  info.selected = element.getAttribute("aria-selected") === "true" || element.selected;

  const expanded = element.getAttribute("aria-expanded");
  if (expanded !== null) {
    info.expanded = expanded === "true";
  }

  return info;
}

/**
 * Infer ARIA role from element tag
 */
function inferRole(element) {
  const tag = element.tagName.toLowerCase();
  const type = element.type?.toLowerCase();

  const roleMap = {
    a: element.hasAttribute("href") ? "link" : null,
    button: "button",
    input: getInputRole(type),
    select: "combobox",
    textarea: "textbox",
    img: "img",
    nav: "navigation",
    main: "main",
    header: "banner",
    footer: "contentinfo",
    aside: "complementary",
    article: "article",
    section: "region",
    form: "form",
    table: "table",
    thead: "rowgroup",
    tbody: "rowgroup",
    tr: "row",
    th: "columnheader",
    td: "cell",
    ul: "list",
    ol: "list",
    li: "listitem",
    dialog: "dialog",
    menu: "menu",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
  };

  return roleMap[tag] || null;
}

/**
 * Get role for input element based on type
 */
function getInputRole(type) {
  const inputRoleMap = {
    button: "button",
    submit: "button",
    reset: "button",
    checkbox: "checkbox",
    radio: "radio",
    text: "textbox",
    email: "textbox",
    password: "textbox",
    search: "searchbox",
    tel: "textbox",
    url: "textbox",
    number: "spinbutton",
    range: "slider",
  };
  return inputRoleMap[type] || "textbox";
}

/**
 * Get accessible name for an element
 */
function getAccessibleName(element) {
  // 1. aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  // 2. aria-labelledby
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labels = labelledBy.split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (labels.length) return labels.join(" ");
  }

  // 3. For inputs, check associated label
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent?.trim();
  }

  // 4. For buttons/links, use text content
  const tag = element.tagName.toLowerCase();
  if (["button", "a", "label", "legend", "caption", "summary"].includes(tag)) {
    const text = getDirectTextContent(element).trim();
    if (text) return text.substring(0, 80);
  }

  // 5. title attribute
  const title = element.getAttribute("title");
  if (title) return title.trim();

  // 6. placeholder for inputs
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();

  // 7. alt for images
  if (tag === "img") {
    const alt = element.getAttribute("alt");
    if (alt) return alt.trim();
  }

  // 8. For headings, get text content
  if (/^h[1-6]$/.test(tag)) {
    return element.textContent?.trim().substring(0, 80) || null;
  }

  return null;
}

/**
 * Find element by ref number
 */
function findElementByRef(ref) {
  return ariaRefMap.get(ref);
}

/**
 * Get coordinates for element by ref
 */
async function getCoordinatesByRef(ref) {
  const element = findElementByRef(ref);
  if (!element) {
    return { found: false, error: `Element not found for ref=${ref}` };
  }

  // Scroll into view if needed
  await scrollIntoViewIfNeeded(element);
  await waitForStable(element);

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return {
    found: true,
    x: Math.round(x),
    y: Math.round(y),
    width: rect.width,
    height: rect.height,
  };
}

// ============================================================================
// Content Extraction (for includeContent option)
// ============================================================================

/**
 * Extract page content as markdown.
 * Uses multi-strategy approach to work on any website.
 */
function extractPageContent() {
  const target = findMainContent();
  const content = extractTextWithStructure(target);

  // Truncate if too long (max ~50KB to avoid token overflow)
  const MAX_LENGTH = 50000;
  if (content.length > MAX_LENGTH) {
    return content.substring(0, MAX_LENGTH) + '\n\n[Content truncated...]';
  }

  return content;
}

/**
 * Multi-strategy content detection.
 * Works on: news sites, blogs, SPAs, documentation, e-commerce, legacy sites.
 */
function findMainContent() {
  // Strategy 1: Semantic HTML5 elements (ideal)
  let target = deepQuerySelector('main, article, [role="main"]');
  if (target && hasSubstantialContent(target)) return target;

  // Strategy 2: Common content class/id patterns
  const commonSelectors = [
    // Article/post content
    '.article-content', '.article-body', '.article__body',
    '.post-content', '.post-body', '.entry-content',
    '.story-body', '.story-content',
    // Generic content areas
    '.content-body', '.content-area', '.main-content',
    '#content', '#main-content', '#main',
    // Documentation sites
    '.markdown-body', '.prose', '.rich-text', '.documentation',
    // CMS patterns
    '.wysiwyg', '.text-content', '.page-content',
    // News sites
    '[data-article-body]', '[data-content]',
    // Product pages
    '.product-description', '.product-details'
  ];

  for (const selector of commonSelectors) {
    target = deepQuerySelector(selector);
    if (target && hasSubstantialContent(target)) return target;
  }

  // Strategy 3: Largest text block heuristic (works on any site)
  target = findLargestTextBlock();
  if (target) return target;

  // Strategy 4: Body fallback (strip nav/header/footer/aside)
  return createCleanBodyClone();
}

/**
 * Query selector that pierces Shadow DOM boundaries.
 */
function deepQuerySelector(selector, root = document) {
  // Try in light DOM first
  let result = root.querySelector(selector);
  if (result) return result;

  // Search through all shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      result = deepQuerySelector(selector, el.shadowRoot);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Check if element has meaningful content (not just navigation).
 */
function hasSubstantialContent(element) {
  const text = element.innerText || '';
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const links = element.querySelectorAll('a').length;
  const linkDensity = links / (wordCount || 1);

  // Must have decent word count and low link density
  return wordCount > 100 && linkDensity < 0.3;
}

/**
 * Find the DOM element with the highest content score.
 */
function findLargestTextBlock() {
  // Get candidates from light DOM
  let candidates = [...document.querySelectorAll('div, section, td')];

  // Add candidates from all shadow roots
  const shadowRoots = getAllShadowRoots();
  for (const shadowRoot of shadowRoots) {
    candidates.push(...shadowRoot.querySelectorAll('div, section, td'));
  }

  let best = null;
  let bestScore = 0;

  for (const el of candidates) {
    if (isBoilerplate(el)) continue;

    const score = calculateContentScore(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  // Minimum threshold
  return bestScore > 500 ? best : null;
}

/**
 * Get all shadow roots in the document.
 */
function getAllShadowRoots(root = document) {
  const shadowRoots = [];

  function findShadowRoots(element) {
    if (element.shadowRoot) {
      shadowRoots.push(element.shadowRoot);
      element.shadowRoot.querySelectorAll('*').forEach(findShadowRoots);
    }
  }

  root.querySelectorAll('*').forEach(findShadowRoots);
  return shadowRoots;
}

/**
 * Calculate content score for an element.
 * Higher score = more likely to be main content.
 */
function calculateContentScore(element) {
  const text = element.innerText || '';
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount < 50) return 0;

  // Factors that increase score
  const paragraphs = element.querySelectorAll('p').length;
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length;

  // Factors that decrease score
  const links = element.querySelectorAll('a').length;
  const inputs = element.querySelectorAll('input, button, select').length;
  const linkDensity = links / (wordCount || 1);
  const formDensity = inputs / (wordCount || 1);

  // Score formula
  let score = wordCount;
  score += paragraphs * 20;      // Paragraphs are good
  score += headings * 30;        // Headings indicate structure
  score *= (1 - linkDensity);    // Penalize link-heavy content
  score *= (1 - formDensity);    // Penalize form-heavy content

  // Bonus for semantic classes
  const className = (element.classList?.value || '').toLowerCase();
  if (/article|content|post|story|entry/.test(className)) {
    score *= 1.5;
  }

  // Penalty for boilerplate classes
  if (/sidebar|widget|comment|related|recommend/.test(className)) {
    score *= 0.3;
  }

  return score;
}

/**
 * Check if element is likely boilerplate (nav, footer, sidebar, ads).
 */
function isBoilerplate(element) {
  const tag = element.tagName.toLowerCase();
  if (['nav', 'header', 'footer', 'aside'].includes(tag)) return true;

  const role = element.getAttribute('role');
  if (['navigation', 'banner', 'contentinfo', 'complementary'].includes(role)) return true;

  const className = (element.classList?.value || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  const combined = className + ' ' + id;

  const boilerplatePatterns = [
    'nav', 'menu', 'header', 'footer', 'sidebar', 'aside',
    'widget', 'ad-', 'ads-', 'advertisement', 'promo',
    'social', 'share', 'comment', 'related', 'recommend',
    'newsletter', 'subscribe', 'popup', 'modal', 'cookie',
    'breadcrumb', 'pagination', 'tag-', 'category-'
  ];

  return boilerplatePatterns.some(p => combined.includes(p));
}

/**
 * Create a clean clone of body without boilerplate elements.
 */
function createCleanBodyClone() {
  const clone = document.body.cloneNode(true);

  // Remove boilerplate elements
  const removeSelectors = [
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.menu', '.header', '.footer', '.sidebar',
    '.ad', '.ads', '.advertisement', '.promo',
    '.social', '.share', '.comments', '.related',
    'script', 'style', 'noscript', 'svg', 'iframe'
  ];

  for (const selector of removeSelectors) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }

  return clone;
}

/**
 * Extract text content preserving document structure as markdown.
 */
function extractTextWithStructure(element) {
  const lines = [];
  const skipTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME',
    'NAV', 'HEADER', 'FOOTER', 'ASIDE'
  ]);

  function walk(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) lines.push(text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (skipTags.has(node.tagName)) return;
    if (isContentHidden(node)) return;
    if (isBoilerplate(node)) return;

    const tag = node.tagName.toLowerCase();

    // Headings → Markdown headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]);
      const text = node.textContent.trim();
      if (text) lines.push('\n' + '#'.repeat(level) + ' ' + text + '\n');
      return;
    }

    // Paragraphs → Double newline separated
    if (tag === 'p') {
      const text = node.textContent.trim();
      if (text) lines.push('\n' + text + '\n');
      return;
    }

    // List items → Markdown list
    if (tag === 'li') {
      const text = node.textContent.trim();
      if (text) lines.push('- ' + text);
      return;
    }

    // Blockquotes → Markdown quote
    if (tag === 'blockquote') {
      const text = node.textContent.trim();
      if (text) lines.push('\n> ' + text.replace(/\n/g, '\n> ') + '\n');
      return;
    }

    // Code blocks → Markdown code
    if (tag === 'pre' || tag === 'code') {
      const text = node.textContent.trim();
      if (text) {
        if (tag === 'pre' || text.includes('\n')) {
          lines.push('\n```\n' + text + '\n```\n');
        } else {
          lines.push('`' + text + '`');
        }
      }
      return;
    }

    // Tables → Simple text representation
    if (tag === 'table') {
      const text = node.textContent.trim().replace(/\s+/g, ' | ');
      if (text) lines.push('\n' + text + '\n');
      return;
    }

    // Links → Markdown links (inline)
    if (tag === 'a' && depth > 0) {
      const text = node.textContent.trim();
      const href = node.getAttribute('href');
      if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        lines.push(`[${text}](${href})`);
        return;
      }
    }

    // Images → Alt text
    if (tag === 'img') {
      const alt = node.getAttribute('alt');
      if (alt) lines.push(`[Image: ${alt}]`);
      return;
    }

    // Handle Shadow DOM - traverse into shadow root
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.childNodes) {
        walk(child, depth + 1);
      }
      return;
    }

    // Recurse for container elements
    for (const child of node.childNodes) {
      walk(child, depth + 1);
    }
  }

  walk(element);

  // Clean up output
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
    .replace(/^\s+|\s+$/g, '')   // Trim
    .replace(/[ \t]+/g, ' ');    // Normalize spaces
}

/**
 * Check if element is visually hidden.
 */
function isContentHidden(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

  try {
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (style.opacity === '0') return true;
  } catch (e) {
    // Skip if we can't get computed style
  }

  if (element.getAttribute('aria-hidden') === 'true') return true;
  if (element.hasAttribute('hidden')) return true;

  // Check for zero dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;

  return false;
}

// ============================================================================
// Initialization
// ============================================================================

console.log("[Assistant] Content script loaded");

// Request embed configs from background on load
chrome.runtime.sendMessage({ action: "requestEmbedConfigs" }).catch(() => {});
