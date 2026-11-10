import { useCallback, useEffect, useState } from "react";
import type { EntryInfo, MemberInfo, RoomDetail } from "../../shared/types";
import { api } from "./api";
import { AiPicker } from "./AdminView";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  ErrorNote,
  Field,
  Icon,
  Section,
  STATUS_TONE,
  firstName,
  fmtDay,
  fmtTime,
  formPanel,
  input,
  toast,
  Loading,
} from "./ui";

export function RoomDetailView({ roomId, onChange, onDeleted }: { roomId: string; onChange: () => void; onDeleted: () => void }) {
  const [d, setD] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"settings" | "invite" | "entry" | "layer" | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => api<RoomDetail>(`/admin/rooms/${roomId}`).then(setD), [roomId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  /** Run a change, then reload the room and the sidebar. */
  async function act(fn: () => Promise<unknown>, done = "Saved") {
    setError(null);
    try {
      await fn();
      setPanel(null);
      await load();
      onChange();
      toast(done);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!d)
    return error ? (
      <div className="px-10 py-8">
        <ErrorNote error={error} />
      </div>
    ) : (
      <Loading />
    );
  const base = `/admin/rooms/${roomId}`;
  const toggle = (p: typeof panel) => setPanel(panel === p ? null : p);
  const ended = d.room.endedAt !== null;
  const endProject = () =>
    confirm(
      `End "${d.room.name}"?\n\nAll partners and their AIs lose access now. ${d.room.owner} keeps all approved knowledge and the audit log. You can reopen the room later, but partners must be invited again.`,
    ) && act(() => api(`${base}/end`, { method: "POST" }), "Project ended");
  async function deleteRoom() {
    if (!confirm(`Delete "${d!.room.name}" for good?\n\nIts knowledge, members and audit log are removed. This cannot be undone.`)) return;
    setError(null);
    try {
      await api(base, { method: "DELETE" });
      toast("Room deleted");
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const revoke = (m: MemberInfo) =>
    confirm(`Revoke access for ${m.name} (${m.company})? Their AI can no longer read this room.`) &&
    act(() => api(`${base}/members/${m.id}/revoke`, { method: "POST" }), "Access revoked");
  const partners = d.members.filter((m) => m.isPartner);
  const team = d.members.filter((m) => !m.isPartner);
  const partnerRoleIds = new Set(partners.map((m) => m.roleId));
  // Partners are counted as companies, the way the customer thinks about them.
  const activePartners = new Set(partners.filter((m) => m.status === "active").map((m) => m.company)).size;
  // Roles held only by the owner company see everything anyway, so they are left off the layer chips.
  const ownerOnlyRoles = new Set(
    d.roles.filter((r) => team.some((m) => m.roleId === r.id) && !partnerRoleIds.has(r.id)).map((r) => r.name),
  );
  const companyOf = (person: string) => d.members.find((m) => m.name === person)?.company;
  // A layer is "company only" when no partner holds a role that can see it.
  const partnerLayerIds = new Set(d.roles.filter((r) => partnerRoleIds.has(r.id)).flatMap((r) => r.layerIds));
  const aiOf = (author: string) => d.members.find((m) => m.name === author)?.ai;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-6 md:px-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{d.room.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {ended ? "Ended" : `${activePartners} ${activePartners === 1 ? "partner" : "partners"}`} · access until{" "}
            {fmtDay(d.room.expiresAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">Allowed AIs</span>
          {d.room.allowedAis.map((ai) => (
            <Chip key={ai} variant="soft">
              {ai}
            </Chip>
          ))}
          {!ended && (
            <>
              <Button className="ml-3" onClick={() => toggle("settings")}>
                Settings
              </Button>
              <Button variant="danger" onClick={endProject}>
                End project
              </Button>
            </>
          )}
        </div>
      </header>

      {ended && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-sage-50 px-6 py-4 md:px-10">
          <Icon name="lock" className="text-bridge-900" />
          <p className="min-w-60 flex-1 text-sm">
            <span className="font-bold">This project ended on {fmtDay(d.room.endedAt!.slice(0, 10))}.</span> Partners and their AIs no
            longer have access. {d.room.owner} keeps all approved knowledge and the audit log. The room is read only.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => act(() => api(`${base}/reopen`, { method: "POST" }), "Project reopened")}>Reopen</Button>
            <Button variant="danger" onClick={deleteRoom}>
              Delete room
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 py-6 md:px-10">
        <ErrorNote error={error} />
        {panel === "settings" && <Settings d={d} onSave={(body) => act(() => api(base, { method: "PATCH", body }))} />}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Section
              title="Layers"
              action={
                !ended && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => toggle("layer")}>
                      <Icon name="plus" size={15} /> Layer
                    </Button>
                    <Button onClick={() => toggle("entry")}>
                      <Icon name="plus" size={15} /> Entry
                    </Button>
                  </div>
                )
              }
            >
              {panel === "layer" && <AddLayer onAdd={(name) => act(() => api(`${base}/layers`, { body: { name } }), "Layer added")} />}
              {panel === "entry" && <EntryForm d={d} onAdd={(body) => act(() => api(`${base}/entries`, { body }), "Entry added")} />}
              <div className="space-y-2.5">
                {d.layers.map((layer) => {
                  const entries = d.entries.filter((e) => e.layerId === layer.id);
                  const companyOnly = !partnerLayerIds.has(layer.id);
                  const isOpen = open === layer.id;
                  return (
                    <div key={layer.id} className="rounded-xl border border-line bg-white">
                      <button
                        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                        onClick={() => setOpen(isOpen ? null : layer.id)}
                        aria-expanded={isOpen}
                      >
                        <Icon name={companyOnly ? "lock" : "layers"} className="text-bridge-900" />
                        <span className="font-medium">{layer.name}</span>
                        <span className="text-xs text-muted">
                          {entries.length} {entries.length === 1 ? "entry" : "entries"}
                        </span>
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                          {companyOnly ? (
                            <span className="inline-flex items-center gap-1 text-sm text-muted">
                              <Icon name="lock" size={14} /> Company only
                            </span>
                          ) : (
                            layer.seenBy.filter((role) => !ownerOnlyRoles.has(role)).map((role) => <Chip key={role}>{role}</Chip>)
                          )}
                          <Icon name="chevron" size={16} className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-line bg-sage-50 px-4 py-3">
                          {companyOnly && layer.seenBy.length > 0 && (
                            <p className="mb-2 text-xs text-muted">Seen by roles: {layer.seenBy.join(", ")}</p>
                          )}
                          {entries.length === 0 ? (
                            <p className="text-sm text-muted">No entries yet.</p>
                          ) : (
                            <ul className="divide-y divide-line">
                              {entries.map((e) => (
                                <li key={e.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-bold">{e.title}</span>
                                    <span className="text-xs text-muted">
                                      {e.author} · {e.authorCompany}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 max-w-[75ch] text-stone-700">{e.body}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Waiting for your approval">
              {d.suggestions.length === 0 ? (
                <p className="text-sm text-muted">Nothing to review. Partner suggestions from their AIs show up here.</p>
              ) : (
                <div className="space-y-3">
                  {d.suggestions.map((s) => (
                    <Suggestion
                      key={s.id}
                      s={s}
                      d={d}
                      ai={aiOf(s.author)}
                      onDecide={(approve, layerId) =>
                        act(() =>
                          api(`${base}/entries/${s.id}/decision`, {
                            body: { approve, layerId },
                          }),
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="min-w-0">
            <Section
              title="Partners"
              action={
                !ended && (
                  <Button variant="primary" onClick={() => toggle("invite")}>
                    <Icon name="plus" size={15} /> Invite partner
                  </Button>
                )
              }
            >
              {panel === "invite" && <InviteForm d={d} onInvite={(body) => act(() => api(`${base}/members`, { body }))} />}
              {partners.length === 0 && <p className="text-sm text-muted">No partners yet. Invite the first one.</p>}
              <ul className="space-y-2.5">
                {partners.map((m, i) => (
                  <MemberCard key={m.id} m={m} solid={i === 0} roomEnd={d.room.expiresAt} onRevoke={ended ? undefined : () => revoke(m)} />
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Revoking stops all future access. What a partner's AI has already read cannot be taken back.
              </p>
            </Section>

            {team.length > 0 && (
              <Section title={`${d.room.owner} team`}>
                <ul className="space-y-2.5">
                  {team.map((m) => (
                    <MemberCard key={m.id} m={m} roomEnd={d.room.expiresAt} onRevoke={ended ? undefined : () => revoke(m)} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-line bg-sage-50 px-6 py-5 md:px-10">
        <h2 className="mb-2 text-sm font-bold">Audit log</h2>
        <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
          {d.audit.length === 0 && <li className="text-muted">No activity yet.</li>}
          {d.audit.map((a) => (
            <li key={a.id} className="flex gap-4">
              <span className="nums w-32 shrink-0 font-mono text-xs leading-5 text-muted">{fmtTime(a.at)}</span>
              <span className={a.action === "denied" ? "text-blocked" : "text-stone-700"}>
                {a.ai ? `${a.ai} (${companyOf(a.person) ?? firstName(a.person)})` : firstName(a.person)}{" "}
                {a.action === "denied" ? "blocked: not an allowed AI in this room" : a.detail}
              </span>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

function MemberCard({ m, solid = false, roomEnd, onRevoke }: { m: MemberInfo; solid?: boolean; roomEnd: string; onRevoke?: () => void }) {
  const active = m.status === "active";
  // Partners show as their company, the customer's own people by name.
  const title = m.isPartner ? m.company : m.name;
  const sub = m.isPartner ? `${m.name}, ${m.role}` : [m.title, m.role].filter(Boolean).join(", ");
  return (
    <li className={`flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3 ${active ? "" : "opacity-60"}`}>
      <Avatar name={title} solid={solid} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{title}</div>
        <div className="truncate text-xs text-muted">
          {sub}
          {active && m.accessUntil !== roomEnd && `, until ${fmtDay(m.accessUntil)}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {active ? <Chip>{m.ai}</Chip> : <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>}
        {active && onRevoke && (
          <button onClick={onRevoke} className="text-xs font-medium text-muted hover:text-blocked">
            Revoke
          </button>
        )}
      </div>
    </li>
  );
}

function Settings({ d, onSave }: { d: RoomDetail; onSave: (body: { name: string; expiresAt: string; allowedAis: string[] }) => void }) {
  const [name, setName] = useState(d.room.name);
  const [expiresAt, setExpiresAt] = useState(d.room.expiresAt);
  const [allowedAis, setAllowedAis] = useState(d.room.allowedAis);
  return (
    <form
      className={`${formPanel} flex flex-wrap items-end gap-6`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, expiresAt, allowedAis });
      }}
    >
      <Field label="Room name">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
      </Field>
      <Field label="Access ends on">
        <input className={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>
      <AiPicker value={allowedAis} onChange={setAllowedAis} />
      <Button variant="primary" type="submit">
        Save
      </Button>
    </form>
  );
}

function InviteForm({ d, onInvite }: { d: RoomDetail; onInvite: (body: Record<string, string>) => void }) {
  const [form, setForm] = useState({
    name: "",
    company: "",
    title: "",
    roleId: d.roles.at(-1)?.id ?? "",
    ai: d.room.allowedAis[0],
    accessUntil: d.room.expiresAt,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onInvite(form);
      }}
      className={`${formPanel} grid gap-3`}
    >
      <Field label="Name">
        <input className={input} value={form.name} onChange={set("name")} required />
      </Field>
      <Field label="Company">
        <input className={input} value={form.company} onChange={set("company")} required />
      </Field>
      <Field label="Job title (optional)">
        <input className={input} value={form.title} onChange={set("title")} />
      </Field>
      <Field label="Role">
        <select className={input} value={form.roleId} onChange={set("roleId")}>
          {d.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (sees {r.layerIds.map((id) => d.layers.find((l) => l.id === id)?.name).join(", ")})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Their AI">
        <select className={input} value={form.ai} onChange={set("ai")}>
          {d.room.allowedAis.map((ai) => (
            <option key={ai}>{ai}</option>
          ))}
        </select>
      </Field>
      <Field label="Access until">
        <input className={input} type="date" value={form.accessUntil} max={d.room.expiresAt} onChange={set("accessUntil")} />
      </Field>
      <div>
        <Button variant="primary" type="submit">
          Invite
        </Button>
        <span className="mt-2 block text-xs text-muted">
          The partner then finds their personal AI connection link in the partner portal.
        </span>
      </div>
    </form>
  );
}

function Suggestion({
  s,
  d,
  ai,
  onDecide,
}: {
  s: EntryInfo;
  d: RoomDetail;
  ai?: string;
  onDecide: (approve: boolean, layerId: string) => void;
}) {
  const [layerId, setLayerId] = useState(s.layerId);
  return (
    <div className="rounded-xl border border-line bg-sage-50 p-5">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Icon name="sparkle" size={16} className="text-bridge-900" />
        <span>
          {s.authorCompany}'s AI{ai ? ` (${ai})` : ""} suggests
        </span>
        <span className="ml-auto text-xs text-muted">
          {firstName(s.author)} · {fmtTime(s.createdAt)}
        </span>
      </p>
      <p className="mt-2 font-bold">{s.title}</p>
      <p className="mt-1 text-[15px] leading-relaxed">{s.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => onDecide(false, layerId)}>Reject</Button>
        <Button variant="primary" onClick={() => onDecide(true, layerId)}>
          Approve
        </Button>
        <span className="ml-2 text-xs text-muted">into</span>
        <select className={`${input} !w-auto`} value={layerId} onChange={(e) => setLayerId(e.target.value)} title="Layer">
          {d.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function EntryForm({ d, onAdd }: { d: RoomDetail; onAdd: (body: { layerId: string; title: string; body: string }) => void }) {
  const [layerId, setLayerId] = useState(d.layers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({ layerId, title, body });
      }}
      className={`${formPanel} grid gap-3 sm:grid-cols-[1fr_2fr]`}
    >
      <Field label="Layer">
        <select className={input} value={layerId} onChange={(e) => setLayerId(e.target.value)}>
          {d.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dress code" required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Knowledge (facts, rules, decisions)">
          <textarea className={input} rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
        </Field>
      </div>
      <div>
        <Button variant="primary" type="submit">
          Add to room
        </Button>
      </div>
    </form>
  );
}

function AddLayer({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
      }}
      className={`${formPanel} flex flex-wrap items-end gap-3`}
    >
      <div className="min-w-48 flex-1">
        <Field label="Layer name">
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Release notes"
            autoFocus
            required
          />
        </Field>
      </div>
      <Button variant="primary" type="submit">
        Add layer
      </Button>
      <p className="basis-full text-xs text-muted">
        A layer is a slice of the room. A matching role is created, so you can invite partners who see only this layer.
      </p>
    </form>
  );
}
