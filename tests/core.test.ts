import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MCAPITR from 'mcapitr';
import { StatusClient } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { normalizeAddress, transition, type Monitor, type Observation } from '../src/model.js';
import { acquireLock, Store } from '../src/store.js';

export const monitor = (extra: Partial<Monitor> = {}): Monitor => ({
  id: 'bd403ee1-a1dd-4f67-bafc-7e584bad9464', guildId: '123456789012345678',
  channelId: '223456789012345678', messageId: '323456789012345678', address: 'mc.hypixel.net',
  edition: 'java', label: 'Hypixel', language: 'en', alerts: true, paused: false,
  createdAt: '2026-11-15T00:00:00.000Z', stable: null, candidate: null,
  candidateCount: 0, candidateCheckedAt: null, ...extra,
});
export const observation = (online = true, time = '2026-11-15T00:00:00.000Z', stale = false): Observation => ({
  kind: 'status', status: { online, stale, checkedAt: time, players: 42, maxPlayers: 100,
    version: 'Paper 1.21', motd: 'Welcome!', latency: 48, favicon: null },
});
const raw = { online: true, checked_at: '2026-11-15T00:00:00.000Z', players: { online: 4, max: 50 } } as MCAPITR.ServerStatusResponse;
const directories: string[] = [];
async function temp() { const p = await mkdtemp(join(tmpdir(), 'mcapi-bot-test-')); directories.push(p); return p; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

describe('address and configuration boundaries', () => {
  it.each([[' MC.HYPIXEL.NET ', 'mc.hypixel.net'], ['play.example.net:019132', 'play.example.net:19132'], ['[2001:db8::1]:25565', '[2001:db8::1]:25565'], ['example.org.', 'example.org']])('normalizes %s', (input, output) => expect(normalizeAddress(input)).toBe(output));
  it.each(['https://example.org', 'host/path', '@everyone', 'host:0', 'host:65536', 'host:', 'bad host', '999.999.999.999', '[bad]', '2001:db8::1', '-bad.example', 'a'.repeat(254)])('rejects %s', input => expect(() => normalizeAddress(input)).toThrow('invalid-address'));
  it('does not leak invalid credential input', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'secret-input' })).toThrow('Invalid configuration: DISCORD_TOKEN');
  });
  it('sets conservative defaults', () => expect(loadConfig({ DISCORD_TOKEN: 'x'.repeat(40) }).pollMs).toBe(120000));
  it('rejects short polling and non-HTTPS remote base', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'x'.repeat(40), POLL_INTERVAL_SECONDS: '5' })).toThrow();
    expect(() => loadConfig({ DISCORD_TOKEN: 'x'.repeat(40), MCAPI_BASE_URL: 'http://example.org' })).toThrow();
  });
});
describe('mcapitr adapter', () => {
  it('uses SDK edition flags and coalesces/caches requests', async () => {
    const serverStatus = vi.fn().mockResolvedValue(raw);
    const api = new StatusClient('https://mcapi.tr/api/v1', { serverStatus });
    await Promise.all([api.get('MC.HYPIXEL.NET', 'bedrock'), api.get('mc.hypixel.net', 'bedrock')]);
    await api.get('mc.hypixel.net', 'bedrock');
    expect(serverStatus).toHaveBeenCalledExactlyOnceWith('mc.hypixel.net', { bedrock: true, legacy: false });
  });
  it('separates editions', async () => {
    const serverStatus = vi.fn().mockResolvedValue(raw); const api = new StatusClient('', { serverStatus });
    await api.get('example.org', 'java'); await api.get('example.org', 'legacy');
    expect(serverStatus).toHaveBeenLastCalledWith('example.org', { bedrock: false, legacy: true }); expect(serverStatus).toHaveBeenCalledTimes(2);
  });
  it('expires caches', async () => {
    let now = 0; const serverStatus = vi.fn().mockResolvedValue(raw); const api = new StatusClient('', { serverStatus }, () => now);
    await api.get('example.org', 'java'); now = 30001; await api.get('example.org', 'java'); expect(serverStatus).toHaveBeenCalledTimes(2);
  });
  it('backs off globally after SDK 429 without claiming offline', async () => {
    const error = new MCAPITR.MCAPIError('rate limited'); Object.assign(error, { status: 429 });
    const serverStatus = vi.fn().mockRejectedValue(error); const api = new StatusClient('', { serverStatus });
    expect(await api.get('a.example', 'java')).toEqual({ kind: 'unavailable', reason: 'rate-limit' });
    expect(await api.get('b.example', 'java')).toEqual({ kind: 'unavailable', reason: 'rate-limit' }); expect(serverStatus).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { online: 'true' }, { online: true, players: { online: -1, max: 5 } }])('does not trust malformed API responses', async value => {
    const api = new StatusClient('', { serverStatus: vi.fn().mockResolvedValue(value) }); expect((await api.get('example.org', 'java')).kind).toBe('unavailable');
  });
  it('accepts explicit offline status inside SDK 404 but not generic HTTP failures', async () => {
    const error = new MCAPITR.MCAPIError('offline'); Object.assign(error, { status: 404, data: { online: false } });
    const api = new StatusClient('', { serverStatus: vi.fn().mockRejectedValue(error) });
    const result = await api.get('example.org', 'java'); expect(result.kind === 'status' && result.status.online).toBe(false);
  });
  it('limits distinct concurrent SDK calls to three', async () => {
    let active = 0, peak = 0; const resolvers: Array<() => void> = [];
    const serverStatus = vi.fn(async () => { active++; peak = Math.max(peak, active); await new Promise<void>(r => resolvers.push(r)); active--; return raw; });
    const api = new StatusClient('', { serverStatus });
    const all = Promise.all(Array.from({ length: 9 }, (_, i) => api.get(`s${i}.example`, 'java')));
    for (let i = 0; i < 9; i++) { await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(0)); resolvers.shift()!(); }
    await all; expect(peak).toBe(3);
  });
});
describe('state confirmations', () => {
  it('initializes silently then requires two distinct fresh observations', () => {
    let m = monitor(); let result = transition(m, observation()); expect(result.changed).toBeNull(); m = { ...m, ...result.patch };
    result = transition(m, observation(false, '2026-11-15T00:01:00.000Z')); m = { ...m, ...result.patch }; expect(result.changed).toBeNull();
    expect(transition(m, observation(false, '2026-11-15T00:01:00.000Z')).changed).toBeNull();
    expect(transition(m, observation(false, '2026-11-15T00:02:00.000Z')).changed).toBe(false);
  });
  it('stale and API errors never produce downtime alerts', () => {
    const m = monitor({ stable: true, candidate: false, candidateCount: 1 });
    expect(transition(m, observation(false, undefined, true)).patch.candidateCount).toBe(0);
    expect(transition(m, { kind: 'unavailable', reason: 'upstream' }).changed).toBeNull();
  });
});
describe('persistent data', () => {
  it('serializes competing writes and reloads', async () => {
    const dir = await temp(); const store = await Store.load(dir); await store.mutate(d => d.push(monitor()));
    await Promise.all([store.patch(monitor().id, { alerts: false }), store.patch(monitor().id, { language: 'tr' })]);
    expect((await Store.load(dir)).list()[0]).toMatchObject({ alerts: false, language: 'tr' });
  });
  it('keeps snapshots isolated and rejects invalid mutation without changing disk', async () => {
    const dir = await temp(); const store = await Store.load(dir); await store.mutate(d => d.push(monitor()));
    store.list()[0]!.label = 'changed'; expect(store.get(monitor().id)?.label).toBe('Hypixel');
    const before = await readFile(join(dir, 'monitors.json'), 'utf8');
    await expect(store.patch(monitor().id, { address: 'bad/path' })).rejects.toThrow();
    expect(await readFile(join(dir, 'monitors.json'), 'utf8')).toBe(before);
  });
  it('fails closed on corrupt data', async () => {
    const dir = await temp(); await writeFile(join(dir, 'monitors.json'), '{broken');
    await expect(Store.load(dir)).rejects.toThrow('existing data has not been overwritten'); expect(await readFile(join(dir, 'monitors.json'), 'utf8')).toBe('{broken');
  });
  it('prevents two bot processes from editing the same data', async () => {
    const dir = await temp(); const release = await acquireLock(dir);
    await expect(acquireLock(dir)).rejects.toThrow('already'); await release(); const second = await acquireLock(dir); await second();
  });
});
