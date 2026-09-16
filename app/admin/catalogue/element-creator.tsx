"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ELEMENT_KIND_OPTIONS,
  inferMeasurement,
  MEASUREMENT_OPTIONS,
  PARENT_CATEGORY_OPTIONS,
  suggestElementCode,
  UNIT_OPTIONS,
} from "@/lib/element-options";
import { AdminButton } from "@/app/components/admin-button";
import styles from "./element-creator.module.css";

export type ParentOption = { code: string; name: string; category: string };

const EMPTY = { name: "", code: "", parentCode: "", parentName: "", price: "" };

export function ElementCreator({ parents, onCreated }: { parents: ParentOption[]; onCreated: () => Promise<void> | void }) {
  const [name, setName] = useState(EMPTY.name);
  const [code, setCode] = useState(EMPTY.code);
  const [codeTouched, setCodeTouched] = useState(false);
  const [kind, setKind] = useState("ITEM");
  const [parentCode, setParentCode] = useState(EMPTY.parentCode);
  const [parentName, setParentName] = useState(EMPTY.parentName);
  const [parentCategory, setParentCategory] = useState<string>("OTHER");
  const [billingUnit, setBillingUnit] = useState("NOS");
  const [measurement, setMeasurement] = useState("COUNT");
  const [measurementTouched, setMeasurementTouched] = useState(false);
  const [price, setPrice] = useState(EMPTY.price);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const knownParent = useMemo(
    () => parents.find((parent) => parent.code.toUpperCase() === parentCode.trim().toUpperCase()) ?? null,
    [parents, parentCode],
  );

  useEffect(() => { if (!codeTouched) setCode(suggestElementCode(name)); }, [name, codeTouched]);
  useEffect(() => {
    if (knownParent) { setParentName(knownParent.name); setParentCategory(knownParent.category); }
  }, [knownParent]);
  useEffect(() => {
    if (measurementTouched) return;
    const inferred = inferMeasurement(billingUnit);
    if (inferred) setMeasurement(inferred);
  }, [billingUnit, measurementTouched]);

  function reset() {
    setName(EMPTY.name); setCode(EMPTY.code); setCodeTouched(false);
    setParentCode(EMPTY.parentCode); setParentName(EMPTY.parentName); setPrice(EMPTY.price);
    setMeasurementTouched(false); setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/catalogue/elements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, kind, parentCode, parentName, parentCategory, billingUnit, measurement, toClientRupees: price.trim() === "" ? null : price }),
      });
      const data = await response.json();
      if (!response.ok) { setError(typeof data.error === "string" ? data.error : "Could not create the element."); return; }
      setNotice(`${data.element.name} (${data.element.code}) created. ${data.parentCreated ? "New parent created." : "Existing parent reused."} ${data.toClientAmountPaise === null ? "No TO_CLIENT rate was set." : "TO_CLIENT rate saved."}`);
      reset();
      await onCreated();
    } catch {
      setError("Could not reach the catalogue service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <header>
        <div>
          <small>ADD ELEMENT</small>
          <h2>Create a catalogue element</h2>
          <p>A parent is reused by Parent Code. A blank TO_CLIENT rate simply leaves the element rate-missing; it stays selectable for packages.</p>
        </div>
      </header>
      <form onSubmit={submit}>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Element name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Bamboo chair" />
          </label>
          <label className={styles.field}>
            <span>Element code</span>
            <input value={code} onChange={(event) => { setCodeTouched(true); setCode(event.target.value.toUpperCase()); }} required placeholder="CHR_BAMBOO" />
            <small>Must be unique across the catalogue.</small>
          </label>
          <label className={styles.field}>
            <span>Element type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {ELEMENT_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Parent code</span>
            <input list="element-parent-codes" value={parentCode} onChange={(event) => setParentCode(event.target.value.toUpperCase())} required placeholder="CHR_GROUP" />
            <datalist id="element-parent-codes">
              {parents.map((parent) => <option key={parent.code} value={parent.code}>{parent.name}</option>)}
            </datalist>
          </label>
          <label className={styles.field}>
            <span>Parent category / name</span>
            <input value={parentName} onChange={(event) => setParentName(event.target.value)} required placeholder="Seating" />
            {knownParent && <small className={styles.hint}>Existing parent {knownParent.code} will be reused.</small>}
          </label>
          <label className={styles.field}>
            <span>Parent category</span>
            <select value={parentCategory} onChange={(event) => setParentCategory(event.target.value)}>
              {PARENT_CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Billing unit</span>
            <select value={billingUnit} onChange={(event) => setBillingUnit(event.target.value)}>
              {UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Measurement</span>
            <select value={measurement} onChange={(event) => { setMeasurementTouched(true); setMeasurement(event.target.value); }}>
              {MEASUREMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small>{inferMeasurement(billingUnit) === null ? "This unit does not imply one measurement — choose the intended one." : "Prefilled from the billing unit. Change it if needed."}</small>
          </label>
          <label className={styles.field}>
            <span>TO_CLIENT rate (optional)</span>
            <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Leave blank for no rate" />
            <small>Blank creates no price. Enter 0 for an explicit zero rate.</small>
          </label>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}
        <div className={styles.actions}>
          <AdminButton type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : "Create element"}</AdminButton>
          <AdminButton onClick={reset} disabled={busy}>Clear</AdminButton>
        </div>
      </form>
    </section>
  );
}
