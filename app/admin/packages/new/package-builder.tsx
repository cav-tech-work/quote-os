"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./package-builder.module.css";

type Mode = "COMPONENT_SUM" | "FIXED_PACKAGE";
type Billing = "BILLABLE" | "INCLUDED";
type Component = { id: string; name: string; elementCode: string; parentCode: string | null; billingUnit: string; pricingFamily: string | null; quantityBasis: string | null; quantityValue: string; billingMode: Billing; dutyUnitsPerPerson: string };
type PickerComponent = Omit<Component, "quantityValue" | "billingMode" | "dutyUnitsPerPerson">;
export type PackageBuilderInitial = { code: string; name: string; description: string; version: number; pricingMode: Mode; parentCommercialOfferingId: string; components: Component[] };
type Preview = { rows: Array<{ commercialOfferingId: string; name: string; elementCode: string; parentCode: string | null; billingUnit: string; billingMode: Billing; quantity: string; sides: Record<"TO_CLIENT" | "TO_VENDOR", { state: string; unitRatePaise: number | null; amountPaise: number | null }> }> };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const suggestion = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function PackageBuilder({ initial }: { initial: PackageBuilderInitial | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(Boolean(initial));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [version, setVersion] = useState(initial?.version ?? 1);
  const [pricingMode, setPricingMode] = useState<Mode>(initial?.pricingMode ?? "COMPONENT_SUM");
  const [parentCommercialOfferingId, setParent] = useState(initial?.parentCommercialOfferingId ?? "");
  const [components, setComponents] = useState<Component[]>(initial?.components ?? []);
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState<PickerComponent[]>([]);
  const [parents, setParents] = useState<PickerComponent[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { if (!codeTouched) setCode(suggestion(name)); }, [name, codeTouched]);
  useEffect(() => { const timer = window.setTimeout(() => fetch(`/api/admin/packages/components?search=${encodeURIComponent(search)}`).then((r) => r.json()).then((v) => setPicker(v.components ?? [])).catch(() => setPicker([])), 180); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { fetch("/api/admin/packages/components?kind=PACKAGE").then((r) => r.json()).then((v) => setParents(v.components ?? [])).catch(() => setParents([])); }, []);
  useEffect(() => { if (pricingMode === "FIXED_PACKAGE") setComponents((rows) => rows.map((row) => ({ ...row, billingMode: "INCLUDED" }))); else setParent(""); }, [pricingMode]);
  const selectedIds = useMemo(() => new Set(components.map((item) => item.id)), [components]);
  function add(item: PickerComponent) { if (!selectedIds.has(item.id)) setComponents((rows) => [...rows, { ...item, quantityValue: "1", billingMode: pricingMode === "FIXED_PACKAGE" ? "INCLUDED" : "BILLABLE", dutyUnitsPerPerson: item.quantityBasis === "HEADCOUNT_DUTY" ? "1" : "" }]); }
  function update(index: number, patch: Partial<Component>) { setComponents((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); setPreview(null); }
  function move(index: number, delta: number) { const target = index + delta; if (target < 0 || target >= components.length) return; setComponents((rows) => { const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; return next; }); setPreview(null); }
  const payload = () => ({ code, name, description, version, pricingMode, ...(pricingMode === "FIXED_PACKAGE" ? { parentCommercialOfferingId } : {}), active: false as const, components: components.map((item, index) => ({ commercialOfferingId: item.id, quantityRuleType: "FIXED_PER_PACKAGE" as const, quantityValue: item.quantityValue, billingMode: item.billingMode, ...(item.quantityBasis === "HEADCOUNT_DUTY" ? { dutyUnitsPerPerson: item.dutyUnitsPerPerson } : {}), sortOrder: index + 1, required: true })) });
  async function request(path: string) { setMessage(""); const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }); const data = await response.json(); if (!response.ok) { setMessage(typeof data.error === "string" ? data.error : "Check the package fields and component quantities."); return null; } return data; }
  async function showPreview() { const data = await request("/api/admin/packages/preview"); if (data) setPreview(data); }
  async function save() { const data = await request("/api/admin/packages"); if (data) { router.push("/admin/packages"); router.refresh(); } }
  return <section className={styles.page}><header><small>PACKAGE RECIPES</small><h1>{initial ? `Create ${initial.code} version ${version}` : "Create Package"}</h1><p>Build one package from catalogue components. Quantities are per-package recipe quantities, never inventory.</p></header>
    {message && <p className={styles.message}>{message}</p>}
    <section className={styles.panel}><h2>Package details</h2><div className={styles.fields}>
      <label>Package Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Package Code<input value={code} onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase()); }} required /></label>
      <label>Version<input type="number" min="1" value={version} onChange={(e) => setVersion(Number(e.target.value))} /></label>
      <label>Pricing Mode<select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as Mode)}><option value="COMPONENT_SUM">Component sum</option><option value="FIXED_PACKAGE">Fixed package</option></select></label>
      <label className={styles.wide}>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {pricingMode === "FIXED_PACKAGE" && <label className={styles.wide}>Package parent offering<select value={parentCommercialOfferingId} onChange={(e) => setParent(e.target.value)}><option value="">Select a manually priced package offering</option>{parents.map((item) => <option key={item.id} value={item.id}>{item.elementCode} — {item.name}</option>)}</select><small>The package price remains managed in Catalogue & Rates.</small></label>}
    </div></section>
    <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>Components</h2><p>Default rule: fixed quantity per package.</p></div><span>{components.length} selected</span></div>
      <div className={styles.picker}><input placeholder="Search name, element code, parent code, alias or tag" value={search} onChange={(e) => setSearch(e.target.value)} /><div>{picker.filter((item) => !selectedIds.has(item.id)).slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => add(item)}><b>+ {item.name}</b><small>{item.elementCode} · Parent {item.parentCode ?? "—"} · {item.billingUnit}</small></button>)}</div></div>
      <div className={styles.components}>{components.map((item, index) => <article key={item.id}><div className={styles.componentTitle}><div><b>{item.name}</b><small>Element {item.elementCode} · Parent {item.parentCode ?? "—"} · {item.billingUnit}</small></div><button type="button" className={styles.remove} onClick={() => setComponents((rows) => rows.filter((_, i) => i !== index))}>Remove</button></div><div className={styles.componentFields}>
        <label>Quantity per package<input inputMode="decimal" value={item.quantityValue} onChange={(e) => update(index, { quantityValue: e.target.value })} /></label>
        <label>Billing role<select value={item.billingMode} disabled={pricingMode === "FIXED_PACKAGE"} onChange={(e) => update(index, { billingMode: e.target.value as Billing })}><option value="BILLABLE">Billable</option><option value="INCLUDED">Included</option></select></label>
        {item.quantityBasis === "HEADCOUNT_DUTY" && <label>Duties per person<input inputMode="decimal" value={item.dutyUnitsPerPerson} onChange={(e) => update(index, { dutyUnitsPerPerson: e.target.value })} /></label>}
        <div className={styles.order}><span>Order {index + 1}</span><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Up</button><button type="button" disabled={index === components.length - 1} onClick={() => move(index, 1)}>Down</button></div>
      </div></article>)}</div>
    </section>
    <div className={styles.actions}><button type="button" onClick={() => void showPreview()} disabled={!components.length}>Preview</button><button type="button" className={styles.save} onClick={() => void save()} disabled={!components.length}>Save draft</button></div>
    {preview && <section className={styles.panel}><h2>Server preview</h2><p>Missing rates do not block a draft. There is no fallback to another rate side.</p><div className={styles.previewTable}><div className={styles.previewHead}><span>Component</span><span>Qty / unit</span><span>To client</span><span>To vendor</span></div>{preview.rows.map((row) => <div key={row.commercialOfferingId}><span><b>{row.name}</b><small>{row.elementCode} · {row.billingMode}</small></span><span>{row.quantity} {row.billingUnit}</span>{(["TO_CLIENT", "TO_VENDOR"] as const).map((side) => <span key={side} className={row.sides[side].state === "READY" ? styles.ready : styles.missing}>{row.sides[side].state === "READY" ? <>{money.format((row.sides[side].unitRatePaise ?? 0) / 100)}<small>Amount {money.format((row.sides[side].amountPaise ?? 0) / 100)}</small></> : row.sides[side].state === "RATE_MISSING" ? "RATE MISSING" : row.sides[side].state.replaceAll("_", " ")}</span>)}</div>)}</div></section>}
  </section>;
}
