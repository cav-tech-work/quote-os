"use client";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "./components/app-sidebar";

type Side = "TO_CLIENT" | "TO_VENDOR";
type Offering = {
  id: string;
  code: string;
  name: string;
  canonicalCode: string | null;
  canonicalName: string | null;
  pricingFamily: "ORDINARY" | "HEADCOUNT_DUTY";
  quantityBasis:
    | "COUNT"
    | "AREA_LW"
    | "AREA_LH"
    | "LINEAR"
    | "VOLUME"
    | "FIXED"
    | "HEADCOUNT_DUTY";
  billingUnit: string;
  durationPolicyCode: string | null;
  durationPolicyMode: string | null;
  priceId: string;
  unitRatePaise: number;
};
type Configuration = {
  quantity?: string;
  length?: { value: string; unit: "FT" | "M" };
  width?: { value: string; unit: "FT" | "M" };
  height?: { value: string; unit: "FT" | "M" };
  headcount?: string;
  dutyUnitsPerPerson?: string;
};
type Preview = {
  billableQuantity: string;
  usageDays?: string | null;
  chargeUnits?: string | null;
  finalAmountPaise: number;
  pricingState: string;
  headcount?: string;
  dutyUnitsPerPerson?: string;
};
type Line = {
  offering: Offering;
  configuration: Configuration;
  usageDays: string;
  discountPercent: number;
  preview: Preview | null;
  error: string;
};
type PackageOption = {
  id: string;
  code: string;
  name: string;
  version: number;
  pricingMode: "COMPONENT_SUM" | "FIXED_PACKAGE";
  kind: "PACKAGE";
  components: Array<{
    code: string;
    name: string;
    billingMode: "BILLABLE" | "INCLUDED";
    quantity: string;
  }>;
};
type PackageLine = {
  pkg: PackageOption;
  packageQuantity: string;
  discountPercent: number;
  preview: {
    finalAmountPaise: number;
    componentResults: Array<{
      offering: { code: string; name: string };
      billingMode: string;
      resolvedQuantity: string;
      finalAmountPaise: number;
    }>;
  } | null;
  error: string;
};
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function initialConfiguration(basis: Offering["quantityBasis"]): Configuration {
  if (basis === "HEADCOUNT_DUTY")
    return { headcount: "1", dutyUnitsPerPerson: "1" };
  const result: Configuration = { quantity: "1" };
  if (["AREA_LW", "AREA_LH", "LINEAR", "VOLUME"].includes(basis))
    result.length = { value: "10", unit: "FT" };
  if (["AREA_LW", "VOLUME"].includes(basis))
    result.width = { value: "10", unit: "FT" };
  if (["AREA_LH", "VOLUME"].includes(basis))
    result.height = { value: "10", unit: "FT" };
  return result;
}

