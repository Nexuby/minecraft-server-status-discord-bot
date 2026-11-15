import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { monitorSchema, type Monitor } from './model.js';

const fileSchema = z.object({ version: z.literal(1), monitors: z.array(monitorSchema).max(100) });
export class Store {
  private monitors: Monitor[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private readonly directory: string) {}
  static async load(directory: string) {
    const store = new Store(directory);
    await mkdir(directory, { recursive: true });
    try {
      const data = fileSchema.parse(
        JSON.parse(await readFile(join(directory, 'monitors.json'), 'utf8')),
      );
      if (new Set(data.monitors.map((m) => m.id)).size !== data.monitors.length)
        throw new Error('Duplicate monitor IDs');
      store.monitors = data.monitors;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw new Error(
          'Cannot read monitor data. Restore a backup; existing data has not been overwritten.',
        );
    }
    return store;
  }
  list(guildId?: string): Monitor[] {
    return structuredClone(this.monitors.filter((m) => !guildId || m.guildId === guildId));
  }
  get(id: string): Monitor | undefined {
    return this.list().find((m) => m.id === id);
  }
  async mutate<T>(fn: (draft: Monitor[]) => T): Promise<T> {
    const task = this.queue.then(async () => {
      const draft = structuredClone(this.monitors);
      const result = fn(draft);
      fileSchema.parse({ version: 1, monitors: draft });
      const temp = join(this.directory, `monitors.${randomUUID()}.tmp`);
      try {
        // fsync before atomic replacement. Readers never see half-written JSON.
        const handle = await open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify({ version: 1, monitors: draft }, null, 2));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temp, join(this.directory, 'monitors.json'));
      } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
      }
      this.monitors = draft;
      return result;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  async patch(id: string, patch: Partial<Monitor>) {
    return this.mutate((draft) => {
      const m = draft.find((m) => m.id === id);
      if (m) Object.assign(m, patch);
    });
  }
  async remove(id: string) {
    return this.mutate((draft) => {
      const i = draft.findIndex((m) => m.id === id);
      if (i >= 0) draft.splice(i, 1);
    });
  }
}

export async function acquireLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'bot.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await unlink(path).catch(() => undefined);
      };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      const pid = Number(await readFile(path, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error('Invalid bot.lock. Verify no bot process is running before removing it.');
      try {
        process.kill(pid, 0);
      } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
          await unlink(path);
          continue;
        }
        throw new Error('Cannot verify the existing bot process; lock preserved.');
      }
      throw new Error('Another bot process is already using DATA_DIR.');
    }
  }
  throw new Error('Could not acquire bot lock.');
}

export async function writeHealth(directory: string, ready: boolean) {
  await writeFile(join(directory, 'health.json'), JSON.stringify({ ready, at: Date.now() }));
}
