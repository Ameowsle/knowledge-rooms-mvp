import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

// Context store. SQLite for the MVP; swap for Postgres (+ a vector index) later.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  title      TEXT,
  company_id TEXT NOT NULL REFERENCES companies(id),
  is_admin   INTEGER NOT NULL DEFAULT 0,
  token      TEXT NOT NULL UNIQUE -- secret in the person's MCP connection URL
);

-- A room is one project between the owner company and its partners.
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  expires_at  TEXT NOT NULL, -- YYYY-MM-DD, last day of access
  allowed_ais TEXT NOT NULL, -- JSON array, e.g. ["Claude","Gemini"]
  created_at  TEXT NOT NULL
);

-- Layers split a room's knowledge by audience ("Catering", "Project leads only").
CREATE TABLE IF NOT EXISTS layers (
  id       TEXT PRIMARY KEY,
  room_id  TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL
);

-- A role decides which layers a member (and their AI) can see.
CREATE TABLE IF NOT EXISTS roles (
  id        TEXT PRIMARY KEY,
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  layer_ids TEXT NOT NULL -- JSON array of layer ids
);

CREATE TABLE IF NOT EXISTS memberships (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  person_id    TEXT NOT NULL REFERENCES people(id),
  role_id      TEXT NOT NULL REFERENCES roles(id),
  ai           TEXT NOT NULL, -- the AI this person said they use
  access_until TEXT NOT NULL, -- YYYY-MM-DD
  revoked_at   TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (room_id, person_id)
);

-- Knowledge. Partner contributions start as 'pending' until the owner approves.
CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  layer_id   TEXT NOT NULL REFERENCES layers(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author_id  TEXT NOT NULL REFERENCES people(id),
  status     TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  ai        TEXT, -- NULL for actions in the web app
  action    TEXT NOT NULL,
  detail    TEXT NOT NULL,
  at        TEXT NOT NULL
);
`;

export type Company = { id: string; name: string };
export type Person = {
  id: string;
  name: string;
  title: string | null;
  company_id: string;
  is_admin: number;
  token: string;
};
export type Room = {
  id: string;
  company_id: string;
  name: string;
  expires_at: string;
  allowed_ais: string;
  created_at: string;
};
export type Layer = { id: string; room_id: string; name: string; position: number };
export type Role = { id: string; room_id: string; name: string; layer_ids: string };
export type Membership = {
  id: string;
  room_id: string;
  person_id: string;
  role_id: string;
  ai: string;
  access_until: string;
  revoked_at: string | null;
  created_at: string;
};
export type Entry = {
  id: string;
  room_id: string;
  layer_id: string;
  title: string;
  body: string;
  author_id: string;
  status: "approved" | "pending" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

const file = process.env.DB_FILE ?? path.join(process.cwd(), "data", "rooms.db");
if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(SCHEMA);

export const all = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).all(...params) as unknown as T[];

export const get = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).get(...params) as unknown as T | undefined;

export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const newId = () => randomUUID();
export const newToken = () => randomBytes(24).toString("base64url");
export const nowIso = () => new Date().toISOString();
