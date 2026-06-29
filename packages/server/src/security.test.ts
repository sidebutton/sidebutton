import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { REDACTED_SECRET, type Settings } from '@sidebutton/core';
import {
  isLoopbackHost,
  isLoopbackAddress,
  redactSettings,
  preserveLlmSecret,
  assessCallbackUrl,
  parseOriginList,
  getTrustedCallbackOrigins,
  isTrustedCallbackOrigin,
  isLoopbackOrigin,
  isAllowedCorsOrigin,
  makeCorsOriginDelegate,
  resolveApplyPath,
} from './security.js';

describe('isLoopbackHost', () => {
  it('treats loopback names and 127.0.0.0/8 as loopback', () => {
    for (const h of ['127.0.0.1', '127.5.6.7', '::1', 'localhost', 'LOCALHOST', '[::1]', 'ip6-localhost']) {
      expect(isLoopbackHost(h)).toBe(true);
    }
  });
  it('treats wide / LAN binds as non-loopback', () => {
    for (const h of ['0.0.0.0', '::', '172.31.41.132', '10.0.0.5', '192.168.1.9', '', undefined]) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});

describe('isLoopbackAddress', () => {
  it('matches loopback client addresses incl. IPv4-mapped', () => {
    for (const ip of ['127.0.0.1', '127.0.0.9', '::1', '::ffff:127.0.0.1', 'localhost']) {
      expect(isLoopbackAddress(ip)).toBe(true);
    }
  });
  it('rejects non-loopback client addresses', () => {
    for (const ip of ['172.31.41.132', '10.1.2.3', '::ffff:10.0.0.1', '169.254.0.1', undefined]) {
      expect(isLoopbackAddress(ip)).toBe(false);
    }
  });
});

describe('redactSettings', () => {
  const base = (): Settings => ({
    llm: { provider: 'openai', base_url: 'https://api.openai.com/v1', api_key: 'sk-secret-123', model: 'gpt-5.4-mini' },
    last_used_params: {},
    dashboard_shortcuts: [],
    user_contexts: [],
  });

  it('masks a non-empty api_key with the sentinel', () => {
    expect(redactSettings(base()).llm.api_key).toBe(REDACTED_SECRET);
  });
  it('leaves an empty api_key empty (distinguish configured vs not)', () => {
    const s = base(); s.llm.api_key = '';
    expect(redactSettings(s).llm.api_key).toBe('');
  });
  it('does not mutate the original settings', () => {
    const s = base();
    redactSettings(s);
    expect(s.llm.api_key).toBe('sk-secret-123');
  });
  it('preserves non-secret fields', () => {
    const out = redactSettings(base());
    expect(out.llm.provider).toBe('openai');
    expect(out.llm.model).toBe('gpt-5.4-mini');
  });
});

describe('preserveLlmSecret', () => {
  const current = { provider: 'openai' as const, base_url: 'u', api_key: 'sk-real', model: 'm' };
  it('keeps the stored key when the sentinel is echoed back', () => {
    const out = preserveLlmSecret({ ...current, api_key: REDACTED_SECRET }, current);
    expect(out?.api_key).toBe('sk-real');
  });
  it('writes through a genuine new key', () => {
    const out = preserveLlmSecret({ ...current, api_key: 'sk-new' }, current);
    expect(out?.api_key).toBe('sk-new');
  });
  it('allows clearing the key with an explicit empty value', () => {
    const out = preserveLlmSecret({ ...current, api_key: '' }, current);
    expect(out?.api_key).toBe('');
  });
  it('is a no-op when there is no incoming llm', () => {
    expect(preserveLlmSecret(undefined, current)).toBeUndefined();
  });
});

describe('assessCallbackUrl', () => {
  it('allows public http(s) endpoints', () => {
    expect(assessCallbackUrl('https://sidebutton.com/api/jobs/step-complete').allowed).toBe(true);
    expect(assessCallbackUrl('http://example.com:8443/cb').allowed).toBe(true);
  });
  it('blocks metadata / loopback / private / link-local literals', () => {
    for (const u of [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1/x',
      'http://[::1]/x',
      'http://10.0.0.1/x',
      'http://172.16.5.5/x',
      'http://192.168.1.1/x',
      'http://0.0.0.0/x',
      'http://100.64.0.1/x',
      'http://[fd00::1]/x',
      'http://[fe80::1]/x',
      'http://[::ffff:127.0.0.1]/x',
    ]) {
      expect(assessCallbackUrl(u).allowed, u).toBe(false);
    }
  });
  it('blocks internal hostnames and non-http schemes', () => {
    expect(assessCallbackUrl('http://localhost/x').allowed).toBe(false);
    expect(assessCallbackUrl('http://foo.localhost/x').allowed).toBe(false);
    expect(assessCallbackUrl('http://metadata.google.internal/x').allowed).toBe(false);
    expect(assessCallbackUrl('file:///etc/passwd').allowed).toBe(false);
    expect(assessCallbackUrl('gopher://x/').allowed).toBe(false);
    expect(assessCallbackUrl('not a url').allowed).toBe(false);
    expect(assessCallbackUrl(undefined).allowed).toBe(false);
  });
});

describe('trusted callback origins', () => {
  it('derives the portal origin from env', () => {
    const t = getTrustedCallbackOrigins({ PORTAL_URL: 'https://sidebutton.com' } as NodeJS.ProcessEnv);
    expect(t).toEqual(['https://sidebutton.com']);
  });
  it('parses + dedupes a mixed list', () => {
    expect(parseOriginList(['https://a.com/x , https://b.com', 'https://a.com', undefined, 'junk']))
      .toEqual(['https://a.com', 'https://b.com']);
  });
  it('forwards the bearer only to a trusted origin', () => {
    const trusted = ['https://sidebutton.com'];
    expect(isTrustedCallbackOrigin(new URL('https://sidebutton.com/api/jobs/step-complete'), trusted)).toBe(true);
    expect(isTrustedCallbackOrigin(new URL('https://attacker.example.com/cb'), trusted)).toBe(false);
  });
});

describe('CORS origin policy', () => {
  it('allows missing origin and loopback origins', () => {
    expect(isLoopbackOrigin('http://localhost:5173')).toBe(true);
    expect(isLoopbackOrigin('http://127.0.0.1:9876')).toBe(true);
    expect(isAllowedCorsOrigin(undefined, [])).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5173', [])).toBe(true);
  });
  it('denies arbitrary origins but allows configured ones', () => {
    expect(isAllowedCorsOrigin('http://attacker.example.com', [])).toBe(false);
    expect(isAllowedCorsOrigin('https://dash.example.com', ['https://dash.example.com'])).toBe(true);
  });
  it('delegate echoes the decision through the callback', () => {
    const delegate = makeCorsOriginDelegate({ SIDEBUTTON_CORS_ORIGINS: 'https://ok.example.com' } as NodeJS.ProcessEnv);
    const calls: Array<[Error | null, boolean]> = [];
    delegate('https://attacker.example.com', (e, a) => calls.push([e, a]));
    delegate('https://ok.example.com', (e, a) => calls.push([e, a]));
    delegate(undefined, (e, a) => calls.push([e, a]));
    expect(calls).toEqual([[null, false], [null, true], [null, true]]);
  });
});

describe('resolveApplyPath', () => {
  const home = '/home/agent';
  it('allows the home dir and paths inside it', () => {
    expect(resolveApplyPath('~/workspace/proj', home)).toBe('/home/agent/workspace/proj');
    expect(resolveApplyPath('/home/agent/workspace/proj', home)).toBe('/home/agent/workspace/proj');
    expect(resolveApplyPath('~', home)).toBe('/home/agent');
  });
  it('rejects absolute paths outside home and traversal escapes', () => {
    expect(resolveApplyPath('/etc/cron.d', home)).toBeNull();
    expect(resolveApplyPath('~/../root/.ssh', home)).toBeNull();
    expect(resolveApplyPath('/home/agent/../other', home)).toBeNull();
    expect(resolveApplyPath('', home)).toBeNull();
    expect(resolveApplyPath(undefined, home)).toBeNull();
  });
  it('normalises a contained .. that stays inside home', () => {
    expect(resolveApplyPath('~/workspace/../ws2', home)).toBe(path.resolve('/home/agent/ws2'));
  });
});
