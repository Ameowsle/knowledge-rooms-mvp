// Admin operations for the owner company and the read models behind the web app.
import {
  all,
  get,
  run,
  newId,
  newToken,
  nowIso,
  transaction,
  type Company,
  type Entry,
  type Layer,
  type Membership,
  type Person,
  type Role,
  type Room,
} from "./db";
import { allGrants, allowedAis, logAccess, membershipStatus } from "./access";
import type { AuditInfo, EntryInfo, MemberInfo, MyContribution, Portal, RoomDetail, RoomSummary } from "../shared/types";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const EVERYONE = "Everyone in the room";
export const LEADS = "Project leads only";

export function createRoom(admin: Person, input: { name: string; expiresAt: string; allowedAis: string[] }): Room {
  return transaction(() => {
    const room: Room = {
      id: newId(),
      company_id: admin.company_id,
      name: input.name.trim(),
      expires_at: input.expiresAt,
      allowed_ais: JSON.stringify(input.allowedAis),
      created_at: nowIso(),
      ended_at: null,
    };
    run(
      "INSERT INTO rooms (id, company_id, name, expires_at, allowed_ais, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      room.id,
      room.company_id,
      room.name,
      room.expires_at,
      room.allowed_ais,
      room.created_at,
    );
    const everyone = insertLayer(room.id, EVERYONE, 0);
    const leads = insertLayer(room.id, LEADS, 1);
    const leadRole = insertRole(room.id, "Project lead", [everyone.id, leads.id]);
    insertRole(room.id, "Everyone", [everyone.id]);
    // The creator joins as project lead so their own AI can use the room too.
    const ai = get<Membership>("SELECT * FROM memberships WHERE person_id = ? ORDER BY created_at DESC", admin.id)?.ai;
    insertMembership(room.id, admin.id, leadRole.id, ai ?? input.allowedAis[0] ?? "Claude", room.expires_at);
    return room;
  });
}

function insertLayer(roomId: string, name: string, position: number): Layer {
  const layer = { id: newId(), room_id: roomId, name, position };
  run("INSERT INTO layers (id, room_id, name, position) VALUES (?, ?, ?, ?)", layer.id, roomId, name, position);
  return layer;
}

function insertRole(roomId: string, name: string, layerIds: string[]): Role {
  const role = { id: newId(), room_id: roomId, name, layer_ids: JSON.stringify(layerIds) };
  run("INSERT INTO roles (id, room_id, name, layer_ids) VALUES (?, ?, ?, ?)", role.id, roomId, name, role.layer_ids);
  return role;
}

