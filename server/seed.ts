// Demo data: the Berger AG example from our product doc. All names are made up.
import { get, newId, newToken, run, transaction } from "./db";
import { today } from "./access";

const TABLES = ["audit_log", "entries", "memberships", "roles", "layers", "rooms", "people", "companies"];

const inDays = (n: number) => today(new Date(Date.now() + n * 86_400_000));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const isEmpty = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM companies")!.n === 0;

export function resetAndSeed() {
  transaction(() => {
    for (const table of TABLES) run(`DELETE FROM ${table}`);
    seed();
  });
}

function seed() {
  const company = (name: string) => {
    const id = newId();
    run("INSERT INTO companies (id, name) VALUES (?, ?)", id, name);
    return id;
  };
  const person = (name: string, title: string, companyId: string, isAdmin = false) => {
    const id = newId();
    run(
      "INSERT INTO people (id, name, title, company_id, is_admin, token) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      name,
      title,
      companyId,
      isAdmin ? 1 : 0,
      newToken(),
    );
    return id;
  };
  const room = (companyId: string, name: string, days: number, ais: string[], createdHoursAgo: number) => {
    const id = newId();
    run(
      "INSERT INTO rooms (id, company_id, name, expires_at, allowed_ais, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      companyId,
      name,
      inDays(days),
      JSON.stringify(ais),
      hoursAgo(createdHoursAgo),
    );
    return id;
  };
  /** Creates layers in order and returns their ids. */
  const layers = (roomId: string, names: string[]) =>
    names.map((name, position) => {
      const id = newId();
      run("INSERT INTO layers (id, room_id, name, position) VALUES (?, ?, ?, ?)", id, roomId, name, position);
      return id;
    });
  const role = (roomId: string, name: string, layerIds: string[]) => {
    const id = newId();
    run("INSERT INTO roles (id, room_id, name, layer_ids) VALUES (?, ?, ?, ?)", id, roomId, name, JSON.stringify(layerIds));
    return id;
  };
  const member = (roomId: string, personId: string, roleId: string, ai: string, days: number) =>
    run(
      `INSERT INTO memberships (id, room_id, person_id, role_id, ai, access_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      roomId,
      personId,
      roleId,
      ai,
      inDays(days),
      hoursAgo(200),
    );
  const entry = (
    roomId: string,
    layerId: string,
    authorId: string,
    title: string,
    body: string,
    ageHours: number,
    review?: { pending: true } | { approvedBy: string },
  ) =>
    run(
      `INSERT INTO entries (id, room_id, layer_id, title, body, author_id, status, created_at, decided_at, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      roomId,
      layerId,
      title,
      body,
      authorId,
      review && "pending" in review ? "pending" : "approved",
      hoursAgo(ageHours),
      review && "approvedBy" in review ? hoursAgo(ageHours - 1) : null,
      review && "approvedBy" in review ? review.approvedBy : null,
    );
  const PENDING = { pending: true } as const;
  const audit = (roomId: string, personId: string, ai: string | null, action: string, detail: string, ageHours: number) =>
    run(
      "INSERT INTO audit_log (room_id, person_id, ai, action, detail, at) VALUES (?, ?, ?, ?, ?, ?)",
      roomId,
      personId,
      ai,
      action,
      detail,
      hoursAgo(ageHours),
    );

  const berger = company("Berger AG");
  const festwerk = company("Festwerk");
  const huber = company("Huber Catering");
  const baumann = company("Studio Baumann");
  const pixelwerk = company("Pixelwerk");
  const kranich = company("Design studio Kranich");
  const keller = company("Keller family");

  const petra = person("Petra Meier", "HR", berger, true);
  const jonas = person("Jonas Weber", "Marketing", berger);
  const anna = person("Anna Frei", "Project lead", festwerk);
  const luca = person("Luca Rossi", "Event planner", festwerk);
  const ben = person("Ben Huber", "Chef", huber);
  const kim = person("Kim Baumann", "Photographer", baumann);
  const mia = person("Mia Schmid", "Web developer", pixelwerk);
  const noah = person("Noah Brunner", "Designer", kranich);
  const sandra = person("Sandra Keller", "Bride", keller, true);

  // Berger AG: 100th anniversary with Festwerk, a caterer and a photographer
  const anniversary = room(berger, "100th Anniversary", 41, ["Claude", "ChatGPT", "Gemini", "Copilot"], 300);
  const [everyone, catering, leads] = layers(anniversary, ["Everyone in the room", "Catering", "Project leads only"]);
  const lead = role(anniversary, "Project lead", [everyone, catering, leads]);
  const cateringRole = role(anniversary, "Catering", [everyone, catering]);
  const everyoneRole = role(anniversary, "Everyone", [everyone]);
  member(anniversary, anna, lead, "Claude", 41);
  member(anniversary, luca, cateringRole, "ChatGPT", 41);
  member(anniversary, ben, cateringRole, "Gemini", 41);
  member(anniversary, kim, everyoneRole, "Claude", 41);
  member(anniversary, petra, lead, "Copilot", 41);
  member(anniversary, jonas, everyoneRole, "ChatGPT", 41);

  entry(anniversary, everyone, anna, "Schedule", "17:00 doors open, 18:00 speech by the CEO, 19:00 dinner, 21:00 party with live band, 01:00 end.", 120);
  entry(anniversary, everyone, anna, "Venue", "Seehalle, Seestrasse 12, Thalwil. Capacity 300. Loading dock at the back, open from 14:00.", 118);
  entry(anniversary, everyone, jonas, "Logo and colors", "Use the anniversary logo \"100 years Berger\". Colors: cocoa brown #4A2C2A and gold #C9A227. Font: Berger Sans only.", 110);
  entry(anniversary, catering, petra, "Guest count", "250 guests confirmed: employees, partners and their families.", 100);
  entry(anniversary, catering, petra, "Allergies", "12 guests have a nut allergy. 4 guests are vegetarian, 2 vegan. As a chocolate factory we label every dessert.", 99);
  entry(anniversary, catering, ben, "Menu (first draft)", "Starter: pumpkin soup. Main: veal with rösti or vegetable risotto. Dessert: Berger chocolate mousse.", 80, { approvedBy: petra });
  entry(anniversary, catering, ben, "Delivery times", "Catering team arrives 15:00, hot food is delivered 18:30, dessert is served 20:30.", 30, { approvedBy: petra });
  entry(anniversary, leads, petra, "Budget", "Total budget CHF 80,000. Catering max CHF 32,000, venue CHF 15,000, band CHF 8,000.", 98);
  entry(anniversary, leads, petra, "Guest list with names", "The guest list with names lives in the HR system. Seating plan is final two weeks before the event. Changes go through Petra.", 97);
  entry(anniversary, catering, ben, "Adjusted menu, 12 nut-free dishes", "Starter and main are nut-free for everyone. Dessert: chocolate mousse for 238 guests; 12 nut-free portions with fruit sorbet, prepared separately and marked with a green card.", 2, PENDING);
  entry(anniversary, everyone, anna, "Supplier list with 8 contacts", "Sound: Tonwerk. Light: Lumen AG. Flowers: Blumen Graf. Furniture: Eventmobil. Security: Secura. Shuttle: Seebus. Photo booth: Snapbox. Cleaning: Rein & Co.", 3, PENDING);

  audit(anniversary, petra, null, "approved", 'approved "Delivery times" into Catering', 29);
  audit(anniversary, anna, "Claude", "suggested", 'suggested "Supplier list with 8 contacts" for Everyone in the room', 3);
  audit(anniversary, kim, "Claude", "read", "read Everyone in the room (3 entries)", 2.8);
  audit(anniversary, ben, "Gemini", "search", 'searched "nut-free meals" (2 results)', 2.1);
  audit(anniversary, ben, "Gemini", "suggested", 'suggested "Adjusted menu, 12 nut-free dishes" for Catering', 2);

  // Berger AG: two more projects with other partners
  const website = room(berger, "New website", 90, ["Claude", "ChatGPT", "Copilot", "Cursor"], 250);
  const [webEveryone, webLeads] = layers(website, ["Everyone in the room", "Project leads only"]);
  const webLead = role(website, "Project lead", [webEveryone, webLeads]);
  const webEveryoneRole = role(website, "Everyone", [webEveryone]);
  member(website, petra, webLead, "Copilot", 90);
  member(website, jonas, webLead, "ChatGPT", 90);
  member(website, mia, webEveryoneRole, "Cursor", 90);
  entry(website, webEveryone, jonas, "Brand voice", "Warm, Swiss, crafted. We say \"chocolate makers\", never \"factory workers\". Short sentences.", 90);
  entry(website, webLeads, petra, "Launch budget", "CHF 45,000 including hosting for the first year.", 89);

  const packaging = room(berger, "New packaging", 60, ["Claude", "ChatGPT", "Copilot"], 200);
  const [packEveryone, packLeads] = layers(packaging, ["Everyone in the room", "Project leads only"]);
  const packLead = role(packaging, "Project lead", [packEveryone, packLeads]);
  const packEveryoneRole = role(packaging, "Everyone", [packEveryone]);
  member(packaging, petra, packLead, "Copilot", 60);
  member(packaging, noah, packEveryoneRole, "Claude", 60);
  entry(packaging, packEveryone, jonas, "Packaging rules", "Recycled cardboard only. Allergen icons on the front. Logo at least 20 mm wide.", 70);

  // Another customer: Ben works for the Keller family too. Rooms stay separate.
  const wedding = room(keller, "Wedding", 53, ["Claude", "ChatGPT", "Gemini"], 150);
  const [wedEveryone, wedCatering] = layers(wedding, ["Everyone in the room", "Catering"]);
  const wedLead = role(wedding, "Project lead", [wedEveryone, wedCatering]);
  const wedCateringRole = role(wedding, "Catering", [wedEveryone, wedCatering]);
  member(wedding, sandra, wedLead, "ChatGPT", 53);
  member(wedding, ben, wedCateringRole, "Gemini", 53);
  entry(wedding, wedEveryone, sandra, "Date and place", "Wedding at Schloss Au, 80 guests, ceremony 14:00, dinner 18:00.", 60);
  entry(wedding, wedCatering, sandra, "Diets", "3 vegan guests, 1 gluten free. No fish.", 59);
}
