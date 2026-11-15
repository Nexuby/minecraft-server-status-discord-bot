import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { z } from 'zod';

export type Edition = 'java' | 'bedrock' | 'legacy';
export type Language = 'en' | 'tr';
export type Status = {
  online: boolean; stale: boolean; checkedAt: string | null;
  players: number | null; maxPlayers: number | null; version: string | null;
  motd: string | null; latency: number | null; favicon: string | null;
};
export type Observation = { kind: 'status'; status: Status } | { kind: 'unavailable'; reason: 'rate-limit' | 'timeout' | 'upstream' };

export function normalizeAddress(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value || value.length > 253 || /[\s/@?#\\]/.test(value)) throw new Error('invalid-address');
  let host: string;
  let port: string | undefined;
  if (value.startsWith('[')) {
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
    if (!match || isIP(match[1]!) !== 6) throw new Error('invalid-address');
    host = `[${match[1]}]`; port = match[2];
  } else {
    if (value.split(':').length > 2) throw new Error('invalid-address');
    const parts = value.split(':'); host = domainToASCII(parts[0]!); port = parts[1];
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (!host || host.length > 253 || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('invalid-address');
    if (/^[\d.]+$/.test(host) && isIP(host) !== 4) throw new Error('invalid-address');
  }
  if (port !== undefined && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error('invalid-address');
  return `${host}${port === undefined ? '' : `:${Number(port)}`}`;
}

export const monitorSchema = z.object({
  id: z.uuid(), guildId: z.string().regex(/^\d{17,20}$/), channelId: z.string().regex(/^\d{17,20}$/),
  messageId: z.string().regex(/^\d{17,20}$/).nullable(),
  address: z.string().refine(v => { try { return normalizeAddress(v) === v; } catch { return false; } }),
  edition: z.enum(['java', 'bedrock', 'legacy']), language: z.enum(['en', 'tr']),
  label: z.string().min(1).max(80), alerts: z.boolean(), paused: z.boolean().default(false),
  createdAt: z.iso.datetime(), stable: z.boolean().nullable().default(null),
  candidate: z.boolean().nullable().default(null), candidateCount: z.number().int().min(0).default(0),
  candidateCheckedAt: z.string().nullable().default(null),
});
export type Monitor = z.infer<typeof monitorSchema>;

// A repeated cached sample must never count as an independent confirmation.
export function transition(m: Monitor, observation: Observation): { patch: Partial<Monitor>; changed: boolean | null } {
  if (observation.kind !== 'status' || observation.status.stale || !observation.status.checkedAt) {
    return { patch: { candidate: null, candidateCount: 0, candidateCheckedAt: null }, changed: null };
  }
  const { online, checkedAt } = observation.status;
  if (m.candidateCheckedAt && Date.parse(checkedAt) < Date.parse(m.candidateCheckedAt)) return { patch: {}, changed: null };
  if (m.stable === null) return { patch: { stable: online, candidate: null, candidateCount: 0, candidateCheckedAt: checkedAt }, changed: null };
  if (online === m.stable) return { patch: { candidate: null, candidateCount: 0, candidateCheckedAt: checkedAt }, changed: null };
  if (checkedAt === m.candidateCheckedAt) return { patch: {}, changed: null };
  const count = m.candidate === online ? m.candidateCount + 1 : 1;
  if (count >= 2) return { patch: { stable: online, candidate: null, candidateCount: 0, candidateCheckedAt: checkedAt }, changed: online };
  return { patch: { candidate: online, candidateCount: count, candidateCheckedAt: checkedAt }, changed: null };
}