function insertMembership(roomId: string, personId: string, roleId: string, ai: string, accessUntil: string) {
  run(
    `INSERT INTO memberships (id, room_id, person_id, role_id, ai, access_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    roomId,
    personId,
    roleId,
    ai,
    accessUntil,
    nowIso(),
  );
}

/**
 * Adds a layer plus a role of the same name that sees "Everyone" and the new layer.
 * Roles that already see every layer (project leads) also get the new one.
 */
export function addLayer(room: Room, name: string): Layer {
  return transaction(() => {
    const layers = all<Layer>("SELECT * FROM layers WHERE room_id = ? ORDER BY position", room.id);
    if (layers.some((l) => l.name.toLowerCase() === name.trim().toLowerCase())) {
      throw new AppError(409, `Layer "${name}" already exists`);
    }
    const layer = insertLayer(room.id, name.trim(), Math.max(-1, ...layers.map((l) => l.position)) + 1);
    for (const role of all<Role>("SELECT * FROM roles WHERE room_id = ?", room.id)) {
      const ids: string[] = JSON.parse(role.layer_ids);
      if (layers.every((l) => ids.includes(l.id))) {
        run("UPDATE roles SET layer_ids = ? WHERE id = ?", JSON.stringify([...ids, layer.id]), role.id);
      }
    }
    insertRole(room.id, layer.name, [layers[0].id, layer.id]);
    return layer;
  });
}

export function updateRoom(room: Room, input: { name?: string; expiresAt?: string; allowedAis?: string[] }) {
  if (input.name) run("UPDATE rooms SET name = ? WHERE id = ?", input.name.trim(), room.id);
  if (input.expiresAt) run("UPDATE rooms SET expires_at = ? WHERE id = ?", input.expiresAt, room.id);
  if (input.allowedAis) run("UPDATE rooms SET allowed_ais = ? WHERE id = ?", JSON.stringify(input.allowedAis), room.id);
}

/** Invite a person (creating them and their company if needed), or update an existing membership. */
export function invite(
  room: Room,
  admin: Person,
  input: { name: string; company: string; title?: string; roleId: string; ai: string; accessUntil: string },
) {
  const role = get<Role>("SELECT * FROM roles WHERE id = ? AND room_id = ?", input.roleId, room.id);
  if (!role) throw new AppError(400, "Unknown role");
  if (!allowedAis(room).includes(input.ai)) throw new AppError(400, `${input.ai} is not allowed in this room`);

  return transaction(() => {
    let company = get<Company>("SELECT * FROM companies WHERE lower(name) = lower(?)", input.company.trim());
    if (!company) {
      company = { id: newId(), name: input.company.trim() };
      run("INSERT INTO companies (id, name) VALUES (?, ?)", company.id, company.name);
    }
    let person = get<Person>("SELECT * FROM people WHERE lower(name) = lower(?) AND company_id = ?", input.name.trim(), company.id);
    if (!person) {
      person = {
        id: newId(),
        name: input.name.trim(),
        title: input.title?.trim() || null,
        company_id: company.id,
        is_admin: 0,
        token: newToken(),
      };
      run(
        "INSERT INTO people (id, name, title, company_id, is_admin, token) VALUES (?, ?, ?, ?, ?, ?)",
        person.id,
        person.name,
        person.title,
        person.company_id,
        person.is_admin,
        person.token,
      );
    }
    const existing = get<Membership>("SELECT * FROM memberships WHERE room_id = ? AND person_id = ?", room.id, person.id);
    if (existing) {
      run(
        "UPDATE memberships SET role_id = ?, ai = ?, access_until = ?, revoked_at = NULL WHERE id = ?",
        role.id,
        input.ai,
        input.accessUntil,
        existing.id,
      );
    } else {
      insertMembership(room.id, person.id, role.id, input.ai, input.accessUntil);
    }
    logAccess(room.id, admin.id, null, "invite", `invited ${person.name} (${company.name}) as ${role.name}`);
    return person;
  });
}

export function revokeMembership(room: Room, admin: Person, membershipId: string) {
  const m = get<Membership & { name: string }>(
    "SELECT m.*, p.name FROM memberships m JOIN people p ON p.id = m.person_id WHERE m.id = ? AND m.room_id = ?",
    membershipId,
    room.id,
  );
  if (!m) throw new AppError(404, "Member not found");
  run("UPDATE memberships SET revoked_at = ? WHERE id = ?", nowIso(), m.id);
  logAccess(room.id, admin.id, null, "revoke", `revoked access for ${m.name}`);
}

/** End of project: revoke every external partner, keep the owner company's people. */
export function endProject(room: Room, admin: Person): number {
  const { changes } = run(
    `UPDATE memberships SET revoked_at = ?
      WHERE room_id = ? AND revoked_at IS NULL
        AND person_id IN (SELECT id FROM people WHERE company_id != ?)`,
    nowIso(),
    room.id,
    room.company_id,
  );
  run("UPDATE rooms SET ended_at = ? WHERE id = ?", nowIso(), room.id);
  logAccess(room.id, admin.id, null, "revoke", `ended the project and revoked ${changes} partner(s)`);
  return Number(changes);
}

/** Reopen an ended project. Partners stay revoked until they are invited again. */
export function reopenProject(room: Room, admin: Person) {
  run("UPDATE rooms SET ended_at = NULL WHERE id = ?", room.id);
  logAccess(room.id, admin.id, null, "reopen", "reopened the project");
}

/** Permanently delete an ended room with its knowledge, members and audit log. */
export function deleteRoom(room: Room) {
  const current = get<Room>("SELECT * FROM rooms WHERE id = ?", room.id);
  if (!current?.ended_at) throw new AppError(409, "End the project before deleting the room");
  transaction(() => {
    for (const table of ["audit_log", "entries", "memberships", "roles", "layers"]) {
      run(`DELETE FROM ${table} WHERE room_id = ?`, room.id);
    }
    run("DELETE FROM rooms WHERE id = ?", room.id);
  });
}

/** Ended rooms are read only: no new layers, entries or invitations. */
export function assertOpen(room: Room) {
  if (room.ended_at) throw new AppError(409, "This project has ended. Reopen it to make changes.");
}

export function addEntry(room: Room, admin: Person, input: { layerId: string; title: string; body: string }) {
  const layer = get<Layer>("SELECT * FROM layers WHERE id = ? AND room_id = ?", input.layerId, room.id);
  if (!layer) throw new AppError(400, "Unknown layer");
  run(
    `INSERT INTO entries (id, room_id, layer_id, title, body, author_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)`,
    newId(),
    room.id,
    layer.id,
    input.title.trim(),
    input.body.trim(),
    admin.id,
    nowIso(),
  );
  logAccess(room.id, admin.id, null, "save", `added "${input.title.trim()}" to ${layer.name}`);
}

/** Approve (optionally into another layer) or reject a partner suggestion. */
export function decide(room: Room, admin: Person, entryId: string, approve: boolean, layerId?: string) {
  const entry = get<Entry>("SELECT * FROM entries WHERE id = ? AND room_id = ?", entryId, room.id);
  if (!entry || entry.status !== "pending") throw new AppError(404, "No pending suggestion with this id");
  const layer = get<Layer>("SELECT * FROM layers WHERE id = ? AND room_id = ?", layerId ?? entry.layer_id, room.id);
  if (!layer) throw new AppError(400, "Unknown layer");
  run(
    "UPDATE entries SET status = ?, layer_id = ?, decided_at = ?, decided_by = ? WHERE id = ?",
    approve ? "approved" : "rejected",
    layer.id,
    nowIso(),
    admin.id,
    entry.id,
  );
  const verb = approve ? "approved" : "rejected";
  logAccess(room.id, admin.id, null, verb, `${verb} "${entry.title}"${approve ? ` into ${layer.name}` : ""}`);
}

// ---------------------------------------------------------------- read models

export function roomSummaries(admin: Person): RoomSummary[] {
  return all<RoomSummary>(
    `SELECT r.id, r.name, r.expires_at AS expiresAt, r.ended_at AS endedAt,
            (SELECT COUNT(*) FROM memberships m WHERE m.room_id = r.id AND m.revoked_at IS NULL) AS members,
            (SELECT COUNT(*) FROM entries e WHERE e.room_id = r.id AND e.status = 'pending') AS pending
       FROM rooms r WHERE r.company_id = ? ORDER BY r.created_at`,
    admin.company_id,
  );
}

const ENTRY_INFO_SQL = `
  SELECT e.id, e.title, e.body, e.layer_id AS layerId, l.name AS layer,
         p.name AS author, c.name AS authorCompany, e.created_at AS createdAt
    FROM entries e
    JOIN layers l ON l.id = e.layer_id
    JOIN people p ON p.id = e.author_id
    JOIN companies c ON c.id = p.company_id
   WHERE e.room_id = ? AND e.status = ?
   ORDER BY l.position, e.created_at`;

export function roomDetail(room: Room): RoomDetail {
  const owner = get<Company>("SELECT * FROM companies WHERE id = ?", room.company_id)!;
  const layers = all<Layer>("SELECT * FROM layers WHERE room_id = ? ORDER BY position", room.id);
  const roles = all<Role>("SELECT * FROM roles WHERE room_id = ? ORDER BY rowid", room.id).map((r) => ({
    id: r.id,
    name: r.name,
    layerIds: JSON.parse(r.layer_ids) as string[],
  }));
  const members = all<Membership & { name: string; title: string | null; company: string; company_id: string; role: string }>(
    `SELECT m.*, p.name, p.title, c.name AS company, c.id AS company_id, r.name AS role
       FROM memberships m
       JOIN people p ON p.id = m.person_id
       JOIN companies c ON c.id = p.company_id
       JOIN roles r ON r.id = m.role_id
      WHERE m.room_id = ?
      ORDER BY (c.id = ?) ASC, c.name, p.name`,
    room.id,
    room.company_id,
  ).map((m): MemberInfo => ({
    id: m.id,
    name: m.name,
    title: m.title,
    company: m.company,
    isPartner: m.company_id !== room.company_id,
    roleId: m.role_id,
    role: m.role,
    ai: m.ai,
    accessUntil: m.access_until,
    status: membershipStatus(m, room),
  }));
  const audit = all<AuditInfo>(
    `SELECT a.id, a.at, a.ai, p.name AS person, a.action, a.detail
       FROM audit_log a JOIN people p ON p.id = a.person_id
      WHERE a.room_id = ? ORDER BY a.at DESC, a.id DESC LIMIT 50`,
    room.id,
  );
  return {
    room: {
      id: room.id,
      name: room.name,
      expiresAt: room.expires_at,
      endedAt: room.ended_at,
      allowedAis: allowedAis(room),
      owner: owner.name,
    },
    layers: layers.map((l) => ({
      id: l.id,
      name: l.name,
      seenBy: roles.filter((r) => r.layerIds.includes(l.id)).map((r) => r.name),
    })),
    roles,
    members,
    entries: all<EntryInfo>(ENTRY_INFO_SQL, room.id, "approved"),
    suggestions: all<EntryInfo>(ENTRY_INFO_SQL, room.id, "pending"),
    audit,
  };
}

export function myContributions(person: Person) {
  return all<MyContribution & { owner: string; body: string }>(
    `SELECT e.id, e.title, e.body, r.name AS room, c.name AS owner, l.name AS layer,
            e.status, e.created_at AS createdAt
       FROM entries e
       JOIN rooms r ON r.id = e.room_id
       JOIN companies c ON c.id = r.company_id
       JOIN layers l ON l.id = e.layer_id
      WHERE e.author_id = ?
      ORDER BY e.created_at DESC`,
    person.id,
  );
}

export function portal(person: Person, publicUrl: string): Portal {
  const lastAi = get<{ ai: string }>(
    "SELECT ai FROM audit_log WHERE person_id = ? AND ai IS NOT NULL AND ai != 'Web portal' ORDER BY at DESC LIMIT 1",
    person.id,
  );
  return {
    mcpUrl: `${publicUrl}/mcp/${person.token}`,
    connectedAi: lastAi?.ai ?? null,
    rooms: allGrants(person).map((g) => ({
      roomId: g.room.id,
      room: g.room.name,
      owner: g.owner.name,
      role: g.role.name,
      layers: g.layers.map((l) => l.name),
      ai: g.membership.ai,
      accessUntil: g.membership.access_until < g.room.expires_at ? g.membership.access_until : g.room.expires_at,
      status: membershipStatus(g.membership, g.room),
    })),
    contributions: myContributions(person).map(({ owner: _owner, body: _body, ...c }) => c),
  };
}

// ---------------------------------------------------------------- changes after the invitation

type MemberRow = Membership & { name: string; token: string };

function memberRow(room: Room, membershipId: string): MemberRow {
  const m = get<MemberRow>(
    `SELECT m.*, p.name, p.token FROM memberships m JOIN people p ON p.id = m.person_id
      WHERE m.id = ? AND m.room_id = ?`,
    membershipId,
    room.id,
  );
  if (!m) throw new AppError(404, "Member not found");
  return m;
}

/** The personal link an admin passes on to a partner, by email or chat. */
export function inviteLink(room: Room, membershipId: string, publicUrl: string) {
  const m = memberRow(room, membershipId);
  return { name: m.name, mcpUrl: `${publicUrl}/mcp/${m.token}` };
}

/** Change a member's role, AI or end date without inviting them again. */
export function updateMembership(
  room: Room,
  admin: Person,
  membershipId: string,
  input: { roleId?: string; ai?: string; accessUntil?: string },
) {
  const m = memberRow(room, membershipId);
  if (m.revoked_at) throw new AppError(409, "Access was revoked. Invite the person again.");
  const role = get<Role>("SELECT * FROM roles WHERE id = ? AND room_id = ?", input.roleId ?? m.role_id, room.id);
  if (!role) throw new AppError(400, "Unknown role");
  const ai = input.ai ?? m.ai;
  if (!allowedAis(room).includes(ai)) throw new AppError(400, `${ai} is not allowed in this room`);
  const accessUntil = input.accessUntil ?? m.access_until;
  if (accessUntil > room.expires_at) throw new AppError(400, `Access cannot outlast the room, which ends on ${room.expires_at}`);
  run("UPDATE memberships SET role_id = ?, ai = ?, access_until = ? WHERE id = ?", role.id, ai, accessUntil, m.id);
  logAccess(room.id, admin.id, null, "update", `changed access for ${m.name}: ${role.name}, ${ai}, until ${accessUntil}`);
}

function approvedEntry(room: Room, entryId: string): Entry {
  const entry = get<Entry>("SELECT * FROM entries WHERE id = ? AND room_id = ? AND status = 'approved'", entryId, room.id);
  if (!entry) throw new AppError(404, "Entry not found");
  return entry;
}

/** Correct a knowledge entry or move it to another layer. */
export function updateEntry(room: Room, admin: Person, entryId: string, input: { title?: string; body?: string; layerId?: string }) {
  const entry = approvedEntry(room, entryId);
  const layer = get<Layer>("SELECT * FROM layers WHERE id = ? AND room_id = ?", input.layerId ?? entry.layer_id, room.id);
  if (!layer) throw new AppError(400, "Unknown layer");
  const title = input.title?.trim() || entry.title;
  run("UPDATE entries SET title = ?, body = ?, layer_id = ? WHERE id = ?", title, input.body?.trim() || entry.body, layer.id, entry.id);
  logAccess(room.id, admin.id, null, "save", `edited "${title}" in ${layer.name}`);
}

/** Remove a knowledge entry. Partner AIs stop receiving it at once. */
export function deleteEntry(room: Room, admin: Person, entryId: string) {
  const entry = approvedEntry(room, entryId);
  run("DELETE FROM entries WHERE id = ?", entry.id);
  logAccess(room.id, admin.id, null, "remove", `removed "${entry.title}"`);
}

/** The audit log of the admin's company as CSV, for one room or all of them. */
export function auditCsv(admin: Person, roomId?: string): string {
  const rows = all<{ at: string; room: string; person: string; company: string; ai: string | null; action: string; detail: string }>(
    `SELECT a.at, r.name AS room, p.name AS person, c.name AS company, a.ai, a.action, a.detail
       FROM audit_log a
       JOIN rooms r ON r.id = a.room_id
       JOIN people p ON p.id = a.person_id
       JOIN companies c ON c.id = p.company_id
      WHERE r.company_id = ? AND (? IS NULL OR r.id = ?)
      ORDER BY a.at DESC, a.id DESC`,
    admin.company_id,
    roomId ?? null,
    roomId ?? null,
  );
  // Quote every cell; a leading apostrophe stops spreadsheets from running a cell as a formula.
  const cell = (v: string | null) => `"${(v ?? "").replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.at, r.room, r.person, r.company, r.ai, r.action, r.detail].map(cell).join(","));
  return ["time,room,person,company,ai,action,detail", ...lines].join("\r\n") + "\r\n";
}
