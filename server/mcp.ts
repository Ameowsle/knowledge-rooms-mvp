// Connector to the AIs: one MCP endpoint per person at /mcp/<token>.
// Every tool call goes through the same rules as the web app (server/access.ts).
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { get, type Person } from "./db";
import {
  activeGrants,
  aiDenied,
  contribute,
  describeLayers,
  detectAi,
  findGrant,
  logAccess,
  search,
  visibleEntries,
  type Grant,
} from "./access";
import { myContributions } from "./rooms";
import type { EntryView } from "../shared/types";

const INSTRUCTIONS = `You are connected to Knowledge Rooms: shared project knowledge from the companies this user works with.
Each room belongs to one company. The user only sees the layers their role allows.
When you use an entry, always name its source (person and company).
Never save anything to a room unless the user explicitly confirmed it ("Shall I save this to the room?").
Contributions from external partners are reviewed by the room owner before they become part of the room.`;

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

const formatEntries = (grant: Grant, entries: EntryView[]) =>
  entries
    .map((e) => `### ${e.title}\n[${e.layer}]\n${e.body}\nSource: ${e.source}, room "${grant.room.name}", ${e.date}`)
    .join("\n\n");

function buildServer(person: Person): McpServer {
  const server = new McpServer({ name: "knowledge-rooms", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  // The AI is detected from the MCP client name; unknown clients fall back to the AI set on the membership.
  const aiFor = (grant: Grant) => detectAi(server.server.getClientVersion()?.name) ?? grant.membership.ai;

  function open(roomRef: string, action: string): { grant: Grant; ai: string } | { error: string } {
    const grant = findGrant(person, roomRef);
    if (!grant) return { error: `No access to room "${roomRef}". Call list_rooms to see the rooms you can use.` };
    const ai = aiFor(grant);
    const denied = aiDenied(grant, ai);
    if (denied) {
      logAccess(grant.room.id, person.id, ai, "denied", `was denied (${action}): ${ai} is not allowed`);
      return { error: denied };
    }
    return { grant, ai };
  }

  server.registerTool(
    "list_rooms",
    {
      title: "List my rooms",
      description:
        "List the rooms this user can access: owner company, the user's role, the layers they can see and until when. Call this first.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const grants = activeGrants(person);
      if (grants.length === 0) return text("You currently have no active rooms.");
      return text(
        grants
          .map(
            (g) =>
              `- ${g.room.name} (id: ${g.room.id})\n  Owner: ${g.owner.name} | Role: ${g.role.name} | Access until: ${g.membership.access_until < g.room.expires_at ? g.membership.access_until : g.room.expires_at}\n  Layers you can see: ${describeLayers(g.layers)}`,
          )
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "search_room",
    {
      title: "Search a room",
      description:
        "Search the knowledge in one room. Returns only entries the user's role may see, each with its source.",
      inputSchema: {
        room: z.string().describe("Room id or exact room name from list_rooms"),
        query: z.string().describe("What to look for, e.g. 'nut allergy'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ room, query }) => {
      const o = open(room, "search");
      if ("error" in o) return text(o.error, true);
      const results = search(o.grant, query);
      logAccess(o.grant.room.id, person.id, o.ai, "search", `searched "${query}" (${results.length} result${results.length === 1 ? "" : "s"})`);
      if (results.length === 0) return text(`No matching entries. Use read_room to see everything you may see.`);
      return text(formatEntries(o.grant, results));
    },
  );

  server.registerTool(
    "read_room",
    {
      title: "Read a room",
      description:
        "Read all knowledge the user may see in a room, or only one layer. Use it to get the full project context.",
      inputSchema: {
        room: z.string().describe("Room id or exact room name from list_rooms"),
        layer: z.string().optional().describe("Optional layer name, e.g. 'Catering'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ room, layer }) => {
      const o = open(room, "read");
      if ("error" in o) return text(o.error, true);
      const entries = visibleEntries(o.grant, layer);
      const layers = layer ? o.grant.layers.filter((l) => l.name.toLowerCase() === layer.toLowerCase()) : o.grant.layers;
      if (layers.length === 0) return text(`You can only read these layers: ${describeLayers(o.grant.layers)}.`, true);
      logAccess(o.grant.room.id, person.id, o.ai, "read", `read ${describeLayers(layers)} (${entries.length} ${entries.length === 1 ? "entry" : "entries"})`);
      if (entries.length === 0) return text("No entries yet.");
      return text(formatEntries(o.grant, entries));
    },
  );

  server.registerTool(
    "save_to_room",
    {
      title: "Save to room",
      description:
        "Save new knowledge to a room. ONLY call this after you asked the user 'Shall I save this to the room?' and they confirmed. " +
        "If the user is an external partner, the room owner has to approve it before others see it.",
      inputSchema: {
        room: z.string().describe("Room id or exact room name from list_rooms"),
        title: z.string().min(3).max(120).describe("Short title, e.g. 'Adjusted menu, 12 nut-free dishes'"),
        content: z.string().min(3).max(10_000).describe("The knowledge itself, self-contained and factual"),
        layer: z
          .string()
          .optional()
          .describe("Layer to save to. Defaults to the most restricted layer the user can see."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ room, title, content, layer }) => {
      const o = open(room, "save");
      if ("error" in o) return text(o.error, true);
      const result = contribute(o.grant, { title, body: content, layer }, o.ai);
      if ("error" in result) return text(result.error, true);
      return text(
        result.entry.status === "approved"
          ? `Saved "${title}" to ${result.layer.name} in "${o.grant.room.name}".`
          : `Suggested "${title}" for ${result.layer.name}. ${o.grant.owner.name} has to approve it before it becomes part of the room.`,
      );
    },
  );

  server.registerTool(
    "my_suggestions",
    {
      title: "My suggestions",
      description: "Show the status (pending, approved, rejected) of knowledge this user saved or suggested.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const mine = myContributions(person);
      if (mine.length === 0) return text("You have not saved or suggested anything yet.");
      return text(mine.map((c) => `- ${c.title} | ${c.room} (${c.owner}) | ${c.layer} | ${c.status}`).join("\n"));
    },
  );

  return server;
}

// ---------------------------------------------------------------- transport

type Session = { transport: StreamableHTTPServerTransport; personId: string };
const sessions = new Map<string, Session>();

const rpcError = (message: string) => ({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

const personByToken = (token: string) => get<Person>("SELECT * FROM people WHERE token = ?", token);

export const mcpRouter = Router();

mcpRouter.post("/:token", async (req: Request<{ token: string }>, res: Response) => {
  const person = personByToken(req.params.token);
  if (!person) return void res.status(401).json(rpcError("Unknown connection link"));

  const sessionId = req.header("mcp-session-id");
  if (sessionId) {
    const session = sessions.get(sessionId);
    // 404 tells the client to start a new session (e.g. after a server restart).
    if (!session || session.personId !== person.id) return void res.status(404).json(rpcError("Session not found"));
    return void (await session.transport.handleRequest(req, res, req.body));
  }
  if (!isInitializeRequest(req.body)) return void res.status(400).json(rpcError("Initialize a session first"));

  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => void sessions.set(id, { transport, personId: person.id }),
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };
  await buildServer(person).connect(transport);
  await transport.handleRequest(req, res, req.body);
});

async function sessionRequest(req: Request<{ token: string }>, res: Response) {
  const person = personByToken(req.params.token);
  const session = sessions.get(req.header("mcp-session-id") ?? "");
  if (!person || !session || session.personId !== person.id) return void res.status(404).json(rpcError("Session not found"));
  await session.transport.handleRequest(req, res);
}

mcpRouter.get("/:token", sessionRequest);
mcpRouter.delete("/:token", sessionRequest);
