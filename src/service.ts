import { randomUUID } from 'node:crypto';
import type { StatusClient } from './api.js';
import type { Config } from './config.js';
import type { CopyKey } from './i18n.js';
import { transition, type Monitor, type Observation } from './model.js';
import type { Store } from './store.js';

export class UserError extends Error {
  constructor(public readonly key: CopyKey) {
    super(key);
  }
}
export interface Transport {
  send(m: Monitor, observation: Observation): Promise<string>;
  edit(m: Monitor, observation: Observation): Promise<void>;
  alert(m: Monitor, online: boolean): Promise<void>;
  delete(m: Monitor): Promise<void>;
}
const permanent = (e: unknown) =>
  (e instanceof UserError && e.key === 'channel') ||
  (typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    [10003, 10008, 50001, 50013].includes(Number(e.code)));
export class MonitorService {
  private readonly running = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private tickPromise?: Promise<void>;
  constructor(
    readonly store: Store,
    private readonly api: Pick<StatusClient, 'get'>,
    private readonly transport: Transport,
    private readonly config: Pick<Config, 'perGuild' | 'total' | 'pollMs'>,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async add(
    input: Pick<
      Monitor,
      'guildId' | 'channelId' | 'address' | 'edition' | 'label' | 'language' | 'alerts'
    >,
  ): Promise<Monitor> {
    const m: Monitor = {
      ...input,
      id: randomUUID(),
      messageId: null,
      createdAt: new Date().toISOString(),
      paused: false,
      stable: null,
      candidate: null,
      candidateCount: 0,
      candidateCheckedAt: null,
    };
    await this.store.mutate((draft) => {
      if (
        draft.length >= this.config.total ||
        draft.filter((x) => x.guildId === m.guildId).length >= this.config.perGuild
      )
        throw new UserError('limit');
      if (
        draft.some(
          (x) =>
            x.guildId === m.guildId &&
            x.channelId === m.channelId &&
            x.address === m.address &&
            x.edition === m.edition,
        )
      )
        throw new UserError('duplicate');
      draft.push(m);
    });
    let messageId: string | undefined;
    try {
      const observation = await this.api.get(m.address, m.edition);
      if (!this.store.get(m.id) || this.store.get(m.id)?.paused) throw new UserError('notFound');
      messageId = await this.transport.send(m, observation);
      await this.store.mutate((draft) => {
        const reserved = draft.find((item) => item.id === m.id);
        if (!reserved || reserved.paused) throw new UserError('notFound');
        Object.assign(reserved, { messageId, ...transition(m, observation).patch });
      });
      return this.store.get(m.id)!;
    } catch (error) {
      if (messageId) await this.transport.delete({ ...m, messageId }).catch(() => undefined);
      await this.store.remove(m.id);
      throw error;
    }
  }
  find(id: string, guildId: string): Monitor {
    const m = this.store.get(id);
    if (!m || m.guildId !== guildId) throw new UserError('notFound');
    return m;
  }
  async remove(id: string, guildId: string) {
    const m = this.find(id, guildId);
    await this.store.patch(id, { paused: true });
    await this.running.get(id);
    // Persist removal before touching Discord: a restart must never resurrect a removed monitor.
    await this.store.remove(id);
    await this.transport
      .delete(m)
      .catch(() => this.log(`Could not delete status message for monitor ${id}.`));
  }
  async pause(id: string, guildId: string, paused: boolean) {
    this.find(id, guildId);
    await this.store.patch(id, { paused });
    await this.running.get(id);
    if (!paused) await this.refresh(id);
  }
  refresh(id: string): Promise<void> {
    const active = this.running.get(id);
    if (active) return active;
    const run = this.update(id).finally(() => this.running.delete(id));
    this.running.set(id, run);
    return run;
  }
  private async update(id: string) {
    const m = this.store.get(id);
    if (!m || m.paused || !m.messageId) return;
    try {
      const observation = await this.api.get(m.address, m.edition);
      const current = this.store.get(id);
      if (!current || current.paused) return;
      await this.transport.edit(current, observation);
      const { patch, changed } = transition(current, observation);
      // Write state first to avoid repeated alerts after a restart. Discord delivery is best-effort.
      await this.store.patch(id, patch);
      const saved = this.store.get(id);
      if (changed !== null && current.alerts && saved && !saved.paused) {
        await this.transport
          .alert(current, changed)
          .catch(() => this.log(`Alert delivery failed for monitor ${id}; it will not be resent.`));
      }
    } catch (error) {
      if (permanent(error)) {
        await this.store.patch(id, { paused: true });
        this.log(
          `Monitor ${id} paused: status message/channel is missing or bot permissions were removed.`,
        );
      } else {
        this.log(`Monitor ${id} could not update; retrying on the next cycle.`);
        throw error;
      }
    }
  }
  async tick() {
    const items = this.store.list().filter((m) => !m.paused && m.messageId);
    // Sequential scheduling spreads load and guarantees one in-flight edit per monitor.
    for (const m of items) {
      if (this.stopped) break;
      await this.refresh(m.id).catch(() => undefined);
    }
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    const cycle = async () => {
      this.tickPromise = this.tick();
      await this.tickPromise;
      if (!this.stopped) {
        this.timer = setTimeout(() => {
          void cycle();
        }, this.config.pollMs);
        this.timer.unref();
      }
    };
    void cycle();
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.tickPromise;
    await Promise.allSettled(this.running.values());
  }
  async recoverPending() {
    // A crash during creation can leave an incomplete reservation. Never post a surprise replacement.
    await this.store.mutate((draft) => {
      for (let i = draft.length - 1; i >= 0; i--) if (!draft[i]!.messageId) draft.splice(i, 1);
    });
  }
}
