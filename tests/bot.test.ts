import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionFlagsBits, type Client, type Interaction } from 'discord.js';
import { alertCard, monitorList, safeText, statusCard } from '../src/cards.js';
import { commands } from '../src/commands.js';
import { loadConfig } from '../src/config.js';
import { Cooldowns, createHandler } from '../src/handlers.js';
import { copy } from '../src/i18n.js';
import { transition } from '../src/model.js';
import { MonitorService, UserError, type Transport } from '../src/service.js';
import { Store } from '../src/store.js';
import { monitor, observation } from './fixtures.js';
import type { StatusClient } from '../src/api.js';

const directories: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'mcapi-service-')); directories.push(dir);
  const store = await Store.load(dir); const api = { get: vi.fn().mockResolvedValue(observation()) };
  const transport = { send: vi.fn().mockResolvedValue(monitor().messageId), edit: vi.fn().mockResolvedValue(undefined), alert: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) } satisfies Transport;
  const log = vi.fn(); const service = new MonitorService(store, api, transport, { perGuild: 2, total: 3, pollMs: 60000 }, log);
  const { guildId, channelId, address, edition, label, language, alerts } = monitor();
  const input = { guildId, channelId, address, edition, label, language, alerts };
  return { store, api, transport, service, input, log };
}
describe('Discord cards', () => {
  it.each(['en', 'tr'] as const)('renders online, offline, stale and unavailable distinctly in %s', language => {
    const m = monitor({ language }); const t = copy(language);
    const online = statusCard(m, observation()).embeds[0]!.toJSON();
    expect(online.description).toContain(t.online); expect(online.fields?.[0]?.value).toContain('42');
    expect(statusCard(m, observation(false)).embeds[0]!.toJSON().description).toContain(t.offline);
    const stale = statusCard(m, observation(true, undefined, true)).embeds[0]!.toJSON(); expect(stale.description).toContain(t.staleNote); expect(stale.color).not.toBe(online.color);
    const unavailable = statusCard(m, { kind: 'unavailable', reason: 'upstream' }).embeds[0]!.toJSON(); expect(unavailable.description).toContain(t.unavailableNote); expect(unavailable.fields).toBeUndefined();
  });
  it('bounds untrusted MOTD/version text and prevents mentions/format injection', () => {
    const result = observation(); if (result.kind !== 'status') throw Error();
    result.status.motd = '@everyone **fake** '.repeat(1000); result.status.version = 'a'.repeat(3000);
    const card = statusCard(monitor(), result); const json = card.embeds[0]!.toJSON();
    expect(json.description!.length).toBeLessThan(1200); expect(json.description).not.toContain('@everyone');
    expect(json.fields!.every(f => f.value.length <= 1024)).toBe(true); expect(card.allowedMentions.parse).toEqual([]);
    expect(safeText('§aHello\u202eevil')).toBe('Helloevil');
  });
  it('uses observation time, not check request time', () => {
    const card = statusCard(monitor(), observation()); expect(card.embeds[0]!.toJSON().timestamp).toBe('2026-11-15T00:00:00.000Z');
  });
  it('paginates large monitor lists inside Discord embed limits', () => {
    const items = Array.from({ length: 25 }, () => monitor({ id: randomUUID(), label: '*'.repeat(80), address: `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.example.org` }));
    const first = monitorList(items, 'en', '123456789012345678'); const last = monitorList(items, 'en', '123456789012345678', 999);
    expect(first.embeds[0]!.length).toBeLessThan(6000); expect(first.embeds[0]!.toJSON().description!.length).toBeLessThan(4096);
    expect(first.embeds[0]!.toJSON().footer?.text).toBe('1 / 5'); expect(last.embeds[0]!.toJSON().footer?.text).toBe('5 / 5');
    expect(monitorList([], 'tr', '123456789012345678').content).toBe(copy('tr').empty);
  });
  it('creates valid localized command payloads with management permissions', () => {
    expect(commands).toHaveLength(4); expect(commands.find(c => c.name === 'monitor')?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
    for (const c of commands) { expect(c.name_localizations?.tr).toBeTruthy(); expect(JSON.stringify(c)).not.toContain('DISCORD_TOKEN'); }
    expect(alertCard(monitor(), true).allowedMentions.parse).toEqual([]);
  });
});
describe('monitor orchestration', () => {
  it('creates a card, persists its ID and initializes without alerts', async () => {
    const { service, input, store, transport } = await setup(); const m = await service.add(input);
    expect(store.get(m.id)?.messageId).toBe(monitor().messageId); expect(store.get(m.id)?.stable).toBe(true); expect(transport.alert).not.toHaveBeenCalled();
  });
  it('enforces duplicate/capacity checks under concurrent additions', async () => {
    const { service, input, store } = await setup();
    const results = await Promise.allSettled([service.add(input), service.add(input)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(store.list()).toHaveLength(1);
    await service.add({ ...input, address: 'two.example' }); await expect(service.add({ ...input, address: 'three.example' })).rejects.toMatchObject({ key: 'limit' });
  });
  it('rolls back a reservation if Discord rejects the card', async () => {
    const { service, input, store, transport } = await setup(); transport.send.mockRejectedValue(new Error('cannot send'));
    await expect(service.add(input)).rejects.toThrow(); expect(store.list()).toHaveLength(0);
  });
  it('blocks cross-guild deletion', async () => {
    const { service, input, transport } = await setup(); const m = await service.add(input);
    await expect(service.remove(m.id, '999999999999999999')).rejects.toBeInstanceOf(UserError); expect(transport.delete).not.toHaveBeenCalled();
  });
  it('edits the existing card and only notifies after distinct fresh confirmations', async () => {
    const { service, api, input, store, transport } = await setup(); const m = await service.add(input);
    api.get.mockResolvedValue(observation(false, '2026-11-15T00:01:00.000Z'));
    await service.refresh(m.id); await service.refresh(m.id); expect(transport.alert).not.toHaveBeenCalled();
    api.get.mockResolvedValue(observation(false, '2026-11-15T00:02:00.000Z')); await service.refresh(m.id);
    expect(transport.send).toHaveBeenCalledTimes(1); expect(transport.alert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: m.id }), false); expect(store.get(m.id)?.stable).toBe(false);
  });
  it('does not treat API errors as offline or alert on stale data', async () => {
    const { service, api, input, store, transport } = await setup(); const m = await service.add(input);
    api.get.mockResolvedValue({ kind: 'unavailable', reason: 'timeout' }); await service.refresh(m.id);
    api.get.mockResolvedValue(observation(false, undefined, true)); await service.refresh(m.id);
    expect(store.get(m.id)?.stable).toBe(true); expect(transport.alert).not.toHaveBeenCalled();
  });
  it('pauses a deleted status message instead of reposting', async () => {
    const { service, input, transport, store } = await setup(); const m = await service.add(input);
    transport.edit.mockRejectedValue(Object.assign(new Error(), { code: 10008 })); await service.refresh(m.id);
    expect(store.get(m.id)?.paused).toBe(true); await service.refresh(m.id); expect(transport.edit).toHaveBeenCalledTimes(1); expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it('pauses if required channel permissions are removed', async () => {
    const { service, input, transport, store } = await setup(); const m = await service.add(input);
    transport.edit.mockRejectedValue(new UserError('channel')); await service.refresh(m.id); expect(store.get(m.id)?.paused).toBe(true);
  });
  it('deduplicates simultaneous refreshes', async () => {
    const { service, input, api, transport } = await setup(); const m = await service.add(input);
    let finish!: (value: ReturnType<typeof observation>) => void; api.get.mockImplementation(() => new Promise(r => { finish = r; }));
    const one = service.refresh(m.id); const two = service.refresh(m.id); finish(observation()); await Promise.all([one, two]); expect(transport.edit).toHaveBeenCalledTimes(1);
  });
  it('removes persisted monitor even when deleting the old message fails', async () => {
    const { service, input, store, transport } = await setup(); const m = await service.add(input); transport.delete.mockRejectedValue(new Error());
    await service.remove(m.id, m.guildId); expect(store.list()).toHaveLength(0);
  });
  it('ignores out-of-order observations', () => {
    const m = monitor({ stable: true, candidate: false, candidateCount: 1, candidateCheckedAt: '2026-11-15T00:03:00.000Z' });
    expect(transition(m, observation(false, '2026-11-15T00:02:00.000Z'))).toEqual({ patch: {}, changed: null });
  });
});
describe('interaction defenses', () => {
  it('expires per-user cooldowns', () => { let time = 0; const c = new Cooldowns(() => time); expect(c.take('a', 3000)).toBe(true); expect(c.take('a', 3000)).toBe(false); expect(c.take('b', 3000)).toBe(true); time = 3000; expect(c.take('a', 3000)).toBe(true); });
  it('checks Manage Server even if command visibility is overridden', async () => {
    const { service } = await setup(); const editReply = vi.fn();
    const interaction = { locale: 'en-US', guildId: monitor().guildId, user: { id: '123' }, commandName: 'monitor', deferred: true,
      memberPermissions: { has: () => false }, isAutocomplete: () => false, isButton: () => false, isChatInputCommand: () => true, isRepliable: () => true,
      deferReply: vi.fn(), editReply, options: { getBoolean: () => false } } as unknown as Interaction;
    await createHandler({} as Client, {} as StatusClient, service, loadConfig({ DISCORD_TOKEN: 'x'.repeat(40) }))(interaction);
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ content: copy('en').permission }));
  });
});
