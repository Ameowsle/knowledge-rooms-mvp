// Payloads shared by the API (server/api.ts) and the web app (web/src).

export const AIS = ["Claude", "ChatGPT", "Gemini", "Copilot", "Cursor"] as const;

export type MemberStatus = "active" | "revoked" | "expired";
export type EntryStatus = "approved" | "pending" | "rejected";

export type Me = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  isAdmin: boolean;
};

export type PersonOption = Me;

export type RoomSummary = {
  id: string;
  name: string;
  expiresAt: string;
  members: number;
  pending: number;
};

export type LayerInfo = { id: string; name: string; seenBy: string[] };
export type RoleInfo = { id: string; name: string; layerIds: string[] };

export type MemberInfo = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  isPartner: boolean;
  roleId: string;
  role: string;
  ai: string;
  accessUntil: string;
  status: MemberStatus;
};

export type EntryInfo = {
  id: string;
  title: string;
  body: string;
  layerId: string;
  layer: string;
  author: string;
  authorCompany: string;
  createdAt: string;
};

export type AuditInfo = {
  id: number;
  at: string;
  ai: string | null;
  person: string;
  action: string;
  detail: string;
};

export type RoomDetail = {
  room: { id: string; name: string; expiresAt: string; allowedAis: string[]; owner: string };
  layers: LayerInfo[];
  roles: RoleInfo[];
  members: MemberInfo[];
  entries: EntryInfo[];
  suggestions: EntryInfo[];
  audit: AuditInfo[];
};

export type MyRoom = {
  roomId: string;
  room: string;
  owner: string;
  role: string;
  layers: string[];
  ai: string;
  accessUntil: string;
  status: MemberStatus;
};

export type MyContribution = {
  id: string;
  title: string;
  room: string;
  layer: string;
  status: EntryStatus;
  createdAt: string;
};

export type Portal = {
  mcpUrl: string;
  connectedAi: string | null;
  rooms: MyRoom[];
  contributions: MyContribution[];
};

/** One knowledge entry as an AI (or the portal preview) receives it. */
export type EntryView = {
  id: string;
  title: string;
  body: string;
  layer: string;
  source: string;
  date: string;
};
