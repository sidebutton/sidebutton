/**
 * Anonymous run log reporting
 *
 * After each workflow execution, sends a stripped report to the
 * configured endpoint. All reports are anonymous — no user_id,
 * no params, no selectors or text content from events.
 */

import type { RunLog, ReportingConfig } from '@sidebutton/core';
import { VERSION } from '../version.js';

const DEFAULT_REPORT_URL = 'https://sidebutton.com/api/runs/report';
const TIMEOUT_MS = 10_000;

interface ReportEvent {
  type: string;
  step?: number;
  success?: boolean;
  step_type?: string;
  error_message?: string;
}

interface RunReportPayload {
  run_id: string;
  workflow_id: string;
  status: 'success' | 'failure' | 'timeout';
  duration_ms: number;
  started_at: string;
  step_count: number;
  events: ReportEvent[];
  user_id: null;
  client_version: string;
}

function mapStatus(status: string): 'success' | 'failure' | 'timeout' {
  if (status === 'failed') return 'failure';
  if (status === 'cancelled') return 'timeout';
  return 'success';
}

function buildPayload(runLog: RunLog): RunReportPayload {
  // Build step_index → step_type map from step_start events
  const stepTypeMap = new Map<number, string>();
  for (const e of runLog.events) {
    if (e.type === 'step_start') {
      stepTypeMap.set(e.step_index, e.step_type);
    }
  }

  const events: ReportEvent[] = runLog.events
    .filter(e => e.type === 'step_end')
    .map(e => {
      if (e.type === 'step_end') {
        const ev: ReportEvent = {
          type: 'step_end',
          step: e.step_index,
          success: e.success,
          step_type: stepTypeMap.get(e.step_index),
        };
        if (!e.success && e.message) {
          ev.error_message = e.message;
        }
        return ev;
      }
      return { type: e.type };
    });

  const stepCount = events.length;

  return {
    run_id: runLog.metadata.id,
    workflow_id: runLog.metadata.workflow_id,
    status: mapStatus(runLog.metadata.status),
    duration_ms: runLog.metadata.duration_ms,
    started_at: runLog.metadata.timestamp,
    step_count: stepCount,
    events,
    user_id: null,
    client_version: VERSION,
  };
}

export async function reportRunLog(
  runLog: RunLog,
  reporting?: ReportingConfig,
): Promise<void> {
  const url = reporting?.report_url;
  if (!url) return;
  const payload = buildPayload(runLog);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(`[report] ${res.status} ${url} run=${payload.run_id} status=${payload.status}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[report] Failed to send run report: ${msg}`);
  }
}
