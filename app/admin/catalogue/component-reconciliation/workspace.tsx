"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminButton } from "@/app/components/admin-button";
import styles from "./workspace.module.css";

type Offering = { id: string; name: string; elementCode: string; parentCode: string | null; billingUnit: string };
type Candidate = { elementCode: string; parentCode: string; description: string; score?: number; offering: Offering | null };
type Mapping = { id: string; sourceLabel: string; cities?: string[]; matchType?: string; status?: string; candidates?: Array<{ elementCode: string; parentCode: string; description: string }>; candidateOfferings?: Candidate[]; matchedOffering: Offering | null; validated: boolean };

function Decision({ mapping, reload }: { mapping: Mapping; reload: () => Promise<void> }) {
  const [search, setSearch] = useState(mapping.matchedOffering?.elementCode ?? "");
  const [options, setOptions] = useState<Offering[]>([]);
  const [selected, setSelected] = useState(mapping.matchedOffering?.id ?? "");
  const includeQuery = (mapping.candidateOfferings ?? []).map((item) => item.elementCode).map((code) => `includeCode=${encodeURIComponent(code)}`).join("&");
  useEffect(() => { const timer = window.setTimeout(() => fetch(`/api/admin/packages/components?search=${encodeURIComponent(search)}${includeQuery ? `&${includeQuery}` : ""}`).then((response) => response.json()).then((data) => setOptions(data.components ?? [])).catch(() => setOptions([])), 180); return () => window.clearTimeout(timer); }, [search, includeQuery]);
  async function save(status: "CONFIRMED" | "DEFERRED", offeringId = selected) { await fetch("/api/admin/catalogue/component-reconciliation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mapping.id, offeringId: status === "CONFIRMED" ? offeringId : null, status }) }); await reload(); }
  const selectedOffering = options.find((item) => item.id === selected) ?? (mapping.candidateOfferings ?? []).map((item) => item.offering).find((item) => item?.id === selected);
  return <div className={styles.reviewControls}>
    {(mapping.candidateOfferings ?? []).length > 0 && <div className={styles.suggested}><h3>{mapping.matchType === "AMBIGUOUS" ? "Candidate matches" : "Suggested match"}</h3>{mapping.candidateOfferings?.map((candidate) => <div key={candidate.elementCode} className={styles.candidateRow}><div><b>{candidate.elementCode} — {candidate.description}</b><small>Parent {candidate.parentCode}{candidate.score ? ` · score ${candidate.score.toFixed(2)}` : ""}</small>{candidate.offering && <small>{candidate.offering.name} · {candidate.offering.billingUnit ?? "unit not set"}</small>}{!candidate.offering && <small className={styles.missing}>Not selectable in current component universe</small>}</div><AdminButton variant="primary" size="sm" disabled={!candidate.offering} onClick={() => candidate.offering && void save("CONFIRMED", candidate.offering.id)}>Confirm</AdminButton></div>)}</div>}
    <div className={styles.decision}><input aria-label={`Search match for ${mapping.sourceLabel}`} placeholder="Search another component" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose component</option>{options.map((item) => <option key={item.id} value={item.id}>{item.elementCode} — {item.name} (Parent {item.parentCode ?? "—"})</option>)}</select><AdminButton variant="primary" disabled={!selected} onClick={() => void save("CONFIRMED")}>{mapping.matchedOffering ? "Change match" : "Confirm selected"}</AdminButton><AdminButton onClick={() => void save("DEFERRED")}>Defer</AdminButton></div>
    {selectedOffering && <p className={styles.selected}>Selected: <b>{selectedOffering.elementCode}</b> · Parent {selectedOffering.parentCode ?? "—"} · {selectedOffering.name}</p>}
  </div>;
}

export function ComponentReconciliationWorkspace() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [filter, setFilter] = useState("REVIEW_REQUIRED");
  const load = useCallback(async () => { const response = await fetch("/api/admin/catalogue/component-reconciliation"); if (response.ok) setMappings((await response.json()).mappings); }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => mappings.filter((item) => filter === "ALL" || (filter === "CONFIRMED" ? item.validated : filter === "DEFERRED" ? item.status === "DEFERRED" : !item.validated && item.status !== "DEFERRED")), [mappings, filter]);
  const confirmed = mappings.filter((item) => item.validated).length;
  const deferred = mappings.filter((item) => item.status === "DEFERRED").length;
  return <section className={styles.page}><header><small>SOURCE LABEL REVIEW</small><h1>Component reconciliation</h1><p>Resolve CCI column labels against V1 LookUp element identities. This workflow never imports rates or creates packages.</p></header><div className={styles.metrics}><span><b>{mappings.length}</b>CCI labels</span><span><b>{confirmed}</b>Confirmed</span><span><b>{mappings.length - confirmed - deferred}</b>Needs review</span><span><b>{deferred}</b>Deferred</span></div><div className={styles.filters}><AdminButton size="sm" active={filter === "REVIEW_REQUIRED"} onClick={() => setFilter("REVIEW_REQUIRED")}>Needs review</AdminButton><AdminButton size="sm" active={filter === "CONFIRMED"} onClick={() => setFilter("CONFIRMED")}>Confirmed</AdminButton><AdminButton size="sm" active={filter === "DEFERRED"} onClick={() => setFilter("DEFERRED")}>Deferred</AdminButton><AdminButton size="sm" active={filter === "ALL"} onClick={() => setFilter("ALL")}>All</AdminButton></div><div className={styles.list}>{shown.map((mapping) => <article key={mapping.id}><div className={styles.identity}><div><h2>{mapping.sourceLabel}</h2><p>{mapping.cities?.join(", ") ?? "City evidence unavailable"}</p></div><span className={mapping.validated ? styles.confirmed : styles.review}>{mapping.status ?? "REVIEW_REQUIRED"} · {mapping.matchType ?? "UNCLASSIFIED"}</span></div>{mapping.matchedOffering && <p className={styles.match}><b>{mapping.matchedOffering.name}</b> · Element {mapping.matchedOffering.elementCode} · Parent {mapping.matchedOffering.parentCode ?? "—"}</p>}{!mapping.validated && <Decision mapping={mapping} reload={load} />}</article>)}</div>{shown.length === 0 && <p className={styles.empty}>No reconciliation rows match this filter.</p>}</section>;
}
