import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const BUTTON = {
  primary: "border-bridge-900 bg-bridge-900 text-white hover:bg-bridge-700",
  secondary: "border-stone-300 bg-white text-ink hover:bg-sage-50",
  danger: "border-red-200 bg-white text-blocked hover:bg-red-50",
  ghost: "border-transparent text-muted hover:text-ink",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${BUTTON[variant]} ${className}`}
      {...props}
    />
  );
}

/** Bridge logo from the brand set in web/public/brand. `invert` is the white version for dark backgrounds. */
export function Logo({ invert = false, height = 28 }: { invert?: boolean; height?: number }) {
  return (
    <img
      src={invert ? "/brand/bridge-logo-white.svg" : "/brand/bridge-logo-color.svg"}
      alt="Bridge"
      height={height}
      style={{ height, width: "auto" }}
    />
  );
}

const ICONS = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  sparkle: <path d="M12 3c.6 4.6 3.4 7.4 9 9-5.6 1.600-8.400 4.400-9 9-.6-4.600-3.400-7.400-9-9 5.600-1.600 8.400-4.400 9-9Z" />,
  plug: (
    <>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8Z" />
      <path d="M12 17v4" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8L3 12Z" />
      <circle cx="7.500" cy="7.500" r="1.200" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h5l1.500 3h5L16 13h5" />
      <path d="M5 5h14l2 8v6H3v-6l2-8Z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.500" />
      <path d="M2.500 20a6.500 6.500 0 0 1 13 0" />
      <path d="M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.500a6 6 0 0 1 3.500 5.500" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.500 6h.010M3.500 12h.010M3.500 18h.010" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: <path d="M12 3 4.500 6v6c0 4.500 3.200 7.700 7.500 9 4.300-1.300 7.500-4.500 7.500-9V6L12 3Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4 12 5 5L20 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
};

export function Icon({ name, size = 18, className = "" }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** Round avatar with initials. `solid` is the dark green variant. */
export function Avatar({ name, solid = false, size = 36 }: { name: string; solid?: boolean; size?: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${solid ? "bg-bridge-900 text-white" : "bg-sage-100 text-bridge-900"}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  );
}

/** Pill label. `outline` for roles and AIs on cards, `soft` for the allowed AI list. */
export function Chip({ variant = "outline", children }: { variant?: "outline" | "soft"; children: ReactNode }) {
  const look = variant === "soft" ? "bg-sage-100 text-bridge-900" : "border border-stone-300 bg-white text-stone-700";
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${look}`}>{children}</span>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  green: "bg-sage-100 text-bridge-900 ring-sage-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-blocked ring-red-200",
  gray: "bg-stone-100 text-stone-600 ring-stone-200",
  blue: "bg-sage-100 text-bridge-900 ring-sage-200",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const STATUS_TONE = {
  active: "green",
  approved: "green",
  pending: "amber",
  revoked: "red",
  rejected: "gray",
  expired: "gray",
} as const;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
      {label}
      {children}
    </label>
  );
}

export const input =
  "w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-bridge-700 focus:outline-none focus:ring-2 focus:ring-sage-200";

/** Shared look for inline forms that open inside a section. */
export const formPanel = "mb-4 rounded-xl border border-sage-200 bg-sage-50 p-4";

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-blocked">{error}</p>;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "2026-11-30" → "30 Nov" (year only if it differs from today). */
export function fmtDay(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-GB", opts);
}

/** ISO timestamp → "Today 14:02" / "18 Oct 09:12". */
export function fmtTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  if (sameDay(d, now)) return `Today ${time}`;
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-GB", { month: "short", day: "numeric" })} ${time}`;
}

export const firstName = (name: string) => name.split(" ")[0];

/** Demo email for a person: "first.lastname@company.ch". People have no stored email in the MVP. */
export function emailOf(p: { name: string; company: string }) {
  const clean = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const local = clean(p.name).trim().split(/\s+/).join(".");
  const domain = clean(p.company)
    .replace(/\b(software|ag|gmbh|bank)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${local}@${domain}.ch`;
}

export type RoomDefaults = { allowedAis: string[]; days: number };
const DEFAULTS_KEY = "bridge.roomDefaults";

/** Defaults for new rooms, kept in this browser only. */
export function loadRoomDefaults(): RoomDefaults {
  const fallback: RoomDefaults = { allowedAis: ["Claude", "ChatGPT", "Copilot"], days: 60 };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

export function saveRoomDefaults(d: RoomDefaults) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
  } catch {
    // Private windows may block storage; the defaults then last for this visit only.
  }
}

/** Show a short confirmation at the bottom of the screen. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("bridge:toast", { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2600);
    };
    window.addEventListener("bridge:toast", show);
    return () => {
      window.removeEventListener("bridge:toast", show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {message && (
        <div
          key={message}
          className="rise-in flex items-center gap-2 rounded-full bg-bridge-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          <Icon name="check" size={15} />
          {message}
        </div>
      )}
    </div>
  );
}

/** Placeholder while a page loads. */
export function Loading() {
  return (
    <div className="animate-pulse space-y-4 px-6 py-8 md:px-10" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 rounded-md bg-sage-100" />
      <div className="h-4 w-80 max-w-full rounded-md bg-sage-100" />
      <div className="h-28 max-w-3xl rounded-xl bg-sage-50" />
      <div className="h-28 max-w-3xl rounded-xl bg-sage-50" />
    </div>
  );
}

/** Friendly message when a list has nothing in it. */
export function Empty({ icon, title, children }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col items-center rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-bridge-900">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 font-bold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}
