import { useCallback, useEffect, useState } from "react";
import { AIS, type RoomSummary } from "../../shared/types";
import { api } from "./api";
import { RoomDetailView } from "./RoomDetail";
import { Button, ErrorNote, Field, fmtDay, input } from "./ui";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function AdminView() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () =>
      api<RoomSummary[]>("/admin/rooms").then((list) => {
        setRooms(list);
        setSelected((s) => s ?? list[0]?.id ?? null);
      }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Rooms</h2>
        <ul className="space-y-1">
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  setSelected(r.id);
                  setCreating(false);
                }}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  selected === r.id && !creating
                    ? "border-blue-300 bg-blue-50"
                    : "border-transparent hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.pending > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{r.pending}</span>
                  )}
                </div>
                <div className="text-xs text-stone-500">
                  {r.members} people · until {fmtDay(r.expiresAt)}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <Button className="mt-3 w-full" onClick={() => setCreating(true)}>
          + New room
        </Button>
      </aside>

      <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-6">
        {creating ? (
          <NewRoom
            onCreated={(id) => {
              setCreating(false);
              setSelected(id);
              load();
            }}
          />
        ) : selected ? (
          <RoomDetailView key={selected} roomId={selected} onChange={load} />
        ) : (
          <p className="text-stone-500">No rooms yet. Create one for your first project with partners.</p>
        )}
      </div>
    </div>
  );
}

function NewRoom({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(inDays(60));
  const [allowed, setAllowed] = useState<string[]>(["Claude", "ChatGPT", "Copilot"]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/admin/rooms", { body: { name, expiresAt, allowedAis: allowed } });
      onCreated(id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">New room</h1>
      <p className="text-sm text-stone-500">
        One room per project with external partners. It starts with two layers: "Everyone in the room" and "Project
        leads only". You can add more, e.g. "Catering".
      </p>
      <Field label="Project name">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer event" required />
      </Field>
      <Field label="Access ends on">
        <input className={input} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
      </Field>
      <AiPicker value={allowed} onChange={setAllowed} />
      <Button variant="primary" type="submit">
        Create room
      </Button>
      <ErrorNote error={error} />
    </form>
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
