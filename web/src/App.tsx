import { useCallback, useEffect, useRef, useState } from "react";
import type { Me, PersonOption, RoomSummary } from "../../shared/types";
import { api } from "./api";
import { NewRoom } from "./AdminView";
import { PartnerPortal } from "./PartnerPortal";
import { Plans } from "./Plans";
import { RoomDetailView } from "./RoomDetail";
import { Approvals, AuditLog, Overview, Partners, Settings } from "./Workspace";
import { Avatar, Button, ErrorNote, Field, Icon, Logo, Toaster, emailOf, input } from "./ui";

type View = "overview" | "rooms" | "new" | "approvals" | "partners" | "audit" | "portal" | "settings" | "plans";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api<Me>("/me").then(setMe, () => setMe(null));
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login onLogin={setMe} />;
  return <Shell key={me.id} me={me} onLogout={() => api("/logout", { method: "POST" }).then(() => setMe(null))} />;
}

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [view, setViewRaw] = useState<View>(me.isAdmin ? "overview" : "portal");
  // Navigating closes the mobile menu.
  const setView = (v: View) => {
    setViewRaw(v);
    setMenu(false);
  };

  const load = useCallback(() => {
    if (!me.isAdmin) return Promise.resolve();
    return api<RoomSummary[]>("/admin/rooms").then((list) => {
      setRooms(list);
      // Keep the open room if it still exists, otherwise fall back to the first running one.
      setSelected((s) => (s && list.some((r) => r.id === s) ? s : ((list.find((r) => !r.endedAt) ?? list[0])?.id ?? null)));
    });
  }, [me.isAdmin]);
  useEffect(() => {
    load();
  }, [load]);

  const openRoom = (id: string) => {
    setSelected(id);
    setView("rooms");
  };
  const pending = rooms.reduce((n, r) => n + r.pending, 0);
  const pages = { rooms, onOpenRoom: openRoom, onChange: load };

  const navItem = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
      active ? "bg-sage-100 font-bold text-bridge-900" : "text-stone-700 hover:bg-sage-100/60"
    }`;
  const heading = "mb-1.5 px-3 text-[11px] font-bold uppercase tracking-widest text-muted";
  const count = (n: number) => n > 0 && <span className="rounded-full bg-bridge-900 px-1.5 text-[11px] font-bold text-white">{n}</span>;

  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-sage-50 p-4 sticky top-0 z-30 max-h-screen overflow-y-auto md:h-screen md:w-64 md:overflow-visible md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-2 py-2">
          <Logo height={26} />
          <button
            className="rounded-lg p-1.5 text-bridge-900 hover:bg-sage-100 md:hidden"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-controls="main-nav"
            aria-label={menu ? "Close menu" : "Open menu"}
          >
            <Icon name={menu ? "close" : "menu"} size={22} />
          </button>
        </div>

        <nav id="main-nav" className={`mt-5 flex-1 space-y-6 overflow-y-auto md:block ${menu ? "block" : "hidden"}`}>
          {me.isAdmin && (
            <>
              <div>
                <h2 className={heading}>Workspace</h2>
                <button className={navItem(view === "overview")} onClick={() => setView("overview")}>
                  <Icon name="home" /> Overview
                </button>
                <button className={navItem(view === "approvals")} onClick={() => setView("approvals")}>
                  <Icon name="inbox" />
                  <span className="flex-1">Approvals</span>
                  {count(pending)}
                </button>
                <button className={navItem(view === "partners")} onClick={() => setView("partners")}>
                  <Icon name="users" /> Partners
                </button>
                <button className={navItem(view === "audit")} onClick={() => setView("audit")}>
                  <Icon name="list" /> Audit log
                </button>
              </div>

              <div>
                <h2 className={heading}>Rooms</h2>
                <ul className="space-y-0.5">
                  {rooms
                    .filter((r) => !r.endedAt)
                    .map((r) => (
                      <li key={r.id}>
                        <button className={navItem(view === "rooms" && selected === r.id)} onClick={() => openRoom(r.id)}>
                          <Icon name="folder" />
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {count(r.pending)}
                        </button>
                      </li>
                    ))}
                </ul>
                <button className={`${navItem(view === "new")} mt-1 text-muted`} onClick={() => setView("new")}>
                  <Icon name="plus" /> New room
                </button>
              </div>

              {rooms.some((r) => r.endedAt) && (
                <div>
                  <h2 className={heading}>Ended</h2>
                  <ul className="space-y-0.5">
                    {rooms
                      .filter((r) => r.endedAt)
                      .map((r) => (
                        <li key={r.id}>
                          <button className={`${navItem(view === "rooms" && selected === r.id)} text-muted`} onClick={() => openRoom(r.id)}>
                            <Icon name="lock" />
                            <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div>
            <h2 className={heading}>{me.isAdmin ? "You" : "Partner"}</h2>
            <button className={navItem(view === "portal")} onClick={() => setView("portal")}>
              <Icon name="plug" /> My rooms and AI
            </button>
            {me.isAdmin && (
              <button className={navItem(view === "plans")} onClick={() => setView("plans")}>
                <Icon name="tag" /> Plans and pricing
              </button>
            )}
          </div>
        </nav>

        <div className={`mt-4 border-t border-line pt-3 md:block ${menu ? "block" : "hidden"}`}>
          <button className={navItem(view === "settings")} onClick={() => setView("settings")}>
            <Icon name="gear" /> Settings
          </button>
          <div className="mt-2 flex items-center gap-3 px-2">
            <Avatar name={me.name} solid />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{me.name}</div>
              <div className="truncate text-xs text-muted">{[me.title, me.company].filter(Boolean).join(", ")}</div>
            </div>
            <button onClick={onLogout} className="text-xs font-medium text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {view === "portal" ? (
          <PartnerPortal />
        ) : view === "plans" ? (
          <Plans />
        ) : view === "settings" ? (
          <Settings me={me} rooms={rooms} onPlans={() => setView("plans")} />
        ) : view === "overview" ? (
          <Overview {...pages} me={me} onNav={setView} />
        ) : view === "approvals" ? (
          <Approvals {...pages} />
        ) : view === "partners" ? (
          <Partners {...pages} />
        ) : view === "audit" ? (
          <AuditLog {...pages} />
        ) : view === "new" ? (
          <div className="px-6 py-8 md:px-10">
            <NewRoom
              onCreated={(id) => {
                openRoom(id);
                load();
              }}
            />
          </div>
        ) : selected ? (
          <RoomDetailView
            key={selected}
            roomId={selected}
            onChange={load}
            onDeleted={() => {
              setSelected(null);
              setView("overview");
              load();
            }}
          />
        ) : (
          <p className="px-10 py-8 text-muted">No rooms yet. Create one for your first project with partners.</p>
        )}
      </main>
      <Toaster />
    </div>
  );
}

/** A random demo password. The MVP does not check passwords yet. */
function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(14)), (n) => chars[n % chars.length]).join("");
}

function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    api<PersonOption[]>("/people").then((list) => {
      setPeople(list);
      // Prefill the first company account, the buyer side of Bridge.
      const first = list.find((p) => p.isAdmin) ?? list[0];
      if (first) setEmail(emailOf(first));
    });
  }, []);

  const customers = new Set(people.filter((p) => p.isAdmin).map((p) => p.company));
  const company = people.filter((p) => customers.has(p.company));
  const partners = people.filter((p) => !customers.has(p.company));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const person = people.find((p) => emailOf(p) === email.trim().toLowerCase());
    if (!person) return setError("No account with this email.");
    if (!password) return setError("Enter a password.");
    try {
      onLogin(await api<Me>("/login", { body: { personId: person.id } }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-12 bg-bridge-900 px-8 py-10 text-white lg:px-14 lg:py-14">
        <Logo invert height={38} />
        <h1 className="text-5xl font-bold leading-[1.02] tracking-tight lg:text-7xl">
          Shared, not
          <br />
          exposed
        </h1>
        <p className="text-sm text-sage-400">Your knowledge. Their AI. Your rules.</p>
      </div>

      <div className="relative flex min-h-screen flex-col bg-cream px-6 pb-5 pt-16 lg:px-12">
        <DemoPicker
          company={company}
          partners={partners}
          current={email}
          onPick={(p) => {
            setEmail(emailOf(p));
            setPassword(randomPassword());
            setError(null);
            setNote(null);
          }}
        />
        <div className="flex flex-1 items-center justify-center">
          <form onSubmit={submit} className="w-full max-w-sm">
            <h2 className="text-3xl font-bold tracking-tight">Sign in to Bridge</h2>
            <p className="mt-2 text-sm text-muted">Use your work account.</p>

            <div className="mt-7 space-y-4">
              <Field label="Work email">
                <input
                  className={`${input} !py-2.5`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="first.lastname@company.ch"
                  autoComplete="username"
                  required
                />
              </Field>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-xs font-medium text-stone-600">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-xs font-medium text-bridge-900 hover:underline"
                    onClick={() => setNote("Password reset is not available in the prototype.")}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    className={`${input} !py-2.5 pr-16`}
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-ink"
                    aria-pressed={show}
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" className="accent-bridge-900" defaultChecked /> Keep me signed in
              </label>
            </div>
            <ErrorNote error={error} />

            <Button variant="primary" type="submit" className="mt-5 w-full !py-2.5">
              Sign in
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <Button
              type="button"
              className="w-full !py-2.5"
              onClick={() => setNote("Single sign on is planned and not available in the prototype.")}
            >
              Continue with single sign on
            </Button>
            {note && <p className="mt-3 rounded-lg bg-sage-100 px-3 py-2 text-sm text-bridge-900">{note}</p>}

            <p className="mt-8 text-sm text-muted">Invited as a partner? Open the link in your invite email.</p>
          </form>
        </div>
        <footer className="mx-auto mt-10 w-full max-w-2xl">
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4 text-xs text-muted">
            <span>© 2026 Bridge · St. Gallen, Switzerland</span>
            <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legal">
              {["Privacy", "Terms", "Security", "Contact"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className="hover:text-ink hover:underline"
                  onClick={() => setNote(`${item}: this page is not part of the prototype yet.`)}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Collapsible list of demo accounts in the top right corner of the sign in page. */
function DemoPicker({
  company,
  partners,
  current,
  onPick,
}: {
  company: PersonOption[];
  partners: PersonOption[];
  current: string;
  onPick: (p: PersonOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const group = (label: string, people: PersonOption[]) => (
    <div>
      <h3 className="px-2 pb-1 pt-2 text-xs font-bold text-muted">{label}</h3>
      <ul>
        {people.map((p) => {
          const active = emailOf(p) === current;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${active ? "bg-sage-100" : "hover:bg-sage-50"}`}
              >
                <Avatar name={p.name} solid={p.isAdmin} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{[p.title, p.company].filter(Boolean).join(", ")}</span>
                </span>
                {active && <Icon name="check" size={15} className="text-bridge-900" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div ref={box} className="absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="demo-accounts"
        className="ml-auto flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-3 pr-2.5 text-sm font-bold text-bridge-900 shadow-sm transition-colors hover:border-sage-400"
      >
        <span className="h-2 w-2 rounded-full bg-sage-400" />
        Demo accounts
        <Icon name="chevron" size={15} className={`transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <div
          id="demo-accounts"
          className="pop-in absolute right-0 mt-2 max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-[0_12px_32px_-8px_rgb(14_59_46/0.25)]"
        >
          {group("Company", company)}
          {group("Invited partner", partners)}
          <p className="border-t border-line px-2 pb-1 pt-2 text-xs text-muted">
            Fills in the form. Passwords are not checked in the prototype.
          </p>
        </div>
      )}
    </div>
  );
}
