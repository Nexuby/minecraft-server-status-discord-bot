import MCAPITR from 'mcapitr';
import { z } from 'zod';
import { normalizeAddress, type Edition, type Observation } from './model.js';

const nonNegative = z.number().finite().nonnegative();
const responseSchema = z.object({
  online: z.boolean(), stale: z.boolean().optional(), checked_at: z.iso.datetime({ offset: true }).optional(),
  players: z.object({ online: nonNegative, max: nonNegative }).nullish(),
  version: z.object({ name: z.string() }).nullish(), motd: z.object({ clean: z.string() }).nullish(),
  roundTripLatency: nonNegative.nullish(), favicon: z.string().nullish(),
});

type SDK = Pick<MCAPITR, 'serverStatus'>;
export class StatusClient {
  private readonly sdk: SDK;
  private readonly cache = new Map<string, { expires: number; result: Observation }>();
  private readonly inflight = new Map<string, Promise<Observation>>();
  private cooldownUntil = 0;
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(baseURL: string, sdk?: SDK, private readonly now = Date.now) {
    this.sdk = sdk ?? new MCAPITR({ baseURL, timeoutMs: 10_000 });
  }
  async get(input: string, edition: Edition): Promise<Observation> {
    const address = normalizeAddress(input);
    const key = `${edition}:${address}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.result;
    if (this.cooldownUntil > this.now()) return { kind: 'unavailable', reason: 'rate-limit' };
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const pending = this.request(address, edition).then(result => {
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: this.now() + (result.kind === 'status' ? 30_000 : 10_000), result });
      return result;
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }
  private async request(address: string, edition: Edition): Promise<Observation> {
    // Reserve the slot before waking another waiter; concurrent slash commands cannot bypass this queue.
    if (this.active >= 3) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try {
      if (this.cooldownUntil > this.now()) return { kind: 'unavailable', reason: 'rate-limit' };
      let raw: unknown;
      try {
        raw = await this.sdk.serverStatus(address, { bedrock: edition === 'bedrock', legacy: edition === 'legacy' });
      } catch (error) {
        if (error instanceof MCAPITR.MCAPIError) {
          if (error.status === 429) {
            // SDK 2.1 exposes status/data, not Retry-After. Back off globally for one minute.
            this.cooldownUntil = this.now() + 60_000;
            return { kind: 'unavailable', reason: 'rate-limit' };
          }
          if (error.status === 404 && typeof error.data === 'object' && error.data !== null && 'online' in error.data && error.data.online === false) raw = error.data;
          else return { kind: 'unavailable', reason: error.code === 'ETIMEDOUT' ? 'timeout' : 'upstream' };
        } else return { kind: 'unavailable', reason: 'upstream' };
      }
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) return { kind: 'unavailable', reason: 'upstream' };
      const d = parsed.data;
      return { kind: 'status', status: {
        online: d.online, stale: d.stale ?? false, checkedAt: d.checked_at ?? null,
        players: d.players?.online ?? null, maxPlayers: d.players?.max ?? null,
        version: d.version?.name ?? null, motd: d.motd?.clean ?? null,
        latency: d.roundTripLatency ?? null, favicon: d.favicon ?? null,
      } };
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
}
