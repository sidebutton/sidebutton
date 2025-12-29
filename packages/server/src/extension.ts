/**
 * Chrome extension WebSocket client
 */

import type { WebSocket } from 'ws';
import type { ExtensionClient, ExtensionStatus } from '@sidebutton/core';

interface CommandResponse {
  ok: boolean;
  requestId?: number;
  result?: Record<string, unknown>;
  error?: string;
}

interface ExtensionEvent {
  event: string;
  [key: string]: unknown;
}

/**
 * Extension client implementation for browser automation
 */
export class ExtensionClientImpl implements ExtensionClient {
  private connected = false;
  private tabId?: number;
  private recording = false;
  private serverRunning = false;
  private socket: WebSocket | null = null;
  private requestCounter = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: CommandResponse) => void;
    reject: (error: Error) => void;
  }>();
  private eventListeners: ((event: ExtensionEvent) => void)[] = [];
  private statusChangeCallback?: (connected: boolean) => void;

  constructor() {}

  /**
   * Mark the server as running
   */
  markServerRunning(): void {
    this.serverRunning = true;
  }

  /**
   * Set callback for connection status changes
   */
  onStatusChange(callback: (connected: boolean) => void): void {
    this.statusChangeCallback = callback;
  }

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(socket: WebSocket): void {
    this.socket = socket;
    this.connected = true;

    // Notify status change
    this.statusChangeCallback?.(true);

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Check if it's a command response
        if ('requestId' in message && 'ok' in message) {
          const pending = this.pendingRequests.get(message.requestId);
          if (pending) {
            this.pendingRequests.delete(message.requestId);
            pending.resolve(message as CommandResponse);
          }
        } else if ('event' in message) {
          // It's an event
          this.handleEvent(message as ExtensionEvent);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    });

    socket.on('close', () => {
      this.connected = false;
      this.tabId = undefined;
      this.recording = false;
      this.socket = null;

      // Notify status change
      this.statusChangeCallback?.(false);

      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('Connection closed'));
      }
      this.pendingRequests.clear();
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    console.log('Chrome extension connected');
  }

  private handleEvent(event: ExtensionEvent): void {
    if (event.event === 'status') {
      if (typeof event.connected === 'boolean') {
        this.connected = event.connected;
      }
      if (typeof event.tabId === 'number') {
        this.tabId = event.tabId;
      }
      if (typeof event.recording === 'boolean') {
        this.recording = event.recording;
      }
    } else if (event.event === 'connected') {
      this.connected = true;
      if (typeof event.tabId === 'number') {
        this.tabId = event.tabId;
      }
    }

    // Notify listeners
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Add an event listener
   */
  onEvent(listener: (event: ExtensionEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Get current status
   */
  getStatus(): ExtensionStatus {
    return {
      server_running: this.serverRunning,
      browser_connected: this.connected,
      tab_id: this.tabId,
      recording: this.recording,
    };
  }

  /**
   * Send a command and wait for response
   */
  private async sendCommand(
    cmd: string,
    params: Record<string, unknown> = {}
  ): Promise<CommandResponse> {
    if (!this.socket || !this.connected) {
      throw new Error('Browser not connected');
    }

    const requestId = this.requestCounter++;

    const command = {
      cmd,
      requestId,
      ...params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Command timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.socket!.send(JSON.stringify(command));
    });
  }

  // ExtensionClient interface implementation

  async isConnected(): Promise<boolean> {
    return this.connected && this.socket !== null;
  }

  async navigate(url: string): Promise<void> {
    const response = await this.sendCommand('navigate', { url });
    if (!response.ok) {
      throw new Error(response.error ?? 'Navigate failed');
    }
  }

  async click(selector: string): Promise<void> {
    const response = await this.sendCommand('click', { selector });
    if (!response.ok) {
      throw new Error(response.error ?? 'Click failed');
    }
  }

  async typeText(selector: string, text: string, submit: boolean): Promise<void> {
    const response = await this.sendCommand('type', { selector, text, submit });
    if (!response.ok) {
      throw new Error(response.error ?? 'Type failed');
    }
  }

  async scroll(direction: string, amount: number): Promise<void> {
    const response = await this.sendCommand('scroll', { direction, amount });
    if (!response.ok) {
      throw new Error(response.error ?? 'Scroll failed');
    }
  }

  async extract(selector: string): Promise<string> {
    const response = await this.sendCommand('extract', { selector });
    if (!response.ok) {
      throw new Error(response.error ?? 'Extract failed');
    }
    return (response.result?.text as string) ?? '';
  }

  async extractAll(selector: string, separator: string): Promise<string> {
    const response = await this.sendCommand('extractAll', { selector, separator });
    if (!response.ok) {
      throw new Error(response.error ?? 'ExtractAll failed');
    }
    return (response.result?.text as string) ?? '';
  }

  async waitForElement(selector: string, timeout: number): Promise<void> {
    const response = await this.sendCommand('wait', { selector, timeout });
    if (!response.ok) {
      throw new Error(response.error ?? 'Wait failed');
    }
  }

  async exists(selector: string, timeout: number): Promise<boolean> {
    try {
      const response = await this.sendCommand('exists', { selector, timeout });
      if (!response.ok) return false;
      return (response.result?.exists as boolean) ?? false;
    } catch {
      return false;
    }
  }

  async hover(selector: string): Promise<void> {
    const response = await this.sendCommand('hover', { selector });
    if (!response.ok) {
      throw new Error(response.error ?? 'Hover failed');
    }
  }

  async pressKey(key: string, selector?: string): Promise<void> {
    const params: Record<string, unknown> = { key };
    if (selector) params.selector = selector;
    const response = await this.sendCommand('pressKey', params);
    if (!response.ok) {
      throw new Error(response.error ?? 'PressKey failed');
    }
  }

  async focus(): Promise<void> {
    const response = await this.sendCommand('focus', {});
    if (!response.ok) {
      throw new Error(response.error ?? 'Focus failed');
    }
  }

  /**
   * Capture page selectors for workflow development
   */
  async captureSelectors(): Promise<Record<string, unknown>> {
    const response = await this.sendCommand('captureSelectors', {});
    if (!response.ok) {
      throw new Error(response.error ?? 'Capture failed');
    }
    return response.result ?? {};
  }

  // =========================================================================
  // Recording Commands (port of extension.rs recording features)
  // =========================================================================

  private recordedEvents: Array<{
    event_type: string;
    selector?: string;
    text?: string;
    value?: string;
    url?: string;
    tag?: string;
    direction?: string;
    amount?: number;
    timestamp_ms: number;
  }> = [];
  private recordingStartTime?: number;

  /**
   * Start recording browser actions
   */
  async startRecording(): Promise<void> {
    const response = await this.sendCommand('startRecording', {});
    if (!response.ok) {
      throw new Error(response.error ?? 'Start recording failed');
    }
    this.recording = true;
    this.recordedEvents = [];
    this.recordingStartTime = Date.now();
  }

  /**
   * Stop recording and return events
   */
  async stopRecording(): Promise<Array<{
    event_type: string;
    selector?: string;
    text?: string;
    value?: string;
    url?: string;
    tag?: string;
    direction?: string;
    amount?: number;
    timestamp_ms: number;
  }>> {
    const response = await this.sendCommand('stopRecording', {});
    if (!response.ok) {
      throw new Error(response.error ?? 'Stop recording failed');
    }
    this.recording = false;

    // Get events from response
    const events = (response.result?.events as Array<{
      event_type: string;
      selector?: string;
      text?: string;
      value?: string;
      url?: string;
      tag?: string;
      direction?: string;
      amount?: number;
      timestamp_ms: number;
    }>) ?? this.recordedEvents;

    this.recordedEvents = [];
    this.recordingStartTime = undefined;
    return events;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get recorded events (while recording is in progress)
   */
  getRecordedEvents(): Array<{
    event_type: string;
    selector?: string;
    text?: string;
    value?: string;
    url?: string;
    tag?: string;
    direction?: string;
    amount?: number;
    timestamp_ms: number;
  }> {
    return this.recordedEvents;
  }

  /**
   * Capture screenshot
   */
  async screenshot(): Promise<string> {
    const response = await this.sendCommand('screenshot', {});
    if (!response.ok) {
      throw new Error(response.error ?? 'Screenshot failed');
    }
    const imageData = (response.result?.image as string) ?? '';
    if (!imageData) {
      throw new Error('Screenshot returned empty data');
    }
    return imageData;
  }

  /**
   * Capture accessibility snapshot (BrowserMCP-compatible YAML format)
   * @param options.includeContent - If true, includes visible text content as markdown
   */
  async ariaSnapshot(options: { includeContent?: boolean } = {}): Promise<string> {
    const response = await this.sendCommand('ariaSnapshot', {
      includeContent: options.includeContent ?? false,
    });
    if (!response.ok) {
      throw new Error(response.error ?? 'AriaSnapshot failed');
    }
    return (response.result?.snapshot as string) ?? '';
  }

  /**
   * Click element by ref (from aria snapshot)
   */
  async clickRef(ref: number): Promise<void> {
    const response = await this.sendCommand('clickRef', { ref: String(ref) });
    if (!response.ok) {
      throw new Error(response.error ?? 'ClickRef failed');
    }
  }

  /**
   * Type text into element by ref (from aria snapshot)
   */
  async typeRef(ref: number, text: string, submit: boolean = false): Promise<void> {
    const response = await this.sendCommand('typeRef', { ref: String(ref), text, submit });
    if (!response.ok) {
      throw new Error(response.error ?? 'TypeRef failed');
    }
  }
}
