"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/app/components/app-sidebar";
import styles from "./catalogue-rate-admin.module.css";

type Side = "TO_CLIENT" | "TO_VENDOR";
type Scope = "GLOBAL" | "CITY";
type Price = {
  id: string;
  amountPaise: number;
  effectiveFrom: string | null;
  sourceImport: { filename: string } | null;
};
type DurationPolicy = {
  id: string;
  code: string;
  name: string;
  mode: string;
  chargeMultiplierNumerator: number;
  chargeMultiplierDenominator: number;
  minimumChargeNumerator: number;
  minimumChargeDenominator: number;
  roundingMode: string;
  active: boolean;
  authority: string;
  description: string | null;
  points?: Array<{ usageDays: number; chargeUnitsNumerator: number; chargeUnitsDenominator: number }>;
  _count?: { offerings: number };
};
type Offering = {
  id: string;
  code: string;
  name: string;
  kind: string | null;
  quantityBasis: string | null;
  pricingFamily: string | null;
  billingUnit: string;
  durationBasis: string | null;
  durationPolicy: DurationPolicy | null;
  active: boolean;
  completeness: string;
  canonicalItem: {
    code: string;
    name: string;
    domain: string;
    entityType: string | null;
  } | null;
  rates: Record<Side, Price | null>;
};
type Market = {
  id: string;
  code: string;
  cityName: string;
  state: string | null;
  country: string;
  active: boolean;
};
type History = {
  prices: Array<
    Price & {
      side: Side;
      scopeType: Scope;
      active: boolean;
      effectiveTo: string | null;
      market: Market | null;
    }
  >;
  events: Array<{
    id: string;
    side: Side;
    scopeType: Scope;
    action: string;
    reason: string;
    createdAt: string;
    actor: { name: string | null; email: string };
    market: Market | null;
    oldPrice: Price | null;
    newPrice: Price | null;
  }>;
};
type ImportBatch = {
  filename: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  rowCount: number;
  warningCount: number;
  errorCount: number;
  rows: Array<{
    id: string;
    sheet: string;
    rowNumber: number;
    status: string;
    message: string | null;
    rawData: unknown;
  }>;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});
const amount = (price: Price | null) =>
  price ? money.format(price.amountPaise / 100) : "Unavailable";

