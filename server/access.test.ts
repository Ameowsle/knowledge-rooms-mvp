import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.DB_FILE = ":memory:";
const { get } = await import("./db");
const { resetAndSeed } = await import("./seed");
const access = await import("./access");
const rooms = await import("./rooms");
type Person = import("./db").Person;
type Room = import("./db").Room;

const person = (name: string) => get<Person>("SELECT * FROM people WHERE name = ?", name)!;
const room = (name: string) => get<Room>("SELECT * FROM rooms WHERE name = ?", name)!;
const portal = (name: string) => access.findGrant(person(name), "Customer portal")!;
const titles = (entries: { title: string }[]) => entries.map((e) => e.title);

beforeEach(() => resetAndSeed());

test("roles decide which layers a member's AI can see", () => {
  const marco = titles(access.visibleEntries(portal("Marco Rossi")));
  assert.ok(marco.includes("Test data"));
  assert.ok(!marco.includes("Customer export"), "developer must not see customer data");

  const lena = titles(access.visibleEntries(portal("Lena Keller")));
  assert.ok(lena.includes("Design tokens"));
  assert.ok(!lena.includes("Test data"));

  assert.ok(titles(access.visibleEntries(portal("Sandra Meier"))).includes("Customer export"));
});

test("search answers with the source", () => {
  const [hit] = access.search(portal("Marco Rossi"), "Can I test with real customer data?");
  assert.equal(hit.title, "Test data");
  assert.equal(hit.source, "Sandra Meier (Talberg Software)");
});

test("rooms of different customers stay separate", () => {
  const marco = person("Marco Rossi");
  assert.deepEqual(
    access
      .activeGrants(marco)
      .map((g) => g.room.name)
      .sort(),
    ["Customer portal", "Mobile banking"],
  );
  assert.equal(access.findGrant(marco, "Admin dashboard"), undefined);
});

test("partner contributions wait for approval, then belong to the room", () => {
  const marco = portal("Marco Rossi");
  const result = access.contribute(marco, { title: "Staging reset", body: "Staging resets every night at 02:00." }, "Claude");
  assert.ok(!("error" in result));
  assert.equal(result.entry.status, "pending");
  assert.equal(result.layer.name, "Development standards", "defaults to the most restricted layer Marco can see");
  assert.ok(!titles(access.visibleEntries(portal("Daniel Brunner"))).includes("Staging reset"));

  rooms.decide(room("Customer portal"), person("Sandra Meier"), result.entry.id, true);
  assert.ok(titles(access.visibleEntries(portal("Daniel Brunner"))).includes("Staging reset"));
  assert.ok(!titles(access.visibleEntries(portal("Lena Keller"))).includes("Staging reset"));
});

test("the owner company saves directly", () => {
  const result = access.contribute(
    portal("Sandra Meier"),
    {
      title: "Icon set",
      body: "Use the shared icon set.",
      layer: "Design rules",
    },
    null,
  );
  assert.ok(!("error" in result));
  assert.equal(result.entry.status, "approved");
});

test("partners cannot save to layers they cannot see", () => {
  const result = access.contribute(portal("Lena Keller"), { title: "Sample records", body: "...", layer: "Customer data" }, null);
  assert.ok("error" in result);
});

test("only allowed AIs get in", () => {
  const grant = portal("Marco Rossi");
  assert.equal(access.aiDenied(grant, "Claude"), null);
  assert.match(access.aiDenied(grant, "Cursor")!, /not allowed/);
  assert.equal(access.detectAi("claude-code"), "Claude");
  assert.equal(access.detectAi("cursor-vscode"), "Cursor");
  assert.equal(access.detectAi("mcp-inspector"), null);
});

test("revoking and expiry stop future access", () => {
  const r = room("Customer portal");
  const sandra = person("Sandra Meier");
  const revoked = rooms.endProject(r, sandra);
  assert.equal(revoked, 3, "all partners, not Talberg's own people");
  assert.equal(access.findGrant(person("Marco Rossi"), r.id), undefined);
  assert.ok(access.findGrant(sandra, r.id));

  const later = new Date(Date.now() + 365 * 86_400_000);
  assert.equal(access.findGrant(sandra, r.id, later), undefined);
});

test("a new layer gets a matching role and project leads see it", () => {
  const r = room("Customer portal");
  const layer = rooms.addLayer(r, "Release notes");
  const detail = rooms.roomDetail(r);
  assert.deepEqual(detail.layers.find((l) => l.id === layer.id)!.seenBy.sort(), ["Project lead", "Release notes"]);
});

test("a room can be renamed", () => {
  const r = room("Customer portal");
  rooms.updateRoom(r, { name: "Customer portal 2.0" });
  assert.ok(room("Customer portal 2.0"));
});

test("ending a project closes the room until it is reopened or deleted", () => {
  const sandra = person("Sandra Meier");
  rooms.endProject(room("Customer portal"), sandra);
  assert.ok(room("Customer portal").ended_at, "the room is marked as ended");
  assert.throws(() => rooms.assertOpen(room("Customer portal")), /has ended/);
  assert.ok(rooms.roomSummaries(sandra).find((r) => r.name === "Customer portal")!.endedAt);

  rooms.reopenProject(room("Customer portal"), sandra);
  assert.equal(room("Customer portal").ended_at, null);
  assert.equal(access.findGrant(person("Marco Rossi"), "Customer portal"), undefined, "partners stay revoked after reopening");

  assert.throws(() => rooms.deleteRoom(room("Customer portal")), /End the project/);
  rooms.endProject(room("Customer portal"), sandra);
  rooms.deleteRoom(room("Customer portal"));
  assert.equal(room("Customer portal"), undefined);
  assert.ok(room("Admin dashboard"), "other rooms are untouched");
});
