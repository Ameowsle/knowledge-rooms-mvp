import { useCallback, useEffect, useState } from "react";
import type { EntryInfo, RoomDetail } from "../../shared/types";
import { api } from "./api";
import { AiPicker } from "./AdminView";
import { Badge, Button, ErrorNote, Field, Section, STATUS_TONE, firstName, fmtDay, fmtTime, input } from "./ui";

export function RoomDetailView({ roomId, onChange }: { roomId: string; onChange: () => void }) {
  const [d, setD] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"settings" | "invite" | "entry" | null>(null);

  const load = useCallback(() => api<RoomDetail>(`/admin/rooms/${roomId}`).then(setD), [roomId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  /** Run a change, then reload the room and the sidebar. */
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      setPanel(null);
      await load();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!d) return <ErrorNote error={error} />;
  const base = `/admin/rooms/${roomId}`;
  const active = d.members.filter((m) => m.status === "active").length;
  const toggle = (p: typeof panel) => setPanel(panel === p ? null : p);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{d.room.name}</h1>
          <p className="mt-1 text-sm text-stone-500">
            Expires {fmtDay(d.room.expiresAt)} · {active} people · allowed AIs: {d.room.allowedAis.join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => toggle("settings")}>Settings</Button>
          <Button
            variant="danger"
            onClick={() =>
              confirm(`End the project and revoke access for all partners? ${d.room.owner} keeps all approved knowledge.`) &&
              act(() => api(`${base}/end`, { method: "POST" }))
            }
          >
            End project
          </Button>
        </div>
      </div>
      <ErrorNote error={error} />

      {panel === "settings" && <Settings d={d} onSave={(body) => act(() => api(base, { method: "PATCH", body }))} />}

      <Section title="People in the room" action={<Button variant="primary" onClick={() => toggle("invite")}>+ Invite partner</Button>}>
        {panel === "invite" && <InviteForm d={d} onInvite={(body) => act(() => api(`${base}/members`, { body }))} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                {["Person", "Company", "Role", "AI", "Access until", "Status", ""].map((h) => (
                  <th key={h} className="border-b border-stone-200 py-2 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.id} className="border-b border-stone-100">
                  <td className="py-2 pr-3">
                    {m.name}
                    {m.title && <span className="text-stone-400">, {m.title}</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={m.isPartner ? "" : "text-owner"}>{m.company}</span>
                  </td>
                  <td className="py-2 pr-3">{m.role}</td>
                  <td className="py-2 pr-3">{m.ai}</td>
                  <td className="py-2 pr-3">{fmtDay(m.accessUntil)}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                  </td>
                  <td className="py-2 text-right">
                    {m.status === "active" && (
                      <Button variant="ghost" onClick={() => act(() => api(`${base}/members/${m.id}/revoke`, { method: "POST" }))}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          Revoking stops all future access. What a partner's AI has already read cannot be taken back.
        </p>
      </Section>

      <Section title={`Suggestions to approve (${d.suggestions.length})`}>
        {d.suggestions.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing to review. Partner suggestions from their AIs show up here.</p>
        ) : (
          <div className="space-y-3">
            {d.suggestions.map((s) => (
              <Suggestion
                key={s.id}
                s={s}
                d={d}
                onDecide={(approve, layerId) =>
                  act(() => api(`${base}/entries/${s.id}/decision`, { body: { approve, layerId } }))
                }
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Knowledge"
        action={
          <div className="flex gap-2">
            <AddLayer onAdd={(name) => act(() => api(`${base}/layers`, { body: { name } }))} />
            <Button onClick={() => toggle("entry")}>+ Add entry</Button>
          </div>
        }
      >
        {panel === "entry" && <EntryForm d={d} onAdd={(body) => act(() => api(`${base}/entries`, { body }))} />}
        <div className="space-y-4">
          {d.layers.map((layer) => {
            const entries = d.entries.filter((e) => e.layerId === layer.id);
            return (
              <div key={layer.id} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{layer.name}</h3>
                  <span className="text-xs text-stone-500">seen by roles: {layer.seenBy.join(", ")}</span>
                </div>
                {entries.length === 0 ? (
                  <p className="mt-2 text-sm text-stone-400">No entries yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {entries.map((e) => (
                      <li key={e.id} className="rounded-md bg-white p-3 text-sm ring-1 ring-stone-200">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{e.title}</span>
                          <span className="text-xs text-stone-400">
                            {e.author} · {e.authorCompany}
                          </span>
                        </div>
                        <p className="mt-1 text-stone-600">{e.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Audit log">
        <ul className="space-y-1 text-sm">
          {d.audit.map((a) => (
            <li key={a.id} className="flex gap-4">
              <span className="w-32 shrink-0 text-stone-400">{fmtTime(a.at)}</span>
              <span className={a.action === "denied" ? "text-red-700" : "text-stone-700"}>
                {a.ai ? `${a.ai} (${firstName(a.person)})` : firstName(a.person)} {a.detail}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Settings({ d, onSave }: { d: RoomDetail; onSave: (body: { expiresAt: string; allowedAis: string[] }) => void }) {
  const [expiresAt, setExpiresAt] = useState(d.room.expiresAt);
  const [allowedAis, setAllowedAis] = useState(d.room.allowedAis);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <Field label="Access ends on">
        <input className={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>
      <AiPicker value={allowedAis} onChange={setAllowedAis} />
      <Button variant="primary" onClick={() => onSave({ expiresAt, allowedAis })}>
        Save
      </Button>
    </div>
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
      className="mb-4 grid gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 sm:grid-cols-3"
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
      <div className="sm:col-span-3">
        <Button variant="primary" type="submit">
          Invite
        </Button>
        <span className="ml-3 text-xs text-stone-500">
          The partner then finds their personal AI connection link in the partner portal.
        </span>
      </div>
    </form>
  );
}

function Suggestion({ s, d, onDecide }: { s: EntryInfo; d: RoomDetail; onDecide: (approve: boolean, layerId: string) => void }) {
  const [layerId, setLayerId] = useState(s.layerId);
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <p className="text-sm">
        <span className="font-medium">{firstName(s.author)}</span>
        <span className="text-stone-400"> ({s.authorCompany}) · {fmtTime(s.createdAt)}</span>
      </p>
      <p className="mt-1 font-medium">{s.title}</p>
      <p className="mt-1 text-sm text-stone-600">{s.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500">Approve into</span>
          <select className={`${input} w-auto`} value={layerId} onChange={(e) => setLayerId(e.target.value)} title="Layer">
            {d.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => onDecide(true, layerId)}>
            Approve
          </Button>
        <Button onClick={() => onDecide(false, layerId)}>Reject</Button>
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
      className="mb-4 grid gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 sm:grid-cols-[1fr_2fr]"
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
        setName("");
      }}
      className="flex gap-2"
    >
      <input className={`${input} w-36`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New layer" required />
      <Button type="submit">+ Layer</Button>
    </form>
  );
}
