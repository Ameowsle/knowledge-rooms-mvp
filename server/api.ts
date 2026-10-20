// JSON API for the web app. Thin HTTP layer over rooms.ts and access.ts.
// Login is a demo switcher (pick a person); there are no passwords in the MVP.
import { Router, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { all, get, type Person, type Room } from "./db";
import { findGrant, logAccess, search, visibleEntries } from "./access";
import {
  AppError,
  addEntry,
  addLayer,
  createRoom,
  decide,
  endProject,
  invite,
  myContributions,
  portal,
  revokeMembership,
  roomDetail,
  roomSummaries,
  updateRoom,
} from "./rooms";
import { AIS, type Me, type PersonOption } from "../shared/types";

export const publicUrl = () => (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, "");

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const ais = z.array(z.enum(AIS)).min(1, "Allow at least one AI");

const cookie = (req: Request, name: string) =>
  req.headers.cookie
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

function user(req: Request): Person {
  const id = cookie(req, "uid");
  const person = id ? get<Person>("SELECT * FROM people WHERE id = ?", id) : undefined;
  if (!person) throw new AppError(401, "Not logged in");
  return person;
}

function admin(req: Request): Person {
  const person = user(req);
  if (!person.is_admin) throw new AppError(403, "Only admins of the owner company can do this");
  return person;
}

/** The room, if the logged in admin's company owns it. */
function ownedRoom(req: Request<{ id: string }>) {
  const a = admin(req);
  const room = get<Room>("SELECT * FROM rooms WHERE id = ? AND company_id = ?", req.params.id, a.company_id);
  if (!room) throw new AppError(404, "Room not found");
  return { admin: a, room };
}

const PERSON_SQL = `SELECT p.id, p.name, p.title, c.name AS company, p.is_admin AS isAdmin
                      FROM people p JOIN companies c ON c.id = p.company_id`;
const toMe = (p: PersonOption): Me => ({ ...p, isAdmin: Boolean(p.isAdmin) });

export const api = Router();

// ---------------------------------------------------------------- session

api.get("/people", (_req, res) => {
  const people = all<PersonOption>(
    `${PERSON_SQL} ORDER BY (SELECT COUNT(*) FROM rooms r WHERE r.company_id = c.id) DESC, c.name, p.is_admin DESC, p.name`,
  );
  res.json(people.map(toMe));
});

api.post("/login", (req, res) => {
  const { personId } = z.object({ personId: z.string() }).parse(req.body);
  const person = get<PersonOption>(`${PERSON_SQL} WHERE p.id = ?`, personId);
  if (!person) throw new AppError(404, "Unknown person");
  res.setHeader("Set-Cookie", `uid=${personId}; Path=/; HttpOnly; SameSite=Lax`);
  res.json(toMe(person));
});

api.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "uid=; Path=/; Max-Age=0");
  res.json({ ok: true });
});

api.get("/me", (req, res) => {
  const p = user(req);
  res.json(toMe(get<PersonOption>(`${PERSON_SQL} WHERE p.id = ?`, p.id)!));
});

// ---------------------------------------------------------------- owner company (admin)

api.get("/admin/rooms", (req, res) => {
  res.json(roomSummaries(admin(req)));
});

api.post("/admin/rooms", (req, res) => {
  const input = z.object({ name: z.string().trim().min(2), expiresAt: day, allowedAis: ais }).parse(req.body);
  res.status(201).json({ id: createRoom(admin(req), input).id });
});

api.get("/admin/rooms/:id", (req, res) => {
  res.json(roomDetail(ownedRoom(req).room));
});

api.patch("/admin/rooms/:id", (req, res) => {
  const { room } = ownedRoom(req);
  updateRoom(room, z.object({ expiresAt: day.optional(), allowedAis: ais.optional() }).parse(req.body));
  res.json({ ok: true });
});

api.post("/admin/rooms/:id/layers", (req, res) => {
  const { room } = ownedRoom(req);
  const { name } = z.object({ name: z.string().trim().min(2) }).parse(req.body);
  res.status(201).json(addLayer(room, name));
});

api.post("/admin/rooms/:id/members", (req, res) => {
  const { room, admin: a } = ownedRoom(req);
  const input = z
    .object({
      name: z.string().trim().min(2),
      company: z.string().trim().min(2),
      title: z.string().optional(),
      roleId: z.string(),
      ai: z.enum(AIS),
      accessUntil: day,
    })
    .parse(req.body);
  const person = invite(room, a, input);
  res.status(201).json({ personId: person.id });
});

api.post("/admin/rooms/:id/members/:memberId/revoke", (req: Request<{ id: string; memberId: string }>, res) => {
  const { room, admin: a } = ownedRoom(req);
  revokeMembership(room, a, req.params.memberId);
  res.json({ ok: true });
});

api.post("/admin/rooms/:id/end", (req, res) => {
  const { room, admin: a } = ownedRoom(req);
  res.json({ revoked: endProject(room, a) });
});

api.post("/admin/rooms/:id/entries", (req, res) => {
  const { room, admin: a } = ownedRoom(req);
  const input = z
    .object({ layerId: z.string(), title: z.string().trim().min(2), body: z.string().trim().min(2) })
    .parse(req.body);
  addEntry(room, a, input);
  res.status(201).json({ ok: true });
});

api.post("/admin/rooms/:id/entries/:entryId/decision", (req: Request<{ id: string; entryId: string }>, res) => {
  const { room, admin: a } = ownedRoom(req);
  const { approve, layerId } = z.object({ approve: z.boolean(), layerId: z.string().optional() }).parse(req.body);
  decide(room, a, req.params.entryId, approve, layerId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- every person (partner portal)

api.get("/my", (req, res) => {
  res.json(portal(user(req), publicUrl()));
});

/** Shows what the person's AI would receive. Logged like any other read. */
api.post("/my/preview", (req, res) => {
  const person = user(req);
  const { roomId, query } = z.object({ roomId: z.string(), query: z.string().default("") }).parse(req.body);
  const grant = findGrant(person, roomId);
  if (!grant) throw new AppError(403, "No active access to this room");
  const results = query.trim() ? search(grant, query) : visibleEntries(grant);
  const detail = query.trim() ? `searched "${query}" (${results.length} result${results.length === 1 ? "" : "s"})` : `read everything they may see`;
  logAccess(grant.room.id, person.id, "Web portal", query.trim() ? "search" : "read", detail);
  res.json(results);
});

/** Partners can export their own contributions. */
api.get("/my/export", (req, res) => {
  const person = user(req);
  res.setHeader("Content-Disposition", 'attachment; filename="my-contributions.json"');
  res.json(myContributions(person));
});

// ---------------------------------------------------------------- errors

api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return void res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return void res.status(400).json({ error: err.issues.map((i) => i.message).join("; ") });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});
