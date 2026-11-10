import { useState } from "react";
import { AIS } from "../../shared/types";
import { api } from "./api";
import { Button, ErrorNote, Field, input, loadRoomDefaults } from "./ui";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function NewRoom({ onCreated }: { onCreated: (id: string) => void }) {
  const [defaults] = useState(loadRoomDefaults);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(inDays(defaults.days));
  const [allowed, setAllowed] = useState<string[]>(defaults.allowedAis);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/admin/rooms", {
        body: { name, expiresAt, allowedAis: allowed },
      });
      onCreated(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const steps = [
    ["Add layers by role", "Split the room, for example Development standards, Design rules and Customer data."],
    ["Invite partners", "Each partner gets one personal link for the AI they already use."],
    ["Stay in control", "Approve what their AIs suggest and see every read in the audit log."],
  ];

  return (
    <div className="grid max-w-4xl gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New room</h1>
          <p className="mt-1 text-sm text-muted">One room per project with external partners.</p>
        </div>
        <div className="space-y-5 rounded-xl border border-line bg-white p-5">
          <Field label="Project name">
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer portal"
              autoFocus
              required
            />
          </Field>
          <Field label="Access ends on">
            <input className={`${input} !w-48`} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
          </Field>
          <AiPicker value={allowed} onChange={setAllowed} />
        </div>
        <Button variant="primary" type="submit">
          Create room
        </Button>
        <ErrorNote error={error} />
      </form>

      <aside className="rounded-xl bg-sage-50 p-5 lg:mt-[4.25rem]">
        <h2 className="text-sm font-bold">What happens next</h2>
        <ol className="mt-3 space-y-4">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bridge-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm">
                <span className="block font-bold">{title}</span>
                <span className="text-stone-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">A new room starts with the layers "Everyone in the room" and "Project leads only".</p>
      </aside>
    </div>
  );
}

export function AiPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-stone-600">Allowed AIs</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {AIS.map((ai) => (
          <label key={ai} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="accent-bridge-900"
              checked={value.includes(ai)}
              onChange={(e) => onChange(e.target.checked ? [...value, ai] : value.filter((a) => a !== ai))}
            />
            {ai}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
