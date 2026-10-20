// The core rules: who (and which AI) may read what, and how knowledge flows back.
// Used by both the MCP connector and the web app, so both enforce the same rules.
import {
  all,
  get,
  run,
  newId,
  nowIso,
  type Company,
  type Entry,
  type Layer,
  type Membership,
  type Person,
  type Role,
  type Room,
} from "./db";
import type { EntryView, MemberStatus } from "../shared/types";

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

export const allowedAis = (room: Room): string[] => JSON.parse(room.allowed_ais);

// MCP clients report a name on connect ("claude-code", "cursor-vscode", ...).
// Cursor comes before Copilot because Cursor's client name contains "vscode".
const AI_PATTERNS: [RegExp, string][] = [
  [/claude/i, "Claude"],
  [/chatgpt|openai/i, "ChatGPT"],
  [/gemini/i, "Gemini"],
  [/cursor/i, "Cursor"],
  [/copilot|vscode|visual studio code/i, "Copilot"],
];

export function detectAi(clientName?: string | null): string | null {
  if (!clientName) return null;
  return AI_PATTERNS.find(([re]) => re.test(clientName))?.[1] ?? null;
}

export function membershipStatus(m: Membership, room: Room, now = new Date()): MemberStatus {
  if (m.revoked_at) return "revoked";
  const day = today(now);
  return m.access_until < day || room.expires_at < day ? "expired" : "active";
}

/** A person's access to one room: their role and the layers it unlocks. */
export type Grant = {
  person: Person;
  membership: Membership;
  room: Room;
  owner: Company;
  role: Role;
  layers: Layer[];
};

function toGrant(person: Person, membership: Membership): Grant {
  const room = get<Room>("SELECT * FROM rooms WHERE id = ?", membership.room_id)!;
  const owner = get<Company>("SELECT * FROM companies WHERE id = ?", room.company_id)!;
  const role = get<Role>("SELECT * FROM roles WHERE id = ?", membership.role_id)!;
  const ids: string[] = JSON.parse(role.layer_ids);
  const layers = all<Layer>("SELECT * FROM layers WHERE room_id = ? ORDER BY position", room.id).filter((l) =>
    ids.includes(l.id),
  );
  return { person, membership, room, owner, role, layers };
}

/** All memberships of a person, including revoked and expired ones. */
export function allGrants(person: Person): Grant[] {
  return all<Membership>("SELECT * FROM memberships WHERE person_id = ? ORDER BY created_at", person.id).map((m) =>
    toGrant(person, m),
  );
}

/** Rooms the person can use right now. */
export function activeGrants(person: Person, now = new Date()): Grant[] {
  return allGrants(person).filter((g) => membershipStatus(g.membership, g.room, now) === "active");
}

/** Find an active grant by room id or room name. */
export function findGrant(person: Person, roomRef: string, now = new Date()): Grant | undefined {
  const ref = roomRef.trim().toLowerCase();
  return activeGrants(person, now).find((g) => g.room.id === roomRef || g.room.name.toLowerCase() === ref);
}

/** Error message if this AI may not access the room, otherwise null. */
export function aiDenied(grant: Grant, ai: string): string | null {
  const allowed = allowedAis(grant.room);
  if (allowed.includes(ai)) return null;
  return `${ai} is not allowed in room "${grant.room.name}". Allowed AIs: ${allowed.join(", ")}.`;
}

type EntryRow = Entry & { layer_name: string; author_name: string; author_company: string };

const toView = (e: EntryRow): EntryView => ({
  id: e.id,
  title: e.title,
  body: e.body,
  layer: e.layer_name,
  source: `${e.author_name} (${e.author_company})`,
  date: e.created_at.slice(0, 10),
});

/** Approved knowledge the grant may see, optionally limited to one layer. */
export function visibleEntries(grant: Grant, layerName?: string): EntryView[] {
  const layers = layerName
    ? grant.layers.filter((l) => l.name.toLowerCase() === layerName.trim().toLowerCase())
    : grant.layers;
  if (layers.length === 0) return [];
  const rows = all<EntryRow>(
    `SELECT e.*, l.name AS layer_name, p.name AS author_name, c.name AS author_company
       FROM entries e
       JOIN layers l ON l.id = e.layer_id
       JOIN people p ON p.id = e.author_id
       JOIN companies c ON c.id = p.company_id
      WHERE e.status = 'approved' AND e.layer_id IN (${layers.map(() => "?").join(",")})
      ORDER BY l.position, e.created_at`,
    ...layers.map((l) => l.id),
  );
  return rows.map(toView);
}

const STOPWORDS = new Set(
  "the and for how many much what which who when where why need with are our you your this that have has does from into about".split(
    " ",
  ),
);

/**
 * Keyword search over visible entries. Good enough for small rooms;
 * the plan is to replace this with an existing vector database.
 */
export function search(grant: Grant, query: string, limit = 8): EntryView[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => (w.length > 2 || /\d/.test(w)) && !STOPWORDS.has(w));
  if (words.length === 0) return visibleEntries(grant).slice(0, limit);
  return visibleEntries(grant)
    .map((e) => {
      const title = e.title.toLowerCase();
      const body = e.body.toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      return { e, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.e);
}

/** The visible layer the fewest roles can see: the safe default for new knowledge. */
export function mostRestrictedLayer(grant: Grant): Layer {
  const roles = all<Role>("SELECT * FROM roles WHERE room_id = ?", grant.room.id).map(
    (r) => JSON.parse(r.layer_ids) as string[],
  );
  const audience = (l: Layer) => roles.filter((ids) => ids.includes(l.id)).length;
  return grant.layers.reduce((best, l) => (audience(l) <= audience(best) ? l : best));
}

export const isOwnerSide = (grant: Grant) => grant.person.company_id === grant.room.company_id;

export type Contribution = { entry: Entry; layer: Layer } | { error: string };

/**
 * Save knowledge to a room. Members of the owner company save directly;
 * partners create a suggestion the owner has to approve.
 */
export function contribute(
  grant: Grant,
  input: { title: string; body: string; layer?: string },
  ai: string | null,
): Contribution {
  const layer = input.layer
    ? grant.layers.find((l) => l.name.toLowerCase() === input.layer!.trim().toLowerCase())
    : mostRestrictedLayer(grant);
  if (!layer) {
    return { error: `You can only save to these layers: ${grant.layers.map((l) => l.name).join(", ")}.` };
  }
  const entry: Entry = {
    id: newId(),
    room_id: grant.room.id,
    layer_id: layer.id,
    title: input.title.trim(),
    body: input.body.trim(),
    author_id: grant.person.id,
    status: isOwnerSide(grant) ? "approved" : "pending",
    created_at: nowIso(),
    decided_at: null,
    decided_by: null,
  };
  run(
    `INSERT INTO entries (id, room_id, layer_id, title, body, author_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.room_id,
    entry.layer_id,
    entry.title,
    entry.body,
    entry.author_id,
    entry.status,
    entry.created_at,
  );
  const verb = entry.status === "approved" ? "saved" : "suggested";
  logAccess(grant.room.id, grant.person.id, ai, verb, `${verb} "${entry.title}" for ${layer.name}`);
  return { entry, layer };
}

export function logAccess(roomId: string, personId: string, ai: string | null, action: string, detail: string) {
  run(
    "INSERT INTO audit_log (room_id, person_id, ai, action, detail, at) VALUES (?, ?, ?, ?, ?, ?)",
    roomId,
    personId,
    ai,
    action,
    detail,
    nowIso(),
  );
}

export const describeLayers = (layers: { name: string }[]) => layers.map((l) => l.name).join(", ");
