// Demo data: the Talberg Software example from the pitch deck and validation log. All names are made up.
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

  // Customer: Talberg Software builds a customer portal with external partners.
  const talberg = company("Talberg Software");
  const nordwind = company("Nordwind Software");
  const kellerDesign = company("Keller Design");
  const alpen = company("Alpen Audit AG");
  const pixelwerk = company("Pixelwerk");
  const kranich = company("Studio Kranich");
  const lindenhof = company("Lindenhof Bank");

  const sandra = person("Sandra Meier", "CTO", talberg, true);
  const jonas = person("Jonas Weber", "Head of Product", talberg);
  const marco = person("Marco Rossi", "Developer", nordwind);
  const lena = person("Lena Keller", "Freelance designer", kellerDesign);
  const daniel = person("Daniel Brunner", "IT auditor", alpen);
  const mia = person("Mia Schmid", "Developer", pixelwerk);
  const noah = person("Noah Frei", "Designer", kranich);
  const peter = person("Peter Graf", "Head of IT", lindenhof, true);

  // Talberg Software: customer portal with a software house, a freelance designer and an auditor
  const portal = room(talberg, "Customer portal", 141, ["Claude", "ChatGPT", "Copilot"], 300);
  const [standards, design, customerData] = layers(portal, ["Development standards", "Design rules", "Customer data"]);
  const lead = role(portal, "Project lead", [standards, design, customerData]);
  const developer = role(portal, "Developer", [standards]);
  const designer = role(portal, "Designer", [design]);
  const auditor = role(portal, "Auditor", [standards]);
  member(portal, marco, developer, "Claude", 141);
  member(portal, lena, designer, "ChatGPT", 141);
  member(portal, daniel, auditor, "Copilot", 5);
  member(portal, sandra, lead, "Copilot", 141);
  member(portal, jonas, lead, "ChatGPT", 141);

  entry(
    portal,
    standards,
    sandra,
    "Test data",
    "Test only with anonymised data from /testdata. Real customer data is personal data and may not leave Talberg's systems. Decision by Sandra Meier, CTO.",
    640,
  );
  entry(
    portal,
    standards,
    sandra,
    "SAP access",
    "No direct SAP queries. Read and write only through API v2. Decision by Sandra Meier, CTO.",
    630,
  );
  entry(
    portal,
    standards,
    sandra,
    "Branching and reviews",
    "Trunk based development with short lived branches. Every pull request needs one Talberg reviewer before merge.",
    620,
  );
  entry(
    portal,
    standards,
    marco,
    "Signup flow",
    "The new signup form posts to /signup/v2. Email verification is required before the first login.",
    80,
    { approvedBy: sandra },
  );
  entry(
    portal,
    design,
    jonas,
    "Design tokens",
    "Use the Talberg tokens from the shared library: 8 px spacing grid, Inter for all text, primary colour #0B5FFF.",
    600,
  );
  entry(
    portal,
    design,
    jonas,
    "Accessibility",
    "WCAG 2.2 AA is required. Minimum contrast 4.5:1 and every form field has a visible label.",
    590,
  );
  entry(
    portal,
    customerData,
    sandra,
    "Production access",
    "Only Talberg employees may access production. Partners work on the staging environment.",
    610,
  );
  entry(
    portal,
    customerData,
    sandra,
    "Customer export",
    "The monthly customer export holds names and emails of about 1,240 customers. It stays in Talberg's systems.",
    605,
  );
  entry(
    portal,
    standards,
    marco,
    "Signup API rate limit",
    "The signup API allows 100 requests a minute. Run bulk test imports at night.",
    2,
    PENDING,
  );

  audit(portal, sandra, null, "approved", 'approved "Signup flow" into Development standards', 79);
  audit(portal, daniel, "Copilot", "read", "read Development standards (4 entries)", 5);
  audit(portal, marco, "Cursor", "denied", "was denied (search): Cursor is not allowed", 2.6);
  audit(portal, marco, "Claude", "search", 'searched "test data" (1 result)', 2.1);
  audit(portal, marco, "Claude", "suggested", 'suggested "Signup API rate limit" for Development standards', 2);

  // Talberg Software: two more projects with other partners
  const dashboard = room(talberg, "Admin dashboard", 90, ["Claude", "ChatGPT", "Copilot", "Cursor"], 250);
  const [dashStandards, dashInternal] = layers(dashboard, ["Development standards", "Internal notes"]);
  const dashLead = role(dashboard, "Project lead", [dashStandards, dashInternal]);
  const dashDeveloper = role(dashboard, "Developer", [dashStandards]);
  member(dashboard, sandra, dashLead, "Copilot", 90);
  member(dashboard, jonas, dashLead, "ChatGPT", 90);
  member(dashboard, mia, dashDeveloper, "Cursor", 90);
  entry(
    dashboard,
    dashStandards,
    sandra,
    "Stack",
    "React with TypeScript, charts with the shared chart library. No new dependencies without a Talberg review.",
    90,
  );
  entry(dashboard, dashInternal, sandra, "Budget", "CHF 45,000 until the first release.", 89);

  const mobile = room(talberg, "Mobile app", 60, ["Claude", "ChatGPT", "Copilot"], 200);
  const [mobDesign, mobInternal] = layers(mobile, ["Design rules", "Internal notes"]);
  const mobLead = role(mobile, "Project lead", [mobDesign, mobInternal]);
  const mobDesigner = role(mobile, "Designer", [mobDesign]);
  member(mobile, sandra, mobLead, "Copilot", 60);
  member(mobile, noah, mobDesigner, "Claude", 60);
  entry(mobile, mobDesign, jonas, "Navigation", "Bottom tab bar with four tabs. Follow the platform guidelines for iOS and Android.", 70);

  // Another customer: Marco works for Lindenhof Bank too. Rooms stay separate.
  const banking = room(lindenhof, "Mobile banking", 53, ["Claude", "ChatGPT", "Copilot"], 150);
  const [bankStandards, bankSecurity] = layers(banking, ["Development standards", "Security rules"]);
  const bankLead = role(banking, "Project lead", [bankStandards, bankSecurity]);
  const bankDeveloper = role(banking, "Developer", [bankStandards, bankSecurity]);
  member(banking, peter, bankLead, "ChatGPT", 53);
  member(banking, marco, bankDeveloper, "Claude", 53);
  entry(banking, bankStandards, peter, "Release train", "Releases every second Tuesday. Code freeze on the Friday before.", 60);
  entry(banking, bankSecurity, peter, "Secrets", "No secrets in the repository. All keys come from the bank's vault.", 59);
}
