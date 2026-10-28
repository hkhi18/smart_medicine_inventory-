// Database access layer.
// Two modes, same SQL:
//  1) DATABASE_URL is set  -> real PostgreSQL server through the "pg" driver
//  2) DATABASE_URL not set -> embedded PostgreSQL (PGlite = the PostgreSQL engine compiled
//     to WebAssembly) stored in the ./pgdata folder. No installation or admin rights needed.
import path from 'node:path';

const DATA_DIR = process.env.PGLITE_DIR || path.join(process.cwd(), 'pgdata');

// Keep one connection across hot reloads in development (globalThis survives module reloads)
const g = globalThis;

async function createClient() {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    return {
      mode: 'postgresql',
      query: async (sql, params = []) => (await pool.query(sql, params)).rows,
      exec: async (sql) => { await pool.query(sql); },
      // All statements inside fn run on one connection between BEGIN and COMMIT
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({ query: async (s, p = []) => (await client.query(s, p)).rows });
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end()
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(DATA_DIR);
  return {
    mode: 'pglite',
    query: async (sql, params = []) => (await db.query(sql, params)).rows,
    exec: async (sql) => { await db.exec(sql); },
    transaction: (fn) => db.transaction((tx) => fn({ query: async (s, p = []) => (await tx.query(s, p)).rows })),
    close: () => db.close()
  };
}

// Run several statements atomically: either all succeed or none is saved
export async function transaction(fn) {
  const db = await getDb();
  return db.transaction(fn);
}

export function getDb() {
  if (!g.__smiDb) g.__smiDb = createClient();
  return g.__smiDb;
}

// Run a parameterised query and return rows. Always use $1, $2... placeholders (no string concat)
export async function query(sql, params = []) {
  const db = await getDb();
  return db.query(sql, params);
}

// Run one row
export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Time a query block (used to show "this page took X ms")
export async function timed(fn) {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

export async function dbMode() {
  return (await getDb()).mode;
}
