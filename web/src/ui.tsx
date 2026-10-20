import type { ButtonHTMLAttributes, ReactNode } from "react";

const BUTTON = {
  primary: "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
  secondary: "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "border-transparent text-stone-500 hover:text-stone-900",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${BUTTON[variant]} ${className}`}
      {...props}
    />
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-stone-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  gray: "bg-stone-100 text-stone-600 ring-stone-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
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
  "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "2026-11-30" → "Nov 30" (year only if it differs from today). */
export function fmtDay(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** ISO timestamp → "Today 14:02" / "Oct 18 09:12". */
export function fmtTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (sameDay(d, now)) return `Today ${time}`;
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

export const firstName = (name: string) => name.split(" ")[0];