function RateEditor({
  side,
  price,
  save,
}: {
  side: Side;
  price: Price | null;
  save: (side: Side, value: string | null, reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState(
    price
      ? `${Math.trunc(price.amountPaise / 100)}.${String(price.amountPaise % 100).padStart(2, "0")}`
      : "",
  );
  const [reason, setReason] = useState("");
  useEffect(
    () =>
      setValue(
        price
          ? `${Math.trunc(price.amountPaise / 100)}.${String(price.amountPaise % 100).padStart(2, "0")}`
          : "",
      ),
    [price],
  );
  const submit = async (clear = false) => {
    await save(side, clear ? null : value, reason);
    setReason("");
  };
  return (
    <div className={styles.rateEditor}>
      <b>{side === "TO_CLIENT" ? "To client" : "To vendor"}</b>
      <span
        className={
          price?.amountPaise === 0
            ? styles.zero
            : price
              ? styles.available
              : styles.missing
        }
      >
        {price?.amountPaise === 0 ? "Explicit zero" : amount(price)}
      </span>
      <input
        aria-label={`${side} rupees`}
        inputMode="decimal"
        placeholder="Rupees, e.g. 1250.00"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <input
        aria-label={`${side} reason`}
        placeholder="Reason for change"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div>
        <button onClick={() => void submit(false)}>Save</button>
        <button
          className={styles.clear}
          disabled={!price}
          onClick={() => void submit(true)}
        >
          Clear
        </button>
      </div>
      {price?.sourceImport && (
        <small>Imported from {price.sourceImport.filename}</small>
      )}
    </div>
  );
}

export function CatalogueRateAdmin({
  isAccessManager,
}: {
  isAccessManager: boolean;
}) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [scope, setScope] = useState<Scope>("GLOBAL");
  const [marketId, setMarketId] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [completeness, setCompleteness] = useState("ALL");
  const [active, setActive] = useState("ACTIVE");
  const [durationFilter, setDurationFilter] = useState("ALL");
  const [quantityFilter, setQuantityFilter] = useState("ALL");
  const [readinessFilter, setReadinessFilter] = useState("ALL");
  const [blockerFilter, setBlockerFilter] = useState("ALL");
  const [policies, setPolicies] = useState<DurationPolicy[]>([]);
  const [selected, setSelected] = useState<Offering | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [message, setMessage] = useState("");
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const loadMarkets = useCallback(async () => {
    const response = await fetch("/api/admin/catalogue/markets");
    if (response.ok) {
      const data = await response.json();
      setMarkets(data.markets);
      setMarketId(
        (old) =>
          old || data.markets.find((item: Market) => item.active)?.id || "",
      );
    }
  }, []);
  const loadPolicies = useCallback(async () => {
    const response = await fetch("/api/admin/catalogue/duration-policies");
    if (response.ok) setPolicies((await response.json()).policies);
  }, []);
  const loadOfferings = useCallback(async () => {
    if (scope === "CITY" && !marketId) return setOfferings([]);
    const query = new URLSearchParams({
      scope,
      ...(scope === "CITY" ? { marketId } : {}),
    });
    const response = await fetch(`/api/admin/catalogue/offerings?${query}`);
    const data = await response.json();
    if (response.ok) setOfferings(data.offerings);
    else setMessage(data.error || "Could not load catalogue.");
  }, [scope, marketId]);
  const loadHistory = useCallback(async (id: string) => {
    const response = await fetch(
      `/api/admin/catalogue/offerings/${id}/history`,
    );
    if (response.ok) setHistory(await response.json());
  }, []);
  useEffect(() => {
    void loadMarkets();
    void loadPolicies();
    fetch("/api/admin/catalogue/import-status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setBatch(data?.batch ?? null));
  }, [loadMarkets, loadPolicies]);
  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);
  const shown = useMemo(
    () =>
      offerings.filter((item) => {
        const haystack =
          `${item.code} ${item.name} ${item.canonicalItem?.code ?? ""} ${item.canonicalItem?.name ?? ""}`.toLowerCase();
        const specialized = item.quantityBasis === "HEADCOUNT_DUTY" || item.quantityBasis === "GENERATOR" || item.kind === "PACKAGE" || item.durationPolicy?.mode === "MANUAL";
        const personnelReady = item.quantityBasis === "HEADCOUNT_DUTY" && item.pricingFamily === "HEADCOUNT_DUTY" && item.billingUnit === "DUTY" && Boolean(item.rates.TO_CLIENT || item.rates.TO_VENDOR);
        const ordinaryReady = !specialized && Boolean(item.quantityBasis && item.durationPolicy?.active && item.durationPolicy.authority === "INTERNAL_APPROVED" && (item.rates.TO_CLIENT || item.rates.TO_VENDOR));
        const blockers = new Set([
          ...(!item.quantityBasis ? ["QUANTITY"] : []),
          ...(!item.durationPolicy ? ["DURATION"] : []),
          ...(!item.rates.TO_CLIENT && !item.rates.TO_VENDOR ? ["RATE"] : []),
          ...(specialized ? ["SPECIALIZED"] : []),
        ]);
        return (
          haystack.includes(search.toLowerCase()) &&
          (domain === "ALL" || item.canonicalItem?.domain === domain) &&
          (completeness === "ALL" || item.completeness === completeness) &&
          (active === "ALL" || item.active === (active === "ACTIVE")) &&
          (durationFilter === "ALL" ||
            (durationFilter === "ASSIGNED" && Boolean(item.durationPolicy)) ||
            (durationFilter === "UNASSIGNED" && !item.durationPolicy) ||
            (durationFilter === "HALF_USE_DAYS_MIN_1" && item.durationPolicy?.code === "HALF_USE_DAYS_MIN_1") ||
            (durationFilter === "FULL_USE_DAYS" && item.durationPolicy?.code === "FULL_USE_DAYS") ||
            (durationFilter === "ONE_OFF" && item.durationPolicy?.code === "ONE_OFF") ||
            (durationFilter === "OTHER" && Boolean(item.durationPolicy) && !["HALF_USE_DAYS_MIN_1", "FULL_USE_DAYS", "ONE_OFF"].includes(item.durationPolicy?.code ?? ""))) &&
          (quantityFilter === "ALL" || (quantityFilter === "KNOWN") === Boolean(item.quantityBasis)) &&
          (readinessFilter === "ALL" || (readinessFilter === "READY") === (ordinaryReady || personnelReady)) &&
          (blockerFilter === "ALL" || blockers.has(blockerFilter))
        );
      }),
    [offerings, search, domain, completeness, active, durationFilter, quantityFilter, readinessFilter, blockerFilter],
  );
  const summary = useMemo(
    () =>
      offerings.reduce(
        (result, item) => ({
          ...result,
          [item.completeness]: (result[item.completeness] ?? 0) + 1,
        }),
        {} as Record<string, number>,
      ),
    [offerings],
  );
  async function saveRate(
    side: Side,
    amountRupees: string | null,
    reason: string,
  ) {
    if (!selected) return;
    setMessage("");
    const current = selected.rates[side];
    const response = await fetch(
      `/api/admin/catalogue/offerings/${selected.id}/rates`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          scopeType: scope,
          marketId: scope === "CITY" ? marketId : null,
          expectedCurrentPriceId: current?.id ?? null,
          amountRupees,
          reason,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      setMessage(
        data.code === "RATE_CONFLICT"
          ? `${data.error} The table has been refreshed.`
          : data.error || "Could not update rate.",
      );
      await loadOfferings();
      return;
    }
    setMessage(
      data.changed ? "Rate history updated." : "No rate change was needed.",
    );
    await loadOfferings();
    await loadHistory(selected.id);
  }
  async function createMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/catalogue/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        cityName: form.get("cityName"),
        state: form.get("state") || null,
        country: form.get("country"),
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Market created." : data.error);
    if (response.ok) {
      event.currentTarget.reset();
      await loadMarkets();
    }
  }
  async function toggleMarket(market: Market) {
    const response = await fetch(`/api/admin/catalogue/markets/${market.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !market.active }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `Market ${market.active ? "deactivated" : "activated"}.`
        : data.error,
    );
    await loadMarkets();
  }
  async function assignPolicy(policyId: string) {
    if (!selected) return;
    const reason = window
      .prompt("Reason for duration-policy assignment")
      ?.trim();
    if (!reason) return;
    const response = await fetch(
      `/api/admin/catalogue/offerings/${selected.id}/duration-policy`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: policyId || null, reason }),
      },
    );
    const data = await response.json();
    setMessage(
      response.ok ? "Duration policy assignment updated." : data.error,
    );
    if (response.ok) {
      await loadOfferings();
      await loadHistory(selected.id);
      await loadPolicies();
    }
  }
  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const points = String(form.get("curvePoints") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [usageDaysText, chargeUnitsText] = entry.split("=").map((part) => part.trim());
        const [numeratorText, denominatorText = "1"] = (chargeUnitsText ?? "").split("/").map((part) => part.trim());
        return {
          usageDays: Number(usageDaysText),
          chargeUnitsNumerator: Number(numeratorText),
          chargeUnitsDenominator: Number(denominatorText),
        };
      });
    const response = await fetch("/api/admin/catalogue/duration-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.get("code"),
        name: form.get("name"),
        mode: form.get("mode"),
        chargeMultiplierNumerator: Number(form.get("multiplierNumerator")),
        chargeMultiplierDenominator: Number(form.get("multiplierDenominator")),
        minimumChargeNumerator: Number(form.get("minimumNumerator")),
        minimumChargeDenominator: Number(form.get("minimumDenominator")),
        roundingMode: form.get("roundingMode"),
        description: form.get("description") || null,
        points,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Duration policy created." : data.error);
    if (response.ok) {
      event.currentTarget.reset();
      await loadPolicies();
    }
  }
  async function togglePolicy(policy: DurationPolicy) {
    const response = await fetch(
      `/api/admin/catalogue/duration-policies/${policy.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !policy.active }),
      },
    );
    const data = await response.json();
    setMessage(
      response.ok
        ? `Duration policy ${policy.active ? "deactivated" : "activated"}.`
        : data.error,
    );
    await loadPolicies();
  }
  function inspect(item: Offering) {
    setSelected(item);
    setHistory(null);
    void loadHistory(item.id);
  }
  useEffect(() => {
    if (selected)
      setSelected(offerings.find((item) => item.id === selected.id) ?? null);
  }, [offerings]);
  return (
    <main className="app">
      <AppSidebar isAdmin isAccessManager={isAccessManager} />
      <section className={styles.page}>
        <header>
          <div>
            <small>NORMALIZED CATALOGUE</small>
            <h1>Catalogue & Rates</h1>
            <p>
              Review every commercial offering and independently maintain client
              and vendor rate history.
            </p>
          </div>
          <div className={styles.scope}>
            <button
              className={scope === "GLOBAL" ? styles.selected : ""}
              onClick={() => setScope("GLOBAL")}
            >
              Global
            </button>
            <button
              className={scope === "CITY" ? styles.selected : ""}
              onClick={() => setScope("CITY")}
            >
              City
            </button>
            {scope === "CITY" && (
              <select
                value={marketId}
                onChange={(event) => setMarketId(event.target.value)}
              >
                {markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.cityName}
                    {market.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>
        {message && <p className={styles.message}>{message}</p>}
        <div className={styles.metrics}>
          <span>
            <b>{offerings.length}</b>Total offerings
          </span>
          <span>
            <b>{summary.BOTH ?? 0}</b>Both rates
          </span>
          <span>
            <b>{summary.CLIENT_ONLY ?? 0}</b>Client only
          </span>
          <span>
            <b>{summary.VENDOR_ONLY ?? 0}</b>Vendor only
          </span>
          <span>
            <b>{summary.NEITHER ?? 0}</b>Neither
          </span>
        </div>
        <section className={styles.filters}>
          <input
            placeholder="Search canonical or offering code/name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          >
            <option value="ALL">All domains</option>
            {["VC", "OPS", "POWER", "TECH", "OTHER"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={completeness}
            onChange={(event) => setCompleteness(event.target.value)}
          >
            <option value="ALL">All completeness</option>
            <option value="BOTH">Both</option>
            <option value="CLIENT_ONLY">Client only</option>
            <option value="VENDOR_ONLY">Vendor only</option>
            <option value="NEITHER">Neither</option>
          </select>
          <select
            value={active}
            onChange={(event) => setActive(event.target.value)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All statuses</option>
          </select>
          <select
            value={durationFilter}
            onChange={(event) => setDurationFilter(event.target.value)}
          >
            <option value="ALL">All duration policies</option>
            <option value="ASSIGNED">Policy assigned</option>
            <option value="UNASSIGNED">Policy unassigned</option>
            <option value="HALF_USE_DAYS_MIN_1">Half-use days, minimum 1</option>
            <option value="FULL_USE_DAYS">Full-use days</option>
            <option value="ONE_OFF">One-off</option>
            <option value="OTHER">Other assigned policy</option>
          </select>
          <select value={quantityFilter} onChange={(event) => setQuantityFilter(event.target.value)}>
            <option value="ALL">All quantity bases</option>
            <option value="KNOWN">Quantity known</option>
            <option value="MISSING">Quantity missing</option>
          </select>
          <select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)}>
            <option value="ALL">All ordinary readiness</option>
            <option value="READY">Ordinary ready</option>
            <option value="NOT_READY">Ordinary not ready</option>
          </select>
          <select value={blockerFilter} onChange={(event) => setBlockerFilter(event.target.value)}>
            <option value="ALL">All pricing blockers</option>
            <option value="RATE">Rate blocker</option>
            <option value="QUANTITY">Quantity blocker</option>
            <option value="DURATION">Duration blocker</option>
            <option value="SPECIALIZED">Specialized blocker</option>
          </select>
        </section>
        <section className={styles.table}>
          <div className={styles.head}>
            <span>Canonical item</span>
            <span>Commercial offering</span>
            <span>To client</span>
            <span>To vendor</span>
            <span>Status</span>
          </div>
          {shown.map((item) => (
            <button
              className={styles.row}
              key={item.id}
              onClick={() => inspect(item)}
            >
              <span>
                <b>{item.canonicalItem?.name ?? "Unresolved"}</b>
                <small>
                  {item.canonicalItem?.code ?? "—"} ·{" "}
                  {item.canonicalItem?.domain ?? "—"}
                </small>
              </span>
              <span>
                <b>{item.name}</b>
                <small>
                  {item.code} · {item.billingUnit} · {item.pricingFamily ?? "UNCLASSIFIED"} · {item.quantityBasis ?? "NO QUANTITY BASIS"}
                </small>
                <small>
                  Duration: {item.durationPolicy?.code ?? "UNASSIGNED"}
                </small>
              </span>
              <span
                className={
                  item.rates.TO_CLIENT?.amountPaise === 0
                    ? styles.zero
                    : item.rates.TO_CLIENT
                      ? styles.available
                      : styles.missing
                }
              >
                {item.rates.TO_CLIENT?.amountPaise === 0
                  ? "₹0.00 · explicit zero"
                  : amount(item.rates.TO_CLIENT)}
              </span>
              <span
                className={
                  item.rates.TO_VENDOR?.amountPaise === 0
                    ? styles.zero
                    : item.rates.TO_VENDOR
                      ? styles.available
                      : styles.missing
                }
              >
                {item.rates.TO_VENDOR?.amountPaise === 0
                  ? "₹0.00 · explicit zero"
                  : amount(item.rates.TO_VENDOR)}
              </span>
              <span>
                {(() => {
                  const personnelReady = item.pricingFamily === "HEADCOUNT_DUTY" && item.quantityBasis === "HEADCOUNT_DUTY" && item.billingUnit === "DUTY" && Boolean(item.rates.TO_CLIENT || item.rates.TO_VENDOR);
                  const ordinaryReady = item.pricingFamily === "ORDINARY" && Boolean(item.quantityBasis && item.durationPolicy?.active && item.durationPolicy.authority === "INTERNAL_APPROVED" && (item.rates.TO_CLIENT || item.rates.TO_VENDOR));
                  if (personnelReady || ordinaryReady) return "READY";
                  if (!item.pricingFamily || !item.quantityBasis) return "SEMANTICALLY_BLOCKED";
                  if (item.pricingFamily === "ORDINARY" && !item.durationPolicy) return "DURATION_BLOCKED";
                  if (!item.rates.TO_CLIENT && !item.rates.TO_VENDOR) return "RATE_BLOCKED";
                  return "SPECIALIZED_BLOCKED";
                })()}
                <small>{item.active ? "Active" : "Inactive"} · {item.completeness.replace("_", " ")}</small>
              </span>
            </button>
          ))}
          {shown.length === 0 && (
            <p className={styles.empty}>No offerings match these filters.</p>
          )}
        </section>
        {selected && (
          <section className={styles.detail}>
            <header>
              <div>
                <small>RATE EDITOR</small>
                <h2>{selected.name}</h2>
                <p>
                  {selected.code} · {scope}
                  {scope === "CITY"
                    ? ` · ${markets.find((item) => item.id === marketId)?.cityName ?? ""}`
                    : ""}
                </p>
              </div>
              <button onClick={() => setSelected(null)}>Close</button>
            </header>
            <div className={styles.policyAssignment}>
              <label>
                Duration policy
                <select
                  value={selected.durationPolicy?.id ?? ""}
                  onChange={(event) => void assignPolicy(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {policies
                    .filter(
                      (policy) =>
                        policy.active ||
                        policy.id === selected.durationPolicy?.id,
                    )
                    .map((policy) => (
                      <option key={policy.id} value={policy.id}>
                        {policy.name}
                      </option>
                    ))}
                </select>
              </label>
              <small>
                Source classification: {selected.durationBasis ?? "unavailable"}{" "}
                · Billing: {selected.billingUnit} · Domain:{" "}
                {selected.canonicalItem?.domain ?? "—"}
              </small>
            </div>
            <div className={styles.rateGrid}>
              <RateEditor
                side="TO_CLIENT"
                price={selected.rates.TO_CLIENT}
                save={saveRate}
              />
              <RateEditor
                side="TO_VENDOR"
                price={selected.rates.TO_VENDOR}
                save={saveRate}
              />
            </div>
            <h3>Audit history</h3>
            {!history ? (
              <p>Loading history…</p>
            ) : history.events.length ? (
              <div className={styles.history}>
                {history.events.map((event) => (
                  <div key={event.id}>
                    <b>
                      {event.action} ·{" "}
                      {event.side.replace("TO_", "To ").toLowerCase()}
                    </b>
                    <span>
                      {event.oldPrice ? amount(event.oldPrice) : "Unavailable"}{" "}
                      →{" "}
                      {event.newPrice ? amount(event.newPrice) : "Unavailable"}
                    </span>
                    <small>
                      {event.scopeType}
                      {event.market ? ` · ${event.market.cityName}` : ""} ·{" "}
                      {new Date(event.createdAt).toLocaleString("en-IN")} ·{" "}
                      {event.actor.name ?? event.actor.email}
                    </small>
                    <p>{event.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                No manual changes yet. Imported provenance remains visible on
                each rate.
              </p>
            )}
          </section>
        )}
        <section className={styles.adminGrid}>
          <article>
            <h2>Duration policies</h2>
            <p>
              Calculation fields are immutable after creation; create a new
              version to change commercial math.
            </p>
            <form className={styles.policyForm} onSubmit={createPolicy}>
              <input name="code" placeholder="POLICY_CODE" required />
              <input name="name" placeholder="Policy name" required />
              <select name="mode">
                <option>USAGE_DAYS</option>
                <option>CURVE</option>
                <option>ONE_OFF</option>
                <option>MANUAL</option>
              </select>
              <input
                name="multiplierNumerator"
                type="number"
                min="0"
                defaultValue="1"
                required
              />
              <input
                name="multiplierDenominator"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
              <input
                name="minimumNumerator"
                type="number"
                min="0"
                defaultValue="1"
                required
              />
              <input
                name="minimumDenominator"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
              <select name="roundingMode">
                <option>NONE</option>
                <option>CEIL</option>
                <option>FLOOR</option>
                <option>HALF_UP</option>
              </select>
              <input name="description" placeholder="Description" />
              <input name="curvePoints" placeholder="Curve: 1=1, 4=3/2" />
              <button type="submit">Create version</button>
            </form>
            <div className={styles.markets}>
              {policies.map((policy) => (
                <div key={policy.id}>
                  <span>
                    <b>{policy.name}</b>
                    <small>
                      {policy.code} · {policy.mode} · ×
                      {policy.chargeMultiplierNumerator}/
                      {policy.chargeMultiplierDenominator} · min{" "}
                      {policy.minimumChargeNumerator}/
                      {policy.minimumChargeDenominator} · {policy.roundingMode}{" "}
                      · {policy._count?.offerings ?? 0} assigned
                      {policy.mode === "CURVE" && (policy.points?.length ?? 0) > 0
                        ? ` · ${policy.points?.map((point) => `${point.usageDays}d→${point.chargeUnitsNumerator}/${point.chargeUnitsDenominator}`).join(", ")}`
                        : ""}
                    </small>
                  </span>
                  <button onClick={() => void togglePolicy(policy)}>
                    {policy.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h2>Rate markets</h2>
            <p>Inactive markets retain history but cannot receive rates.</p>
            <form className={styles.marketForm} onSubmit={createMarket}>
              <input name="code" placeholder="Code (DEL)" required />
              <input name="cityName" placeholder="City" required />
              <input name="state" placeholder="State" />
              <input name="country" defaultValue="IN" required />
              <button type="submit">Create market</button>
            </form>
            <div className={styles.markets}>
              {markets.map((market) => (
                <div key={market.id}>
                  <span>
                    <b>{market.cityName}</b>
                    <small>
                      {market.code} · {market.state ?? "—"}, {market.country}
                    </small>
                  </span>
                  <button onClick={() => void toggleMarket(market)}>
                    {market.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h2>Latest import status</h2>
            {batch ? (
              <>
                <p>
                  <b>{batch.filename}</b>
                  <br />
                  {batch.status} · {batch.rowCount} rows · {batch.warningCount}{" "}
                  warnings · {batch.errorCount} errors
                </p>
                <div className={styles.issues}>
                  {batch.rows.length ? (
                    batch.rows.map((row) => (
                      <div key={row.id}>
                        <b>
                          {row.sheet} row {row.rowNumber} · {row.status}
                        </b>
                        <small>{row.message ?? "Deferred for review"}</small>
                      </div>
                    ))
                  ) : (
                    <p>No deferred or errored rows recorded.</p>
                  )}
                </div>
              </>
            ) : (
              <p>No catalogue import has been recorded.</p>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
