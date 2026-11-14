import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Pool, PoolClient } from "pg";
export type Value = SQLInputValue;
export type Store = {
  kind: "sqlite" | "postgres";
  all<T>(sql: string, ...values: Value[]): Promise<T[]>;
  get<T>(sql: string, ...values: Value[]): Promise<T | undefined>;
  run(sql: string, ...values: Value[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(run: (tx: Store) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};
export function sqliteStore(raw: DatabaseSync): Store {
  let tail: Promise<unknown> = Promise.resolve();
  // ponytail: one SQLite connection is serialized; PostgreSQL uses pooled transactions.
  function serial<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }
  const direct: Store = {
    kind: "sqlite",
    async all<T>(sql: string, ...values: Value[]) {
      return raw.prepare(sql).all(...values) as unknown as T[];
    },
    async get<T>(sql: string, ...values: Value[]) {
      return raw.prepare(sql).get(...values) as unknown as T | undefined;
    },
    async run(sql, ...values) {
      return { changes: Number(raw.prepare(sql).run(...values).changes) };
    },
    async exec(sql) {
      raw.exec(sql);
    },
    async transaction(run) {
      raw.exec("SAVEPOINT shelves_nested");
      try {
        const result = await run(direct);
        raw.exec("RELEASE SAVEPOINT shelves_nested");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK TO SAVEPOINT shelves_nested");
        raw.exec("RELEASE SAVEPOINT shelves_nested");
        throw error;
      }
    },
    async close() {
      raw.close();
    },
  };
  const store: Store = {
    ...direct,
    all: <T>(sql: string, ...values: Value[]) =>
      serial(() => direct.all<T>(sql, ...values)),
    get: <T>(sql: string, ...values: Value[]) =>
      serial(() => direct.get<T>(sql, ...values)),
    run: (sql, ...values) => serial(() => direct.run(sql, ...values)),
    exec: (sql) => serial(() => direct.exec(sql)),
    transaction: (run) =>
      serial(async () => {
        raw.exec("BEGIN");
        try {
          const result = await run(direct);
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      }),
    close: () => serial(() => direct.close()),
  };
  return store;
}
// All application SQL is maintained here with positional ? parameters; values stay bound.
export function pgSQL(sql: string) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}
function rows<T>(records: Record<string, unknown>[]): T[] {
  return records.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  ) as T[];
}
export function postgresStore(pool: Pool, client?: PoolClient): Store {
  const query = client || pool;
  const store: Store = {
    kind: "postgres",
    async all<T>(sql: string, ...values: Value[]) {
      return rows<T>((await query.query(pgSQL(sql), values)).rows);
    },
    async get<T>(sql: string, ...values: Value[]) {
      return (await store.all<T>(sql, ...values))[0];
    },
    async run(sql, ...values) {
      return { changes: (await query.query(pgSQL(sql), values)).rowCount || 0 };
    },
    async exec(sql) {
      await query.query(sql);
    },
    async transaction(run) {
      if (client)
        throw new Error("Nested PostgreSQL transactions are not supported.");
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await run(postgresStore(pool, connection));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      if (!client) await pool.end();
    },
  };
  return store;
}
