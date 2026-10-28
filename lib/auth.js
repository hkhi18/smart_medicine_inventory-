// Server-only helpers: demo users table, password check, current user, audit logging.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { query, one } from './db';
import { COOKIE_NAME, verifySession } from './session';
import { ORGS } from './orgs';

// Demo accounts only (NOT real hospital accounts). Password: DEMO_PASSWORD env var or the default below.
const DEMO_USERS = [
  ['kf1001', 'KFSHRC Pharmacist (demo)', 'kfshrc', 'pharmacist'],
  ['kf1002', 'KFSHRC Supply Analyst (demo)', 'kfshrc', 'pharmacist'],
  ['hb2001', 'Al Habib Pharmacist (demo)', 'habib', 'pharmacist'],
  ['hb2002', 'Al Habib Supply Analyst (demo)', 'habib', 'pharmacist']
];

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const good = Buffer.from(hash, 'hex');
  return good.length === test.length && crypto.timingSafeEqual(good, test);
}

const g = globalThis;

// Creates the users table on first use and adds the demo accounts when the table is empty
export function ensureUsers() {
  if (!g.__smiUsersReady) {
    g.__smiUsersReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS users (
          username      TEXT PRIMARY KEY,
          full_name     TEXT NOT NULL,
          org           TEXT NOT NULL CHECK (org IN ('kfshrc', 'habib')),
          role          TEXT NOT NULL DEFAULT 'pharmacist',
          password_hash TEXT NOT NULL,
          created_at    TIMESTAMP NOT NULL DEFAULT now()
        )`);
      const [{ n }] = await query('SELECT COUNT(*)::int AS n FROM users');
      if (n === 0) {
        const pw = process.env.DEMO_PASSWORD || 'Demo@2026';
        for (const [username, fullName, org, role] of DEMO_USERS) {
          await query(
            'INSERT INTO users (username, full_name, org, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
            [username, fullName, org, role, hashPassword(pw)]
          );
        }
      }
    })().catch((err) => { g.__smiUsersReady = null; throw err; });
  }
  return g.__smiUsersReady;
}

export async function findUser(username) {
  await ensureUsers();
  return one('SELECT username, full_name, org, role, password_hash FROM users WHERE username = $1', [username]);
}

// Creates a new account. Returns the new user, or null when the user name is already taken.
export async function createUser({ username, fullName, org, password }) {
  await ensureUsers();
  const rows = await query(
    `INSERT INTO users (username, full_name, org, role, password_hash)
     VALUES ($1, $2, $3, 'pharmacist', $4)
     ON CONFLICT (username) DO NOTHING
     RETURNING username, full_name, org, role`,
    [username, fullName, org, hashPassword(password)]
  );
  return rows[0] || null;
}

// The signed-in user, or null
export async function currentUser() {
  const store = await cookies();
  const session = await verifySession(store.get(COOKIE_NAME)?.value);
  if (!session) return null;
  await ensureUsers();
  return one('SELECT username, full_name, org, role FROM users WHERE username = $1', [session.u]);
}

// Name shown in the Audit log, e.g. "KFSHRC Pharmacist (demo) (KFSHRC)"
export function actorLabel(user) {
  return `${user.full_name} (${ORGS[user.org]?.short || user.org})`;
}

export async function logAudit(actor, action, entity, details = '') {
  await query('INSERT INTO audit_log (actor, action, entity, details) VALUES ($1, $2, $3, $4)', [actor, action, entity, details]);
}
