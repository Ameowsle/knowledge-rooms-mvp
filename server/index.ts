import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { api, publicUrl } from "./api";
import { mcpRouter } from "./mcp";
import { isEmpty, resetAndSeed } from "./seed";

if (isEmpty()) resetAndSeed();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", api);
app.use("/mcp", mcpRouter);

// In production the built web app is served from the same server.
const dist = path.join(process.cwd(), "dist");
if (existsSync(dist)) app.use(express.static(dist));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API and MCP server on http://localhost:${port}`);
  console.log(`MCP links look like ${publicUrl()}/mcp/<token> (see the partner portal)`);
});
