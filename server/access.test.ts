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
const anniversary = (name: string) => access.findGrant(person(name), "100th Anniversary")!;
const titles = (entries: { title: string }[]) => entries.map((e) => e.title);

beforeEach(() => resetAndSeed());

test("roles decide which layers a member's AI can see", () => {
  const ben = titles(access.visibleEntries(anniversary("Ben Huber")));
  assert.ok(ben.includes("Allergies"));
  assert.ok(!ben.includes("Budget"), "caterer must not see project lead knowledge");

  const kim = titles(access.visibleEntries(anniversary("Kim Baumann")));
  assert.ok(kim.includes("Venue"));
  assert.ok(!kim.includes("Allergies"));

  assert.ok(titles(access.visibleEntries(anniversary("Anna Frei"))).includes("Budget"));
});

test("search answers with the source", () => {
  const [hit] = access.search(anniversary("Ben Huber"), "How many nut-free meals do I need?");
  assert.equal(hit.title, "Allergies");
  assert.equal(hit.source, "Petra Meier (Berger AG)");
});

test("rooms of different customers stay separate", () => {
  const ben = person("Ben Huber");
  assert.deepEqual(access.activeGrants(ben).map((g) => g.room.name).sort(), ["100th Anniversary", "Wedding"]);
  assert.equal(access.findGrant(ben, "New website"), undefined);
});

test("partner contributions wait for approval, then belong to the room", () => {
  const ben = anniversary("Ben Huber");
  const result = access.contribute(ben, { title: "Wine pairing", body: "Pinot noir from Lake Zurich." }, "Gemini");
  assert.ok(!("error" in result));
  assert.equal(result.entry.status, "pending");
  assert.equal(result.layer.name, "Catering", "defaults to the most restricted layer Ben can see");
  assert.ok(!titles(access.visibleEntries(anniversary("Luca Rossi"))).includes("Wine pairing"));

  rooms.decide(room("100th Anniversary"), person("Petra Meier"), result.entry.id, true);
  assert.ok(titles(access.visibleEntries(anniversary("Luca Rossi"))).includes("Wine pairing"));
  assert.ok(!titles(access.visibleEntries(anniversary("Kim Baumann"))).includes("Wine pairing"));
});

test("the owner company saves directly", () => {
  const result = access.contribute(anniversary("Petra Meier"), { title: "Dress code", body: "Smart casual.", layer: "Everyone in the room" }, null);
  assert.ok(!("error" in result));
  assert.equal(result.entry.status, "approved");
});

test("partners cannot save to layers they cannot see", () => {
  const result = access.contribute(anniversary("Kim Baumann"), { title: "Shot list", body: "...", layer: "Project leads only" }, null);
  assert.ok("error" in result);
});

test("only allowed AIs get in", () => {
  const grant = anniversary("Ben Huber");
  assert.equal(access.aiDenied(grant, "Gemini"), null);
  assert.match(access.aiDenied(grant, "Cursor")!, /not allowed/);
  assert.equal(access.detectAi("claude-code"), "Claude");
  assert.equal(access.detectAi("cursor-vscode"), "Cursor");
  assert.equal(access.detectAi("mcp-inspector"), null);
});

test("revoking and expiry stop future access", () => {
  const r = room("100th Anniversary");
  const petra = person("Petra Meier");
  const revoked = rooms.endProject(r, petra);
  assert.equal(revoked, 4, "all partners, not Berger AG's own people");
  assert.equal(access.findGrant(person("Ben Huber"), r.id), undefined);
  assert.ok(access.findGrant(petra, r.id));

  const later = new Date(Date.now() + 365 * 86_400_000);
  assert.equal(access.findGrant(petra, r.id, later), undefined);
});

test("a new layer gets a matching role and project leads see it", () => {
  const r = room("100th Anniversary");
  const layer = rooms.addLayer(r, "Photography");
  const detail = rooms.roomDetail(r);
  assert.deepEqual(detail.layers.find((l) => l.id === layer.id)!.seenBy.sort(), ["Photography", "Project lead"]);
});
