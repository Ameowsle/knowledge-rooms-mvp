import { Icon } from "./ui";

// Illustrative pricing page from the pitch deck. Nothing here is wired to billing.
const PLANS = [
  {
    name: "Small",
    tagline: "For a first partner project",
    price: "CHF 200",
    perRoom: "CHF 100 per room",
    features: ["2 project rooms", "Unlimited internal seats", "Unlimited partners, always free", "All features included"],
    cta: "Choose Small",
  },
  {
    name: "Main",
    tagline: "For several partner projects",
    price: "CHF 400",
    perRoom: "CHF 80 per room",
    features: ["5 project rooms", "Unlimited internal seats", "Unlimited partners, always free", "All features included"],
    cta: "Choose Main",
    featured: true,
  },
  {
    name: "Large",
    tagline: "For many agencies and freelancers",
    price: "CHF 650",
    perRoom: "CHF 65 per room",
    features: ["10 project rooms", "Unlimited internal seats", "Unlimited partners, always free", "All features included"],
    cta: "Choose Large",
  },
  {
    name: "Custom",
    tagline: "For several departments",
    price: "On request",
    perRoom: "Below CHF 65 per room",
    features: ["More than 10 project rooms", "Dedicated Swiss instance", "Service level agreement", "Unlimited partners, always free"],
    cta: "Contact us",
    custom: true,
  },
];

const INCLUDED = [
  "Allowed AI list",
  "Expiry dates",
  "Audit log",
  "SSO",
  "Data processing agreement",
  "Microsoft 365 and Confluence",
  "Swiss hosting",
];

export function Plans() {
  return (
    <div className="px-6 py-8 md:px-10">
      <h1 className="text-2xl font-bold">Plans and pricing</h1>
      <p className="mt-1 text-sm text-muted">Prices per month, billed annually. Unlimited internal seats; partners always join free.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`flex flex-col rounded-xl p-5 ${
              p.featured
                ? "border-2 border-bridge-900 bg-white"
                : p.custom
                  ? "border border-line bg-sage-50"
                  : "border border-line bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{p.name}</h2>
              {p.featured && <span className="rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-bold text-bridge-900">Most chosen</span>}
            </div>
            <p className="text-sm text-muted">{p.tagline}</p>
            <p className="mt-4 whitespace-nowrap">
              <span className="text-3xl font-bold tracking-tight text-bridge-900">{p.price}</span>
              {!p.custom && <span className="ml-2 text-sm text-muted">/ month</span>}
            </p>
            <p className="mt-1 text-sm text-muted">{p.perRoom}</p>
            <ul className="mt-4 flex-1 space-y-2 border-t border-line pt-4 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-bridge-900" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              disabled
              title="Illustrative, not connected to billing"
              className={`mt-5 w-full cursor-not-allowed rounded-lg border py-2 text-sm font-bold ${
                p.featured ? "border-bridge-900 bg-bridge-900 text-white" : "border-stone-300 bg-white text-ink"
              }`}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sage-50 px-5 py-4">
        <span className="mr-3 text-sm font-bold">Included in every plan</span>
        {INCLUDED.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs">
            <Icon name="check" size={13} className="text-bridge-900" />
            {f}
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Illustrative pricing page. Prices in CHF, excluding VAT. Not connected to billing in the MVP.
      </p>
    </div>
  );
}
