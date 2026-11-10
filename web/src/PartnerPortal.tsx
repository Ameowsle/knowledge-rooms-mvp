import { useCallback, useEffect, useState } from "react";
import type { EntryView, Portal } from "../../shared/types";
import { api } from "./api";
import { Badge, Button, ErrorNote, STATUS_TONE, fmtDay, input, Chip, Icon, Loading, toast } from "./ui";

const SETUPS: {
  name: string;
  where: string;
  snippet: (url: string) => string;
}[] = [
  {
    name: "Claude Code",
    where: "Run in your terminal",
    snippet: (url) => `claude mcp add --transport http knowledge-rooms ${url}`,
  },
  {
    name: "Claude Desktop",
    where: "claude_desktop_config.json",
    snippet: (url) =>
      JSON.stringify(
        {
          mcpServers: {
            "knowledge-rooms": { command: "npx", args: ["mcp-remote", url] },
          },
        },
        null,
        2,
      ),
  },
  {
    name: "Gemini CLI",
    where: "~/.gemini/settings.json",
    snippet: (url) => JSON.stringify({ mcpServers: { "knowledge-rooms": { httpUrl: url } } }, null, 2),
  },
  {
    name: "Cursor",
    where: "~/.cursor/mcp.json",
    snippet: (url) => JSON.stringify({ mcpServers: { "knowledge-rooms": { url } } }, null, 2),
  },
  {
    name: "Copilot (VS Code)",
    where: ".vscode/mcp.json",
    snippet: (url) => JSON.stringify({ servers: { "knowledge-rooms": { type: "http", url } } }, null, 2),
  },
  {
    name: "ChatGPT / claude.ai",
    where: "Settings → Connectors → add custom connector",
    snippet: (url) => `${url}\n\nWeb apps need a public HTTPS address: deploy the server\nor use a tunnel (e.g. ngrok) and set PUBLIC_URL.`,
  },
];

export function PartnerPortal() {
  const [p, setP] = useState<Portal | null>(null);
  const load = useCallback(() => api<Portal>("/my").then(setP), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!p) return <Loading />;
  const activeRooms = p.rooms.filter((r) => r.status === "active");

  return (
    <div className="min-h-screen bg-cream px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My rooms and AI</h1>
          <p className="mt-1 text-sm text-muted">The rooms you were invited to, and the link that connects your own AI.</p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${p.connectedAi ? "bg-sage-100 text-bridge-900" : "bg-stone-100 text-stone-600"}`}
        >
          <span className={`h-2 w-2 rounded-full ${p.connectedAi ? "bg-bridge-700" : "bg-stone-400"}`} />
          {p.connectedAi ? `${p.connectedAi} connected` : "No AI connected yet"}
        </span>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <Card title="My rooms">
            {p.rooms.length === 0 && <p className="text-sm text-muted">You have not been invited to a room yet.</p>}
            <ul className="divide-y divide-line">
              {p.rooms.map((r) => (
                <li key={r.roomId} className={`py-3.5 first:pt-0 last:pb-0 ${r.status === "active" ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <Icon name="folder" size={16} className="translate-y-0.5 text-bridge-900" />
                      <span className="font-bold">{r.room}</span>
                      <span className="truncate text-sm text-muted">{r.owner}</span>
                    </div>
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted">Your AI sees</span>
                    {r.layers.map((l) => (
                      <Chip key={l}>{l}</Chip>
                    ))}
                  </div>
                  <p className="nums mt-2 text-xs text-muted">
                    Role {r.role} · {r.ai} · access until {fmtDay(r.accessUntil)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Each room stays separate from the others.</p>
          </Card>

          <Card title="My suggestions">
            {p.contributions.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing yet. When your AI finds something new, it asks you whether to save it to the room.
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {p.contributions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="text-xs text-muted">
                        {c.room} · {c.layer}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status === "pending" ? "awaiting approval" : c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <a href="/api/my/export" className="mt-3 inline-block text-sm font-bold text-bridge-900 hover:underline">
              Export my contributions (JSON)
            </a>
          </Card>
        </div>

        <div className="space-y-6">
          <Connect p={p} />
          {activeRooms.length > 0 && <Preview rooms={activeRooms} />}
        </div>
      </div>
    </div>
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

function Connect({ p }: { p: Portal }) {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const setup = SETUPS[tab];
  const copy = () =>
    navigator.clipboard.writeText(p.mcpUrl).then(() => {
      toast("Link copied");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <Card title="Connect your AI">
      <p className="text-sm text-stone-600">Add your personal link to the AI you already use. No new app needed.</p>
      <div className="mt-3 flex gap-2">
        <input className={`${input} font-mono text-xs`} value={p.mcpUrl} readOnly onFocus={(e) => e.target.select()} />
        <Button onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
      </div>
      <p className="mt-1 text-xs text-muted">This link is personal. Anyone with it can read what you may read.</p>

      <div className="mt-4 flex flex-wrap gap-1">
        {SETUPS.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setTab(i)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${i === tab ? "bg-bridge-900 text-white" : "bg-sage-100 text-bridge-900 hover:bg-sage-200"}`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{setup.where}</p>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-[#1c2220] p-3 text-xs text-stone-100">{setup.snippet(p.mcpUrl)}</pre>
      <p className="mt-3 text-sm text-stone-600">
        Then ask your AI, e.g. <em>"Can I test with real customer data?"</em> It answers with the source from the room and asks before it
        saves anything.
      </p>
    </Card>
  );
}

function Preview({ rooms }: { rooms: Portal["rooms"] }) {
  const [roomId, setRoomId] = useState(rooms[0].roomId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResults(await api<EntryView[]>("/my/preview", { body: { roomId, query } }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card title="Preview: what your AI sees">
      <form onSubmit={run} className="flex flex-wrap gap-2">
        <select className={`${input} !w-auto`} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {rooms.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.owner} · {r.room}
            </option>
          ))}
        </select>
        <input
          className={`${input} min-w-40 flex-1`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, or leave empty for everything"
        />
        <Button type="submit">Show</Button>
      </form>
      <ErrorNote error={error} />
      {results && (
        <ul className="mt-4 space-y-2">
          {results.length === 0 && <li className="text-sm text-muted">No matching entries.</li>}
          {results.map((r) => (
            <li key={r.id} className="rounded-md border border-line p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-muted">{r.layer}</span>
              </div>
              <p className="mt-1 text-stone-600">{r.body}</p>
              <p className="mt-1 text-xs text-muted">Source: {r.source}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Previews are logged in the room's audit log like any AI read.</p>
    </Card>
  );
}
