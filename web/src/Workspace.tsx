// Workspace pages that look across all rooms of the company: approvals, partners, audit log and settings.
import { useCallback, useEffect, useState } from "react";
import type { Me, RoomDetail, RoomSummary } from "../../shared/types";
import { api } from "./api";
import { AiPicker } from "./AdminView";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Empty,
  ErrorNote,
  Field,
  Icon,
  STATUS_TONE,
  emailOf,
  firstName,
  fmtDay,
  fmtTime,
  input,
  Loading,
  loadRoomDefaults,
  saveRoomDefaults,
  toast,
} from "./ui";

/** Loads the detail of every room. Rooms are few, so one request per room is fine for the MVP. */
function useAllRooms(rooms: RoomSummary[]) {
  const [details, setDetails] = useState<RoomDetail[] | null>(null);
  const ids = rooms.map((r) => r.id).join(",");
  const load = useCallback(
    () => Promise.all(ids ? ids.split(",").map((id) => api<RoomDetail>(`/admin/rooms/${id}`)) : []).then(setDetails),
    [ids],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { details, load };
}

function Page({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-8 md:px-10">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{lead}</p>
      {children}
    </div>
  );
}

const Skeleton = () => (
  <div className="max-w-3xl animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
    <div className="h-24 rounded-xl bg-sage-50" />
    <div className="h-24 rounded-xl bg-sage-50" />
  </div>
);

const RoomLink = ({ name, onClick }: { name: string; onClick: () => void }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-bridge-900 hover:underline">
    <Icon name="folder" size={14} />
    {name}
  </button>
);

type PageProps = { rooms: RoomSummary[]; onOpenRoom: (id: string) => void; onChange: () => void };

const DAY = 86_400_000;
const daysUntil = (day: string) => Math.ceil((new Date(`${day}T23:59:59`).getTime() - Date.now()) / DAY);

/** Start page of the workspace: what needs attention, the rooms, and what partner AIs did recently. */
export function Overview({
  me,
  rooms,
  onOpenRoom,
  onNav,
}: PageProps & { me: Me; onNav: (view: "approvals" | "partners" | "audit" | "new") => void }) {
  const { details: all } = useAllRooms(rooms);
  if (!all) return <Loading />;
  // Ended projects are archived: they keep their log but need no attention.
  const details = all.filter((d) => !d.room.endedAt);

  const partners = details.flatMap((d) => d.members.filter((m) => m.isPartner && m.status === "active").map((m) => ({ d, m })));
  const partnerCompanies = new Set(partners.map((p) => p.m.company)).size;
  const pending = details.reduce((n, d) => n + d.suggestions.length, 0);
  const audit = details.flatMap((d) => d.audit.map((a) => ({ d, a }))).sort((x, y) => y.a.at.localeCompare(x.a.at));
  const blocked = audit.filter((r) => r.a.action === "denied").length;
  const ending = partners.filter((p) => daysUntil(p.m.accessUntil) <= 14).sort((x, y) => x.m.accessUntil.localeCompare(y.m.accessUntil));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const attention: {
    key: string;
    icon: Parameters<typeof Icon>[0]["name"];
    text: string;
    action: string;
    go: () => void;
    alert?: boolean;
  }[] = [];
  if (pending > 0)
    attention.push({
      key: "pending",
      icon: "inbox",
      text:
        pending === 1
          ? "1 suggestion from a partner AI is waiting for your approval"
          : `${pending} suggestions from partner AIs are waiting for your approval`,
      action: "Review",
      go: () => onNav("approvals"),
    });
  if (blocked > 0)
    attention.push({
      key: "blocked",
      icon: "shield",
      text:
        blocked === 1
          ? "1 AI that is not on the allowed list was blocked"
          : `${blocked} attempts by AIs that are not on the allowed list were blocked`,
      action: "See log",
      go: () => onNav("audit"),
      alert: true,
    });
  for (const { d, m } of ending)
    attention.push({
      key: m.id,
      icon: "clock",
      text: `${m.company} loses access to ${d.room.name} ${daysUntil(m.accessUntil) <= 0 ? "today" : `in ${daysUntil(m.accessUntil)} days`}`,
      action: "Open room",
      go: () => onOpenRoom(d.room.id),
    });

  return (
    <div className="px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {firstName(me.name)}
          </h1>
          <p className="mt-1 text-sm text-muted">{me.company}: what your partners' AIs can see, and what they did.</p>
        </div>
        <Button variant="primary" onClick={() => onNav("new")}>
          <Icon name="plus" size={15} /> New room
        </Button>
      </div>

      <p className="nums mt-5 text-sm text-stone-700">
        {details.length} {details.length === 1 ? "room" : "rooms"} · {partnerCompanies} {partnerCompanies === 1 ? "partner" : "partners"} ·{" "}
        {partners.length} {partners.length === 1 ? "person" : "people"} with access
      </p>

      <section className="mt-6 max-w-6xl" aria-labelledby="attention">
        <h2 id="attention" className="mb-3 font-bold">
          Needs your attention
        </h2>
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-sage-50 px-4 py-3 text-sm text-bridge-900">
            <Icon name="check" size={16} /> Nothing to do. No open suggestions, no blocked AIs, no access ending soon.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {attention.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <Icon name={a.icon} size={17} className={a.alert ? "text-blocked" : "text-bridge-900"} />
                <span className={`min-w-48 flex-1 ${a.alert ? "text-blocked" : ""}`}>{a.text}</span>
                <Button onClick={a.go}>{a.action}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="mb-3 font-bold">Rooms</h2>
            <ul className="space-y-2.5">
              {details.map((d) => {
                const active = d.members.filter((m) => m.isPartner && m.status === "active");
                return (
                  <li key={d.room.id}>
                    <button
                      onClick={() => onOpenRoom(d.room.id)}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-white px-4 py-3.5 text-left transition-colors hover:border-sage-400"
                    >
                      <Icon name="folder" className="text-bridge-900" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{d.room.name}</span>
                        <span className="text-xs text-muted">
                          {new Set(active.map((m) => m.company)).size} partners · {d.layers.length} layers · until{" "}
                          {fmtDay(d.room.expiresAt)}
                        </span>
                      </span>
                      <span className="flex -space-x-2">
                        {[...new Set(active.map((m) => m.company))].slice(0, 4).map((c) => (
                          <span key={c} className="rounded-full ring-2 ring-white" title={c}>
                            <Avatar name={c} size={28} />
                          </span>
                        ))}
                      </span>
                      {d.suggestions.length > 0 && <Badge tone="amber">{d.suggestions.length} to approve</Badge>}
                      <Icon name="chevron" size={16} className="text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recent activity</h2>
            <button onClick={() => onNav("audit")} className="text-sm font-medium text-bridge-900 hover:underline">
              Full audit log
            </button>
          </div>
          {audit.length === 0 ? (
            <Empty icon="shield" title="No activity yet">
              Reads, suggestions and blocked AIs will be listed here.
            </Empty>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {audit.slice(0, 8).map(({ d, a }) => {
                const company = d.members.find((m) => m.name === a.person)?.company;
                return (
                  <li key={`${d.room.id}-${a.id}`} className="px-4 py-2.5 text-sm">
                    <span className={a.action === "denied" ? "text-blocked" : "text-stone-800"}>
                      {a.ai ? `${a.ai} (${company ?? firstName(a.person)})` : firstName(a.person)}{" "}
                      {a.action === "denied" ? "blocked: not an allowed AI in this room" : a.detail}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {fmtTime(a.at)} · {d.room.name}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function Approvals({ rooms, onOpenRoom, onChange }: PageProps) {
  const { details, load } = useAllRooms(rooms);
  const [error, setError] = useState<string | null>(null);
  const items = (details ?? []).flatMap((d) => d.suggestions.map((s) => ({ d, s })));

  async function decide(roomId: string, entryId: string, approve: boolean) {
    setError(null);
    try {
      await api(`/admin/rooms/${roomId}/entries/${entryId}/decision`, { body: { approve } });
      await load();
      onChange();
      toast(approve ? "Approved, now in the room" : "Suggestion rejected");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Page title="Approvals" lead="What partner AIs suggest. Nothing enters a room before you approve it.">
      <ErrorNote error={error} />
      {!details && <Skeleton />}
      {details && items.length === 0 && (
        <Empty icon="check" title="All caught up">
          Nothing is waiting for your approval. Suggestions from partner AIs show up here.
        </Empty>
      )}
      <div className="max-w-3xl space-y-3">
        {items.map(({ d, s }) => {
          const ai = d.members.find((m) => m.name === s.author)?.ai;
          return (
            <div key={s.id} className="rounded-xl border border-line bg-sage-50 p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <Icon name="sparkle" size={16} className="text-bridge-900" />
                <span>
                  {s.authorCompany}'s AI{ai ? ` (${ai})` : ""} suggests
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <RoomLink name={d.room.name} onClick={() => onOpenRoom(d.room.id)} />
                  <span className="text-xs text-muted">{fmtTime(s.createdAt)}</span>
                </span>
              </div>
              <p className="mt-2 font-bold">{s.title}</p>
              <p className="mt-1 text-[15px] leading-relaxed">{s.body}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => decide(d.room.id, s.id, false)}>Reject</Button>
                <Button variant="primary" onClick={() => decide(d.room.id, s.id, true)}>
                  Approve
                </Button>
                <span className="ml-2 text-xs text-muted">into {s.layer}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}

export function Partners({ rooms, onOpenRoom, onChange }: PageProps) {
  const { details, load } = useAllRooms(rooms);
  const [error, setError] = useState<string | null>(null);
  const rows = (details ?? []).flatMap((d) => d.members.filter((m) => m.isPartner).map((m) => ({ d, m })));
  const companies = [...new Set(rows.map((r) => r.m.company))].sort();

  async function revoke(roomId: string, memberId: string, who: string) {
    if (!confirm(`Revoke access for ${who}? Their AI can no longer read this room.`)) return;
    setError(null);
    try {
      await api(`/admin/rooms/${roomId}/members/${memberId}/revoke`, { method: "POST" });
      await load();
      onChange();
      toast("Access revoked");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Page title="Partners" lead="Every external partner across your rooms, with the AI they use and until when. Partners join free.">
      <ErrorNote error={error} />
      {!details && <Skeleton />}
      {details && rows.length === 0 && (
        <Empty icon="users" title="No partners yet">
          Open a room and invite the first partner. They join free with the AI they already use.
        </Empty>
      )}
      <div className="max-w-4xl space-y-4">
        {companies.map((company) => (
          <section key={company} className="rounded-xl border border-line bg-white">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Avatar name={company} />
              <h2 className="font-bold">{company}</h2>
            </header>
            <ul className="divide-y divide-line">
              {rows
                .filter((r) => r.m.company === company)
                .map(({ d, m }) => (
                  <li
                    key={m.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${m.status === "active" ? "" : "opacity-60"}`}
                  >
                    <span className="min-w-40 flex-1">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted">, {m.role}</span>
                    </span>
                    <RoomLink name={d.room.name} onClick={() => onOpenRoom(d.room.id)} />
                    <Chip>{m.ai}</Chip>
                    <span className="w-28 text-xs text-muted">until {fmtDay(m.accessUntil)}</span>
                    {m.status === "active" ? (
                      <button
                        onClick={() => revoke(d.room.id, m.id, `${m.name} (${m.company})`)}
                        className="w-14 text-right text-xs font-medium text-muted hover:text-blocked"
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="w-14 text-right">
                        <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}

export function AuditLog({ rooms, onOpenRoom }: PageProps) {
  const { details } = useAllRooms(rooms);
  const [only, setOnly] = useState<"all" | "denied">("all");
  const [roomId, setRoomId] = useState("");
  const [company, setCompany] = useState("");
  const all = (details ?? []).flatMap((d) =>
    d.audit.map((a) => ({ d, a, company: d.members.find((m) => m.name === a.person)?.company ?? d.room.owner })),
  );
  const companies = [...new Set(all.map((r) => r.company))].sort();
  const rows = all
    .filter((r) => only === "all" || r.a.action === "denied")
    .filter((r) => !roomId || r.d.room.id === roomId)
    .filter((r) => !company || r.company === company)
    .sort((x, y) => y.a.at.localeCompare(x.a.at));
  const filter = (v: typeof only, label: string) => (
    <button
      onClick={() => setOnly(v)}
      className={`rounded-full px-3 py-1 text-xs font-bold ${only === v ? "bg-bridge-900 text-white" : "bg-sage-100 text-bridge-900 hover:bg-sage-200"}`}
    >
      {label}
    </button>
  );

  return (
    <Page title="Audit log" lead="Every read, suggestion and blocked AI across your rooms.">
      <div className="mb-4 flex max-w-4xl flex-wrap items-center gap-2">
        {filter("all", "Everything")}
        {filter("denied", "Blocked AIs")}
        <select
          className={`${input} ml-2 !w-auto !py-1 text-sm`}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          aria-label="Filter by room"
        >
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className={`${input} !w-auto !py-1 text-sm`}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-label="Filter by company"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <a
          href={`/api/admin/audit.csv${roomId ? `?room=${roomId}` : ""}`}
          className="ml-auto inline-flex items-center rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-semibold hover:bg-sage-50"
        >
          Export CSV
        </a>
      </div>
      {!details && <Skeleton />}
      {details && rows.length === 0 && (
        <Empty icon="shield" title={only === "denied" ? "No blocked AIs" : "No activity yet"}>
          {only === "denied"
            ? "Every AI that connected so far was on the allowed list."
            : "Reads, suggestions and blocked AIs will be listed here."}
        </Empty>
      )}
      <ul className={`max-w-4xl divide-y divide-line rounded-xl border border-line bg-white ${rows.length === 0 ? "hidden" : ""}`}>
        {rows.map(({ d, a, company }) => {
          return (
            <li key={`${d.room.id}-${a.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="nums w-28 shrink-0 font-mono text-xs text-muted">{fmtTime(a.at)}</span>
              <span className={`min-w-60 flex-1 ${a.action === "denied" ? "text-blocked" : "text-stone-700"}`}>
                {a.ai ? `${a.ai} (${company ?? firstName(a.person)})` : firstName(a.person)}{" "}
                {a.action === "denied" ? "blocked: not an allowed AI in this room" : a.detail}
              </span>
              <RoomLink name={d.room.name} onClick={() => onOpenRoom(d.room.id)} />
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="mb-3 font-bold">{title}</h2>
      {children}
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2.5 text-sm first:border-t-0 first:pt-0 last:pb-0">
    <span className="text-muted">{label}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
);

const Planned = () => <Badge tone="amber">Planned</Badge>;
const Built = () => <Badge tone="green">In place</Badge>;

export function Settings({ me, rooms, onPlans }: { me: Me; rooms: RoomSummary[]; onPlans: () => void }) {
  const [defaults, setDefaults] = useState(loadRoomDefaults);
  const [saved, setSaved] = useState(false);
  // The reset exists only when the server runs as a demo (DEMO_MODE=true).
  const [demoMode, setDemoMode] = useState(false);
  useEffect(() => {
    api<{ demoMode: boolean }>("/config").then(
      (c) => setDemoMode(c.demoMode),
      () => setDemoMode(false),
    );
  }, []);

  async function resetDemo() {
    if (!confirm("Reset the demo?\n\nEverything you changed is replaced by the original example, and you are signed out.")) return;
    await api("/admin/reset", { method: "POST" });
    await api("/logout", { method: "POST" }).catch(() => undefined);
    location.reload();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    saveRoomDefaults(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Page title="Settings" lead={me.isAdmin ? `Account and workspace of ${me.company}.` : "Your account."}>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card title="Account">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={me.name} solid size={44} />
            <div>
              <div className="font-bold">{me.name}</div>
              <div className="text-sm text-muted">{[me.title, me.company].filter(Boolean).join(", ")}</div>
            </div>
          </div>
          <Row label="Email">{emailOf(me)}</Row>
          <Row label="Role">{me.isAdmin ? "Admin" : "Member"}</Row>
          <Row label="Password">Not used yet</Row>
        </Card>

        {me.isAdmin && (
          <>
            <Card title="Workspace">
              <Row label="Company">{me.company}</Row>
              <Row label="Project rooms">{rooms.length}</Row>
              <Row label="Internal seats">Unlimited</Row>
              <Row label="Partners">Always free</Row>
              <div className="mt-4">
                <Button onClick={onPlans}>Plans and pricing</Button>
              </div>
            </Card>

            <Card title="Defaults for new rooms">
              <form onSubmit={save} className="space-y-4">
                <AiPicker value={defaults.allowedAis} onChange={(allowedAis) => setDefaults({ ...defaults, allowedAis })} />
                <Field label="Access ends after (days)">
                  <input
                    className={`${input} !w-28`}
                    type="number"
                    min={1}
                    max={730}
                    value={defaults.days}
                    onChange={(e) => setDefaults({ ...defaults, days: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Button variant="primary" type="submit">
                    Save defaults
                  </Button>
                  {saved && <span className="text-sm text-bridge-900">Saved</span>}
                </div>
                <p className="text-xs text-muted">Used when you create a room. Kept in this browser; each room can still be changed.</p>
              </form>
            </Card>

            <Card title="Security and data">
              <Row label="Access rules: role, allowed AI, expiry, revoke">
                <Built />
              </Row>
              <Row label="Approval of partner suggestions">
                <Built />
              </Row>
              <Row label="Audit log of reads and blocked AIs">
                <Built />
              </Row>
              <Row label="Verified login (SSO, OAuth)">
                <Planned />
              </Row>
              <Row label="Hosting in Switzerland">
                <Planned />
              </Row>
              <Row label="Data processing agreement">
                <Planned />
              </Row>
              <p className="mt-3 text-xs text-muted">
                Until a verified login exists, the allowed AI check reads the app name an AI reports. Revoking stops future access but
                cannot erase what an AI has already read.
              </p>
            </Card>

            <Card title="Knowledge sources">
              {["Microsoft 365", "Confluence", "Jira", "Notion"].map((s) => (
                <Row key={s} label={s}>
                  <Planned />
                </Row>
              ))}
              <p className="mt-3 text-xs text-muted">Today knowledge is added to rooms by hand or through partner suggestions.</p>
            </Card>

            {demoMode && (
              <Card title="Demo data">
                <p className="text-sm text-stone-700">
                  Restore the Talberg Software example. Every room, partner, suggestion and personal AI link is recreated, for all demo
                  accounts.
                </p>
                <div className="mt-4">
                  <Button variant="danger" onClick={resetDemo}>
                    Reset demo data
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