export function QuoteWorkspace() {
  const [catalogue, setCatalogue] = useState<Offering[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [type, setType] = useState<"CLIENT" | "VENDOR">("CLIENT");
  const [lines, setLines] = useState<Line[]>([]);
  const [packageLines, setPackageLines] = useState<PackageLine[]>([]);
  const [search, setSearch] = useState("");
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [eventDays, setEventDays] = useState(4);
  const [tax, setTax] = useState(18);
  const [company, setCompany] = useState("");
  const [project, setProject] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");
  const side: Side = type === "CLIENT" ? "TO_CLIENT" : "TO_VENDOR";
  useEffect(() => {
    setLines([]);
    setPackageLines([]);
    Promise.all([
      fetch(`/api/normalized-offerings?side=${side}`),
      fetch(`/api/packages?side=${side}`),
    ])
      .then(async ([offeringsResponse, packagesResponse]) => {
        if (!offeringsResponse.ok || !packagesResponse.ok) throw new Error();
        setCatalogue((await offeringsResponse.json()).offerings);
        setPackages((await packagesResponse.json()).packages);
      })
      .catch(() => setStatus("Could not load the normalized catalogue."));
  }, [side]);
  const results = catalogue.filter((item) =>
    `${item.code} ${item.name} ${item.canonicalCode ?? ""} ${item.canonicalName ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totals = useMemo(() => {
    const all = [...lines, ...packageLines];
    const sub = all.reduce(
      (total, line) => total + (line.preview?.finalAmountPaise ?? 0),
      0,
    );
    const discount = all.reduce(
      (total, line) =>
        total +
        Math.round(
          ((line.preview?.finalAmountPaise ?? 0) * line.discountPercent) / 100,
        ),
      0,
    );
    const taxTotal = Math.round(((sub - discount) * tax) / 100);
    return { sub, discount, taxTotal, total: sub - discount + taxTotal };
  }, [lines, packageLines, tax]);
  const update = (index: number, change: (line: Line) => Line) =>
    setLines((old) =>
      old.map((line, i) => (i === index ? change(line) : line)),
    );
  const setDimension = (
    index: number,
    field: "length" | "width" | "height",
    key: "value" | "unit",
    value: string,
  ) =>
    update(index, (line) => ({
      ...line,
      preview: null,
      ["configuration"]: {
        ...line.configuration,
        [field]: {
          ...(line.configuration[field] ?? { value: "", unit: "FT" }),
          [key]: value,
        },
      } as Line["configuration"],
    }));
  async function preview(index: number) {
    const line = lines[index];
    const response = await fetch("/api/normalized-offerings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commercialOfferingId: line.offering.id,
        side,
        configuration: line.configuration,
        usageDays: line.usageDays || String(eventDays),
        expectedPriceId: line.offering.priceId,
      }),
    });
    const result = await response.json();
    update(index, (current) =>
      response.ok
        ? { ...current, preview: result.calculation, error: "" }
        : {
            ...current,
            preview: null,
            error: result.error ?? result.code ?? "Preview unavailable",
          },
    );
  }
  async function previewPackage(index: number) {
    const line = packageLines[index];
    const response = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageTemplateId: line.pkg.id,
        packageQuantity: line.packageQuantity,
        side,
        usageDays: String(eventDays),
      }),
    });
    const result = await response.json();
    setPackageLines((old) =>
      old.map((current, i) =>
        i === index
          ? response.ok
            ? { ...current, preview: result.calculation, error: "" }
            : {
                ...current,
                preview: null,
                error: result.error ?? result.code ?? "Preview unavailable",
              }
          : current,
      ),
    );
  }
  async function saveDraft() {
    setStatus("");
    if (company.trim().length < 2)
      return setStatus("Enter a company name with at least 2 characters.");
    if (!lines.length && !packageLines.length)
      return setStatus("Add at least one normalized offering or package.");
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "NORMALIZED",
        type,
        company,
        project,
        venue,
        city,
        eventDays,
        taxPercentage: tax,
        lines: lines.map((line) => ({
          commercialOfferingId: line.offering.id,
          configuration: line.configuration,
          usageDays: line.usageDays || undefined,
          expectedPriceId: line.offering.priceId,
          discountPercent: line.discountPercent,
        })),
        packages: packageLines.map((line) => ({
          packageTemplateId: line.pkg.id,
          packageQuantity: line.packageQuantity,
          usageDays: String(eventDays),
          discountPercent: line.discountPercent,
        })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setStatus(
      response.ok
        ? `Normalized draft ${result.number} saved.`
        : typeof result.error === "string"
          ? `${result.code ?? "ERROR"}: ${result.error}`
          : (result.code ?? "Could not save the draft."),
    );
  }
  return (
    <main className="app">
      <AppSidebar />
      <section className="content">
        <header>
          <div>
            <small>NORMALIZED QUOTATION / DRAFT</small>
            <h1>Create a quote</h1>
            <p>Current approved items, personnel, and package recipes.</p>
          </div>
          <button className="primary" onClick={saveDraft}>
            Save immutable revision
          </button>
        </header>
        {status && <p className="notice">{status}</p>}
        <p className="steps">
          <span>1</span> Details <span>2</span> Configure and preview{" "}
          <span>3</span> Server-validated snapshot
        </p>
        <div className="grid">
          <article>
            <h2>Quote details</h2>
            <p className="toggle">
              <button
                className={type === "CLIENT" ? "chosen" : ""}
                onClick={() => setType("CLIENT")}
              >
                Offer to client
              </button>
              <button
                className={type === "VENDOR" ? "chosen" : ""}
                onClick={() => setType("VENDOR")}
              >
                Offer to vendor
              </button>
            </p>
            <div className="fields">
              <label>
                Company
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
              <label>
                Project
                <input
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                />
              </label>
              <label>
                Venue
                <input
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                Event days
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={eventDays}
                  onChange={(e) =>
                    setEventDays(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </label>
            </div>
          </article>
          <article className="total">
            <small>{type} QUOTE PREVIEW</small>
            <strong>{money.format(totals.total / 100)}</strong>
            <p>
              Subtotal <b>{money.format(totals.sub / 100)}</b>
            </p>
            <p>
              Discount <b>−{money.format(totals.discount / 100)}</b>
            </p>
            <p>
              GST ({tax}%) <b>{money.format(totals.taxTotal / 100)}</b>
            </p>
            <label>
              Tax rate
              <input
                type="number"
                value={tax}
                onChange={(e) => setTax(Number(e.target.value))}
              />
            </label>
          </article>
        </div>
        <article>
          <div className="sectionTitle">
            <div>
              <small>NORMALIZED CATALOGUE</small>
              <h2>Offerings</h2>
            </div>
            <em>
              {catalogue.length} selectable · {lines.length} selected
            </em>
          </div>
          {catalogue.length === 0 && packages.length === 0 && <p className="notice">No production catalogue release has been loaded.</p>}
          <div className="search">
            <input
              placeholder="Search offering or canonical code/name"
              value={search}
              onFocus={() => setCatalogueOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setCatalogueOpen(true);
              }}
              onBlur={() =>
                window.setTimeout(() => setCatalogueOpen(false), 150)
              }
            />
            {catalogueOpen && (
              <div>
                {results.slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setLines((old) => [
                        ...old,
                        {
                          offering: item,
                          configuration: initialConfiguration(
                            item.quantityBasis,
                          ),
                          usageDays: "",
                          discountPercent: 0,
                          preview: null,
                          error: "",
                        },
                      ]);
                      setSearch("");
                      setCatalogueOpen(false);
                    }}
                  >
                    {item.name}
                    <small>
                      {item.code} · {item.canonicalName ?? "—"} ·{" "}
                      {item.pricingFamily === "HEADCOUNT_DUTY"
                        ? "Personnel · Rate / Duty"
                        : `${item.quantityBasis} · ${item.durationPolicyCode}`}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {lines.map((line, index) => {
            const personnel = line.offering.pricingFamily === "HEADCOUNT_DUTY";
            return (
              <div
                className="normalizedLine"
                key={`${line.offering.id}-${index}`}
              >
                <header>
                  <span>
                    <b>{line.offering.name}</b>
                    <small>
                      {line.offering.code} ·{" "}
                      {personnel
                        ? "Personnel · DUTY"
                        : `${line.offering.quantityBasis} · ${line.offering.billingUnit} · ${line.offering.durationPolicyCode}`}
                    </small>
                  </span>
                  <button
                    className="remove"
                    onClick={() =>
                      setLines((old) => old.filter((_, i) => i !== index))
                    }
                  >
                    ×
                  </button>
                </header>
                <div className="configurationGrid">
                  {personnel ? (
                    <>
                      <label>
                        Headcount
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.configuration.headcount ?? ""}
                          onChange={(e) =>
                            update(index, (old) => ({
                              ...old,
                              preview: null,
                              configuration: {
                                ...old.configuration,
                                headcount: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Duties / Person
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.configuration.dutyUnitsPerPerson ?? ""}
                          onChange={(e) =>
                            update(index, (old) => ({
                              ...old,
                              preview: null,
                              configuration: {
                                ...old.configuration,
                                dutyUnitsPerPerson: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Quantity
                        <input
                          value={line.configuration.quantity ?? ""}
                          onChange={(e) =>
                            update(index, (old) => ({
                              ...old,
                              preview: null,
                              configuration: {
                                ...old.configuration,
                                quantity: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      {(["length", "width", "height"] as const)
                        .filter((field) => line.configuration[field])
                        .map((field) => (
                          <label key={field}>
                            {field}
                            <div className="measurement">
                              <input
                                value={line.configuration[field]!.value}
                                onChange={(e) =>
                                  setDimension(
                                    index,
                                    field,
                                    "value",
                                    e.target.value,
                                  )
                                }
                              />
                              <select
                                value={line.configuration[field]!.unit}
                                onChange={(e) =>
                                  setDimension(
                                    index,
                                    field,
                                    "unit",
                                    e.target.value,
                                  )
                                }
                              >
                                <option>FT</option>
                                <option>M</option>
                              </select>
                            </div>
                          </label>
                        ))}
                      <label>
                        Usage days override
                        <input
                          placeholder={`Default ${eventDays}`}
                          value={line.usageDays}
                          onChange={(e) =>
                            update(index, (old) => ({
                              ...old,
                              preview: null,
                              usageDays: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Discount %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={line.discountPercent}
                      onChange={(e) =>
                        update(index, (old) => ({
                          ...old,
                          discountPercent: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <button onClick={() => void preview(index)}>Preview</button>
                </div>
                {line.error && <p className="lineError">{line.error}</p>}
                {line.preview && (
                  <p className="previewResult">
                    {personnel ? (
                      <>
                        Headcount {line.preview.headcount} · Duties / Person{" "}
                        {line.preview.dutyUnitsPerPerson} · Billable Duties{" "}
                        {line.preview.billableQuantity} · Rate / Duty{" "}
                        {money.format(line.offering.unitRatePaise / 100)} ·{" "}
                      </>
                    ) : (
                      <>
                        Billable {line.preview.billableQuantity}{" "}
                        {line.offering.billingUnit} · usage{" "}
                        {line.preview.usageDays} days ·{" "}
                        {line.preview.chargeUnits} charge units ·{" "}
                      </>
                    )}
                    <b>{money.format(line.preview.finalAmountPaise / 100)}</b>
                  </p>
                )}
              </div>
            );
          })}
          <div className="sectionTitle">
            <div><small>PACKAGE RECIPES</small><h2>Packages</h2></div>
            <em>{packages.length} ready · {packageLines.length} selected</em>
          </div>
          {packages.map((pkg) => (
            <button key={pkg.id} onClick={() => setPackageLines((old) => [...old, { pkg, packageQuantity: "1", discountPercent: 0, preview: null, error: "" }])}>
              {pkg.name}<small>{pkg.code} · v{pkg.version} · PACKAGE · {pkg.pricingMode}</small>
            </button>
          ))}
          {packageLines.map((line, index) => (
            <div className="normalizedLine" key={`${line.pkg.id}-${index}`}>
              <header><span><b>{line.pkg.name}</b><small>{line.pkg.code} · Package v{line.pkg.version} · {line.pkg.pricingMode}</small></span><button className="remove" onClick={() => setPackageLines((old) => old.filter((_, i) => i !== index))}>×</button></header>
              <div className="configurationGrid">
                <label>Package quantity<input value={line.packageQuantity} onChange={(e) => setPackageLines((old) => old.map((current, i) => i === index ? { ...current, packageQuantity: e.target.value, preview: null } : current))} /></label>
                <label>Discount %<input type="number" min="0" max="100" value={line.discountPercent} onChange={(e) => setPackageLines((old) => old.map((current, i) => i === index ? { ...current, discountPercent: Number(e.target.value) } : current))} /></label>
                <button onClick={() => void previewPackage(index)}>Preview package</button>
              </div>
              <p>{line.pkg.components.map((component) => `${component.name} × ${component.quantity} (${component.billingMode})`).join(" · ")}</p>
              {line.error && <p className="lineError">{line.error}</p>}
              {line.preview && <p className="previewResult">{line.preview.componentResults.map((component) => `${component.offering.name}: ${component.resolvedQuantity} ${component.billingMode === "INCLUDED" ? "included" : money.format(component.finalAmountPaise / 100)}`).join(" · ")} · <b>{money.format(line.preview.finalAmountPaise / 100)}</b></p>}
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
