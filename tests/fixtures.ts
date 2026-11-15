import type { Monitor, Observation } from '../src/model.js';
export const monitor = (extra: Partial<Monitor> = {}): Monitor => ({
  id: 'bd403ee1-a1dd-4f67-bafc-7e584bad9464',
  guildId: '123456789012345678',
  channelId: '223456789012345678',
  messageId: '323456789012345678',
  address: 'mc.hypixel.net',
  edition: 'java',
  label: 'Hypixel',
  language: 'en',
  alerts: true,
  paused: false,
  createdAt: '2026-11-15T00:00:00.000Z',
  stable: null,
  candidate: null,
  candidateCount: 0,
  candidateCheckedAt: null,
  ...extra,
});
export const observation = (
  online = true,
  time = '2026-11-15T00:00:00.000Z',
  stale = false,
): Observation => ({
  kind: 'status',
  status: {
    online,
    stale,
    checkedAt: time,
    players: 42,
    maxPlayers: 100,
    version: 'Paper 1.21',
    motd: 'Welcome!',
    latency: 48,
    favicon: null,
  },
});
