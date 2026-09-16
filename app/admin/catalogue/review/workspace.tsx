"use client";
import { useEffect, useMemo, useState } from "react";
import { AdminButton } from "@/app/components/admin-button";
import { AppSidebar } from "@/app/components/app-sidebar";
const statuses = [
  "UNREVIEWED",
  "APPROVED",
  "CHANGE_REQUIRED",
  "DEFERRED",
  "REJECTED",
];
const reviewFields = [
  "IDENTITY",
  "CATEGORY",
  "BILLING_UNIT",
  "QUANTITY_SEMANTICS",
  "DURATION_POLICY",
  "TO_CLIENT_RATE",
  "TO_VENDOR_RATE",
  "ACTIVE_INCLUSION",
  "PACKAGE_TREATMENT",
];
export function CatalogueReviewWorkspace() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [readiness, setReadiness] = useState("ALL");
  const [family, setFamily] = useState("ALL");
  const [domain, setDomain] = useState("ALL");
  const [missing, setMissing] = useState("ALL");
  const [selected, setSelected] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [releases, setReleases] = useState<any[]>([]);
  const [releaseCode, setReleaseCode] = useState("CAV-CATALOGUE-2026-01");
  const load = () =>
    fetch("/api/admin/catalogue/review")
      .then((r) => r.json())
      .then((d) => setRows(d.offerings));
  useEffect(() => {
    void load();
    void loadReleases();
  }, []);
  const loadReleases = () =>
    fetch("/api/admin/catalogue/releases")
      .then((r) => r.json())
      .then((d) => setReleases(d.releases));
  const shown = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.code} ${row.name} ${row.canonicalItem?.name ?? ""} ${row.aliases.map((a: any) => a.originalText).join(" ")} ${row.sourceEvidence.map((s: any) => s.sourceDescription).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (status === "ALL" || row.reviewStatus === status) &&
          (readiness === "ALL" || row.readiness.state === readiness) &&
          (family === "ALL" ||
            (row.kind === "PACKAGE"
              ? "PACKAGE"
              : (row.pricingFamily ?? "BLOCKED")) === family) &&
          (domain === "ALL" || row.canonicalItem?.domain === domain) &&
          (missing === "ALL" ||
            (missing === "CLIENT" && row.readiness.missingClientRate) ||
            (missing === "VENDOR" && row.readiness.missingVendorRate) ||
            (missing === "BOTH" &&
              row.readiness.missingClientRate &&
              row.readiness.missingVendorRate)),
      ),
    [rows, search, status, readiness, family, domain, missing],
  );
  async function decide(row: any, newStatus: string) {
    const reason = window.prompt("Review reason");
    if (!reason) return;
    const requiredChanges =
      newStatus === "CHANGE_REQUIRED"
        ? (window.prompt("Required changes") ?? "")
        : "";
    const response = await fetch("/api/admin/catalogue/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offeringId: row.id,
        status: newStatus,
        reason,
        requiredChanges,
        reviewNote: reason,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Decision recorded." : (data.error ?? data.code));
    if (response.ok) void load();
  }
  async function decideField(row: any, field: string, newStatus: string) {
    const reason = window.prompt(`${field} review reason`);
    if (!reason) return;
    const proposedValue =
      newStatus === "CHANGE_REQUIRED"
        ? (window.prompt("Proposed/corrected value") ?? "")
        : "";
    const response = await fetch("/api/admin/catalogue/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offeringId: row.id,
        field,
        fieldStatus: newStatus,
        reason,
        proposedValue,
      }),
    });
    const data = await response.json();
    setMessage(
      response.ok ? `${field} decision recorded.` : (data.error ?? data.code),
    );
    if (response.ok) {
      const refreshed = await fetch("/api/admin/catalogue/review").then((r) =>
        r.json(),
      );
      setRows(refreshed.offerings);
      setSelected(refreshed.offerings.find((item: any) => item.id === row.id));
    }
  }
  async function createRelease() {
    const response = await fetch("/api/admin/catalogue/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: releaseCode,
        notes: "Business review release candidate",
      }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? "Release candidate created."
        : (data.error ?? "Could not create release."),
    );
    if (response.ok) void loadReleases();
  }
  async function transitionRelease(release: any, next: string) {
    const reason = window.prompt("Release transition reason");
    if (!reason) return;
    const response = await fetch(
      `/api/admin/catalogue/releases/${release.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, reason }),
      },
    );
    const data = await response.json();
    setMessage(
      response.ok ? `Release moved to ${next}.` : (data.error ?? data.code),
    );
    if (response.ok) void loadReleases();
  }
  return (
    <main className="app">
      <AppSidebar isAdmin />
      <section className="content">
        <header>
          <div>
            <small>BUSINESS APPROVAL</small>
            <h1>Catalogue Review / Release</h1>
            <p>
              Review commercial truth without mutating rates, semantics, or
              source evidence.
            </p>
          </div>
          <a href="/api/admin/catalogue/review/export">
            Export deterministic review JSON
          </a>
        </header>
        {message && <p className="notice">{message}</p>}
        <article>
          <div className="fields">
            <label>
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>ALL</option>
                {statuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Readiness
              <select
                value={readiness}
                onChange={(e) => setReadiness(e.target.value)}
              >
                <option>ALL</option>
                {[...new Set(rows.map((x) => x.readiness.state))].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Pricing family
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                <option>ALL</option>
                <option>ORDINARY</option>
                <option>HEADCOUNT_DUTY</option>
                <option>PACKAGE</option>
                <option>BLOCKED</option>
              </select>
            </label>
            <label>
              Domain
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option>ALL</option>
                {[
                  ...new Set(
                    rows.map((x) => x.canonicalItem?.domain).filter(Boolean),
                  ),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Missing rate
              <select
                value={missing}
                onChange={(e) => setMissing(e.target.value)}
              >
                <option>ALL</option>
                <option>CLIENT</option>
                <option>VENDOR</option>
                <option>BOTH</option>
              </select>
            </label>
          </div>
          <p>
            {shown.length} of {rows.length} offerings
          </p>
          {shown.map((row) => (
            <div className="normalizedLine" key={row.id}>
              <header>
                <span>
                  <b>
                    {row.code} — {row.name}
                  </b>
                  <small>
                    {row.canonicalItem?.code ?? "No canonical"} ·{" "}
                    {row.canonicalItem?.domain ?? "—"} ·{" "}
                    {row.kind === "PACKAGE"
                      ? "PACKAGE"
                      : (row.pricingFamily ?? "BLOCKED")}{" "}
                    · {row.readiness.state} · {row.reviewStatus}
                  </small>
                </span>
                <AdminButton size="sm" onClick={() => setSelected(row)}>Review detail</AdminButton>
              </header>
              <p>
                {row.billingUnit} · {row.quantityBasis ?? "quantity unresolved"}{" "}
                · {row.durationPolicy?.code ?? "duration unresolved"} · Client{" "}
                {row.readiness.clientRate
                  ? `₹${row.readiness.clientRate.amountPaise / 100}`
                  : "MISSING"}{" "}
                · Vendor{" "}
                {row.readiness.vendorRate
                  ? `₹${row.readiness.vendorRate.amountPaise / 100}`
                  : "MISSING"}
              </p>
              {row.readiness.semanticQuestion && (
                <p className="lineError">
                  <b>Business decision required:</b>{" "}
                  {row.readiness.semanticQuestion}
                </p>
              )}
              <div>
                {statuses
                  .filter((x) => x !== "UNREVIEWED")
                  .map((x) => (
                    <AdminButton key={x} size="sm" onClick={() => void decide(row, x)}>
                      {x}
                    </AdminButton>
                  ))}
              </div>
            </div>
          ))}
        </article>
        {selected && (
          <article>
            <AdminButton onClick={() => setSelected(null)}>Close</AdminButton>
            <h2>{selected.code} — review evidence</h2>
            <p>
              <b>Source:</b>{" "}
              {selected.sourceEvidence
                .map(
                  (x: any) =>
                    `${x.sourceFile ?? x.sourceSystem} / ${x.sourceSheet ?? "—"} / ${x.sourceCode ?? "—"}: ${x.sourceDescription}${x.notes ? ` (${x.notes})` : ""}`,
                )
                .join(" · ") || "No source evidence"}
            </p>
            <p>
              <b>Normalized:</b> {selected.billingUnit};{" "}
              {selected.quantityBasis ?? "unresolved"};{" "}
              {selected.pricingFamily ?? "unresolved"}; policy{" "}
              {selected.durationPolicy?.name ?? "unresolved"}
            </p>
            <p><b>Price history:</b> {selected.prices.length ? selected.prices.map((price: any) => `${price.side} ${price.scopeType} ${price.active ? "CURRENT" : "HISTORICAL"} ₹${price.amountPaise / 100}`).join(" · ") : "No prices"}</p>
            {selected.durationPolicy?.points?.length > 0 && (
              <p>
                Curve:{" "}
                {selected.durationPolicy.points
                  .map(
                    (p: any) =>
                      `${p.usageDays}d=${p.chargeUnitsNumerator}/${p.chargeUnitsDenominator}`,
                  )
                  .join(", ")}
              </p>
            )}
            <p>
              <b>Aliases:</b>{" "}
              {selected.aliases.map((x: any) => x.originalText).join(", ")}
            </p>
            <p>
              <b>Packages:</b>{" "}
              {selected.parentPackageTemplates.length
                ? selected.parentPackageTemplates
                    .map(
                      (p: any) =>
                        `${p.code} v${p.version} ${p.pricingMode}: ${p.components.map((c: any) => `${c.commercialOffering.code} ${c.quantityRuleType} ${c.quantityValue} ${c.billingMode}`).join(", ")}`,
                    )
                    .join(" · ")
                : "None"}
            </p>
            <p>
              <b>Audit entries:</b>{" "}
              {selected.businessReview?.audits?.length ?? 0}
            </p>
            {selected.businessReview?.audits?.map((audit: any) => <p key={audit.id}><small>{new Date(audit.createdAt).toLocaleString()} · {audit.actor.email} · {audit.field ?? "OVERALL"} · {audit.oldStatus} → {audit.newStatus} · {audit.reason}</small></p>)}
            <h3>Commercial dimension decisions</h3>
            {reviewFields.map((field) => {
              const current = selected.fieldReviews.find(
                (item: any) => item.field === field,
              );
              return (
                <div key={field}>
                  <b>{field}</b>: {current?.status ?? "UNREVIEWED"}
                  {current?.proposedValue
                    ? ` → ${current.proposedValue}`
                    : ""}{" "}
                  <AdminButton
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void decideField(selected, field, "APPROVED")
                    }
                  >
                    Approve field
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    onClick={() =>
                      void decideField(selected, field, "CHANGE_REQUIRED")
                    }
                  >
                    Request change
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    onClick={() =>
                      void decideField(selected, field, "DEFERRED")
                    }
                  >
                    Defer field
                  </AdminButton>
                </div>
              );
            })}
          </article>
        )}
        <article>
          <h2>Release candidates</h2>
          <p>
            An approved release is an immutable commercial data set, not a
            deployment.
          </p>
          <div className="fields">
            <label>
              Release code
              <input
                value={releaseCode}
                onChange={(event) => setReleaseCode(event.target.value)}
              />
            </label>
            <AdminButton variant="primary" onClick={() => void createRelease()}>
              Create from approved subset
            </AdminButton>
          </div>
          {releases.map((release) => (
            <div className="normalizedLine" key={release.id}>
              <header>
                <span>
                  <b>{release.code}</b>
                  <small>
                    {release.status} · release {release.releaseFingerprint.slice(0, 12)}… · catalogue{" "}
                    {release.catalogueFingerprint.slice(0, 12)}… · decisions{" "}
                    {release.decisionSetHash.slice(0, 12)}…
                  </small>
                </span>
              </header>
              <p>
                Included {release.summary.included} · client-ready{" "}
                {release.summary.clientReadyApproved} · vendor-ready{" "}
                {release.summary.vendorReadyApproved} · blockers{" "}
                {release.summary.releaseBlockers.length}
              </p>
              {release.status === "DRAFT" && (
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    void transitionRelease(release, "READY_FOR_APPROVAL")
                  }
                >
                  Mark ready for approval
                </AdminButton>
              )}
              {release.status === "READY_FOR_APPROVAL" && (
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={() => void transitionRelease(release, "APPROVED")}
                >
                  Approve immutable release
                </AdminButton>
              )}
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
