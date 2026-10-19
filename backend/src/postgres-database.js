import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const workerUrl = new URL("./postgres-sync-worker.js", import.meta.url);

function makeSharedBuffer() {
  return new SharedArrayBuffer(MAX_RESPONSE_BYTES + 8);
}

function waitFor(shared, timeoutMs = 30_000) {
  const header = new Int32Array(shared, 0, 2);
  const result = Atomics.wait(header, 0, 0, timeoutMs);
  if (result === "timed-out") throw new Error("Timed out waiting for the Supabase database.");
  const size = Atomics.load(header, 1);
  const payload = new TextDecoder().decode(new Uint8Array(shared, 8, size));
  return JSON.parse(payload);
}

function normalizeSql(sql) {
  let query = String(sql).trim();
  if (!query) return "";
  if (/^PRAGMA\b/i.test(query)) return "";
  query = query.replace(/^BEGIN\s+IMMEDIATE\b/i, "BEGIN");
  query = query.replace(/\bCURRENT_TIMESTAMP\b/gi, "CURRENT_TIMESTAMP::text");
  query = query.replace(/datetime\('now',\s*'(-\d+) minutes?'\)/gi, "(CURRENT_TIMESTAMP + INTERVAL '$1 minutes')::text");
  query = query.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP::text");
  query = query.replace(/datetime\(starts_at,\s*'\+'\s*\|\|\s*duration_minutes\s*\|\|\s*' minutes'\)/gi,
    "(CAST(starts_at AS timestamptz) + duration_minutes * INTERVAL '1 minute')");
  query = query.replace(/\b([\w.]+)\s+COLLATE\s+NOCASE\b/gi, "lower($1)");
  const ignoreInsert = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(query);
  query = query.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  query = query.replace(/\?/g, (() => {
    let index = 0;
    return () => `$${++index}`;
  })());
  if (ignoreInsert && !/\bON\s+CONFLICT\b/i.test(query)) {
    const returningAt = query.search(/\s+RETURNING\b/i);
    query = returningAt < 0
      ? `${query.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`
      : `${query.slice(0, returningAt)} ON CONFLICT DO NOTHING${query.slice(returningAt)}`;
  }
  return query;
}

function toPostgresError(info) {
  const error = new Error(info.error || "Supabase database request failed.");
  if (info.code) error.code = info.code;
  return error;
}

export class PostgresSyncDatabase {
  constructor(connectionString) {
    const readyBuffer = makeSharedBuffer();
    this.worker = new Worker(fileURLToPath(workerUrl), {
      workerData: { connectionString, readyBuffer },
    });
    this.worker.on("error", (error) => { this.workerError = error; });
    const ready = waitFor(readyBuffer, 60_000);
    if (ready.error) {
      this.worker.terminate();
      throw toPostgresError(ready);
    }
  }

  query(sql, params = []) {
    if (this.workerError) throw this.workerError;
    const query = normalizeSql(sql);
    if (!query) return { rows: [], rowCount: 0 };
    const shared = makeSharedBuffer();
    this.worker.postMessage({ sql: query, params, shared });
    const result = waitFor(shared);
    if (result.error) throw toPostgresError(result);
    return result;
  }

  prepare(sql) {
    return {
      get: (...params) => this.query(sql, params).rows[0],
      all: (...params) => this.query(sql, params).rows,
      run: (...params) => {
        let statement = sql.trim().replace(/;\s*$/, "");
        if (/^(INSERT|UPDATE|DELETE)\b/i.test(statement) && !/\bRETURNING\b/i.test(statement)) {
          statement += " RETURNING 1 AS __skillswap_changed";
        }
        const result = this.query(statement, params);
        return { changes: result.rows.length };
      },
    };
  }

  exec(sql) {
    const statements = String(sql).split(";").map((part) => part.trim()).filter(Boolean);
    for (const statement of statements) this.query(statement);
  }

  close() {
    const shared = makeSharedBuffer();
    this.worker.postMessage({ close: true, shared });
    try { waitFor(shared, 2_000); } catch { /* force termination below */ }
    this.worker.terminate();
  }
}
