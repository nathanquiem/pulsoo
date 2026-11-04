import { Pool, type PoolClient } from "pg";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { EntityKind, EntityMap } from "../shared/model.js";
export interface Tx {
  get<K extends EntityKind>(
    kind: K,
    id: string,
  ): Promise<EntityMap[K] | undefined>;
  list<K extends EntityKind>(kind: K): Promise<EntityMap[K][]>;
  put<K extends EntityKind>(kind: K, value: EntityMap[K]): Promise<void>;
  remove(kind: EntityKind, id: string): Promise<void>;
}
export interface Store {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  driver: string;
}
type Records = Record<string, unknown>;
export class LocalStore implements Store {
  driver = "file";
  private data: Records = {};
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private directory?: string) {}
  async init() {
    if (this.directory) {
      await mkdir(this.directory, { recursive: true });
      try {
        this.data = JSON.parse(
          await readFile(join(this.directory, "state.json"), "utf8"),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return this;
  }
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const work = this.tail.then(async () => {
      const next = structuredClone(this.data);
      const tx: Tx = {
        get: async (kind, id) => next[kind + ":" + id] as never,
        list: async (kind) =>
          Object.entries(next)
            .filter(([k]) => k.startsWith(kind + ":"))
            .map(([, v]) => v) as never,
        put: async (kind, value) => {
          next[kind + ":" + value.id] = structuredClone(value);
        },
        remove: async (kind, id) => {
          delete next[kind + ":" + id];
        },
      };
      const value = await fn(tx);
      if (this.directory) {
        const file = join(this.directory, "state.json");
        await writeFile(file + ".tmp", JSON.stringify(next));
        await rename(file + ".tmp", file);
      }
      this.data = next;
      return structuredClone(value);
    });
    this.tail = work.catch(() => {});
    return work;
  }
  async close() {
    await this.tail;
  }
}
export const migration = `CREATE TABLE IF NOT EXISTS pulsoo_records(kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,id));
CREATE INDEX IF NOT EXISTS pulsoo_records_kind_idx ON pulsoo_records(kind);
CREATE TABLE IF NOT EXISTS pulsoo_schema(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO pulsoo_schema(version) VALUES(1) ON CONFLICT DO NOTHING;`;
export class PostgresStore implements Store {
  driver = "postgres";
  pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 6,
      connectionTimeoutMillis: 5000,
    });
  }
  async init() {
    await this.pool.query(migration);
    return this;
  }
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('pulsoo-single-instance'))",
      );
      const tx = this.tx(c);
      const value = await fn(tx);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private tx(c: PoolClient): Tx {
    return {
      get: async (kind, id) =>
        (
          await c.query(
            "SELECT data FROM pulsoo_records WHERE kind=$1 AND id=$2",
            [kind, id],
          )
        ).rows[0]?.data,
      list: async (kind) =>
        (
          await c.query(
            "SELECT data FROM pulsoo_records WHERE kind=$1 ORDER BY updated_at DESC",
            [kind],
          )
        ).rows.map((r) => r.data),
      put: async (kind, value) => {
        await c.query(
          "INSERT INTO pulsoo_records(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=$3,updated_at=now()",
          [kind, value.id, JSON.stringify(value)],
        );
      },
      remove: async (kind, id) => {
        await c.query("DELETE FROM pulsoo_records WHERE kind=$1 AND id=$2", [
          kind,
          id,
        ]);
      },
    };
  }
  async close() {
    await this.pool.end();
  }
}
