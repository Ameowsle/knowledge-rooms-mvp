# Knowledge Rooms (MVP)

**Your knowledge. Their AI. Your control.**

The controlled channel between a company and the AIs of its external partners, in both directions:

1. **Share:** the company puts project knowledge into a room. Roles decide which layers each partner's AI can see.
2. **Pull back:** partners build on it with their own AI (Claude, ChatGPT, Gemini, Copilot, Cursor). New knowledge is suggested to the room and belongs to the company after approval.
3. **Control:** allowed AIs, expiry dates, one click revocation and an audit log of which AI read what.

"Knowledge Rooms" is a working title. The demo data is the Berger AG example from our product doc; all names are made up.

## Quick start

Requires Node.js 22.13 or newer (uses the built in `node:sqlite`).

```bash
npm install
npm run dev
```

* Web app: http://localhost:5173
* API and MCP server: http://localhost:3001

Demo data is created on first start. `npm run reset` restores it.

## Demo in five minutes

1. Open the web app and log in as **Petra Meier (Berger AG)**. Room "100th Anniversary": people and roles, suggestions to approve, knowledge by layer, audit log.
2. Switch to **Ben Huber (Huber Catering)**. The partner portal shows his rooms (Berger AG and Keller family, kept separate) and his personal MCP link.
3. Connect an AI, e.g. Claude Code:
   ```bash
   claude mcp add --transport http knowledge-rooms http://localhost:3001/mcp/<Ben's token>
   ```
4. Ask: *"How many nut-free meals do I need for the Berger anniversary?"* The AI answers 12, with Petra as the source. Ask about the budget: Ben's AI cannot see it.
5. Say: *"Save the adjusted dessert plan to the room."* The AI asks first, then creates a suggestion.
6. Back as Petra: approve it (optionally into another layer), see the reads in the audit log, then **End project**. Ben's AI loses access immediately.

No AI at hand? Use **Preview: what your AI sees** in the partner portal; it runs the same access rules.

## What the MVP covers

| Part (from the product doc) | In the MVP |
|---|---|
| Web app (UI) | Rooms, layers, roles, invite partner, allowed AIs, expiry, revoke, end project, approve or reject suggestions, audit log; partner portal with rooms, suggestion status, connection setup, preview and export |
| Connectors to the AIs | MCP server (Streamable HTTP), one personal link per person, tools `list_rooms`, `search_room`, `read_room`, `save_to_room`, `my_suggestions` |
| Context store | SQLite with entries, roles, approvals and audit log; keyword search |
| Source connections | Not yet |

Not yet built: real login (the MVP has a demo person switcher), Notion/Confluence/Drive/Frontify sources, vector search, browser extension for web chats, OAuth for MCP, hosting in Switzerland or the EU.

## Project structure

```
server/
  access.ts      core rules: who and which AI may read what, suggestions, audit
  rooms.ts       admin operations and read models for the web app
  mcp.ts         MCP connector for the AIs (/mcp/<token>)
  api.ts         JSON API for the web app (/api)
  db.ts          SQLite schema and helpers
  seed.ts        Berger AG demo data
  access.test.ts tests for the rules
shared/types.ts  payload types used by server and web app
web/src/         React web app (admin view and partner portal)
docs/architecture.md
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API, MCP and web app with reload |
| `npm test` | Tests for the access rules |
| `npm run typecheck` | TypeScript check |
| `npm run build` then `npm start` | Production build, served by one server on port 3001 |
| `npm run reset` | Reset the database to the demo data |

Set `PUBLIC_URL` (see `.env.example`) when the server runs anywhere but localhost, so the MCP links point to the right address. ChatGPT and claude.ai need a public HTTPS address (deployment or a tunnel such as ngrok).

See [docs/architecture.md](docs/architecture.md) for the design and next steps.
