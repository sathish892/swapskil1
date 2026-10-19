import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";

const { Pool, types } = pg;
types.setTypeParser(20, (value) => Number(value));

function reply(shared, value) {
  const header = new Int32Array(shared, 0, 2);
  const bytes = new Uint8Array(shared, 8);
  const payload = new TextEncoder().encode(JSON.stringify(value));
  if (payload.length > bytes.length) {
    const fallback = new TextEncoder().encode(JSON.stringify({ error: "Database response was too large." }));
    bytes.set(fallback.subarray(0, bytes.length));
    Atomics.store(header, 1, fallback.length);
  } else {
    bytes.set(payload);
    Atomics.store(header, 1, payload.length);
  }
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0);
}

let pool;
let client;
try {
  pool = new Pool({
    connectionString: workerData.connectionString,
    max: 1,
    application_name: "skillswap-backend",
  });
  client = await pool.connect();
  reply(workerData.readyBuffer, { ok: true });
} catch (error) {
  reply(workerData.readyBuffer, { error: error.message, code: error.code });
}

parentPort.on("message", async ({ sql, params, shared, close }) => {
  if (close) {
    client.release();
    await pool.end();
    reply(shared, { ok: true });
    return;
  }
  try {
    const result = await client.query(sql, params);
    reply(shared, { rows: result.rows, rowCount: result.rowCount });
  } catch (error) {
    // Do not return connection details or query parameters to the main thread logs.
    reply(shared, { error: error.message, code: error.code });
  }
});
