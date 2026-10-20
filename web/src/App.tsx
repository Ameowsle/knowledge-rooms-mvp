import { useEffect, useState } from "react";
import type { Me, PersonOption } from "../../shared/types";
import { api } from "./api";
import { AdminView } from "./AdminView";
import { PartnerPortal } from "./PartnerPortal";
import { Button } from "./ui";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [view, setView] = useState<"admin" | "portal">("admin");

  useEffect(() => {
    api<Me>("/me").then(setMe, () => setMe(null));
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login onLogin={setMe} />;

  const mode = me.isAdmin ? view : "portal";
  const logout = () => api("/logout", { method: "POST" }).then(() => setMe(null));

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">
              Knowledge Rooms <span className="font-normal text-stone-400">· {mode === "admin" ? me.company : "Partner"}</span>
            </span>
            {me.isAdmin && (
              <nav className="flex gap-1 text-sm">
                {(["admin", "portal"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1 ${view === v ? "bg-stone-100 font-medium" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    {v === "admin" ? "Manage rooms" : "My rooms & AI"}
                  </button>
                ))}
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-600">
              {me.name}
              {me.title && <span className="text-stone-400">, {me.title}</span>} <span className="text-stone-400">({me.company})</span>
            </span>
            <Button variant="ghost" onClick={logout}>
              Switch person
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{mode === "admin" ? <AdminView /> : <PartnerPortal />}</main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  useEffect(() => {
    api<PersonOption[]>("/people").then(setPeople);
  }, []);

  const companies = [...new Set(people.map((p) => p.company))];
  const login = (id: string) => api<Me>("/login", { body: { personId: id } }).then(onLogin);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Knowledge Rooms</h1>
        <p className="mt-2 text-stone-600">Your knowledge. Their AI. Your control.</p>
        <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Demo login: pick a person to see the product from their side. The MVP has no passwords, so do not enter real data.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {companies.map((company) => (
            <div key={company} className="rounded-lg border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-500">{company}</h2>
              <ul className="mt-2 space-y-1">
                {people
                  .filter((p) => p.company === company)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => login(p.id)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-stone-50"
                      >
                        <span>
                          {p.name} <span className="text-stone-400">{p.title}</span>
                        </span>
                        {p.isAdmin && <span className="text-xs text-owner">admin</span>}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
