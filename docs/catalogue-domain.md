# Normalized catalogue domain contract

Status: Phase 2 guarded-apply foundation, 12 August 2026. The normalized catalogue is additive and has no user-facing consumers yet. The legacy `CatalogueCategory` / `CatalogueItem` catalogue remains authoritative for the current application until an explicit cutover phase.

Phase 1 adds a pure, deterministic preview parser. `CAV_Rates_VC_Ops_Power_v120826.xlsx` is the only active commercial-master authority: `RateChart.ToClients` and `RateChart.ToVendors` are independent candidate global prices, while `LookUp` supplies normalization evidence. City columns are reported only as later `RateObservation` candidates. `VCxOpsxPower_Master_VenueWise.xlsx` remains operational evidence, and city/event workbooks remain historical evidence.

## Evidence and authority

The contract was checked against `CAV_Rates_VC_Ops_Power_v120826.xlsx`, `VCxOpsxPower_Master_VenueWise.xlsx`, `Master_Rate_Chart_.xlsx`, and the supplied Bengaluru, Chennai, Delhi, Gurugram, Guwahati, Jaipur, Kolkata, and Pune event workbooks. No workbook rows were imported.

Four source-authority tiers are intentionally separate:

1. **Active commercial master** — approved current `ToClients` and `ToVendors` values may produce active `Price` rows after validation. The two sides are independent.
2. **Normalization vocabulary** — lookup codes, aliases, parent mappings, tags, and categories inform `CanonicalItem`, `Alias`, and `SourceMapping`; they are not prices.
3. **Operational business logic** — venue-master formulas and settings are evidence for quantity basis, duration basis, charge-day policy, generator logic, and configuration semantics. They are not active price authority.
4. **Historical observation** — city/event workbook quantities, rates, packages, and deployment choices may produce `RateObservation` and mapping evidence. They never automatically overwrite `Price`.

The workbooks confirm the proposed separation. `RateChart` has independent `ToClients`, `ToVendors`, and city columns; examples include client/vendor values that are unequal in either direction, so no fixed markup is valid. `LookUp` maps deployment-specific source codes such as `PLAT_CAMERISE` to a parent/canonical concept. Venue and city sheets combine dimensions, quantities, days/duties, packages, and contextual descriptions. Their variable shapes reinforce preserving raw provenance and treating them as evidence rather than flattening them into live SKUs.

## Core concepts

### CanonicalItem

The stable answer to “what is the general thing?” Examples are `PLAT_GREY` (Platform with Grey Carpet), `MET_RAIL` (Metal Railing), `OCT` (Octonorm), and `GUARD_F` (Female Security Guard). Canonical identity does not encode a venue, deployment, package, or context unless that distinction changes what the thing fundamentally is. A canonical item may have several commercial offerings and never bears a price directly.

### CommercialOffering

The rate-bearing answer to “how is this version supplied and billed?” It has a bounded billing unit, quantity basis, and duration basis. Several offerings may reference one canonical item; a service/package may temporarily have no canonical item. `ITEM`, `SERVICE`, and forward-compatible `PACKAGE` kinds describe the commercial form, but package composition is deferred.

### Price

An approved integer-minor-unit rate attached only to a `CommercialOffering`. `TO_CLIENT` and `TO_VENDOR` rows are independent: either may exist without the other and neither is calculated from the other. An amount of zero is a valid approved price; absence of a row means no approved price. V1 stores `GLOBAL` and `CITY` scope, but later quote resolution will initially use only `GLOBAL`. `CITY` requires a `RateMarket`; `GLOBAL` has none. Effective dates allow history without imposing premature overlap/precedence rules.

### Alias

One normalized search term plus its original text, source, weight, and active state. An alias targets exactly one real `CanonicalItem` or `CommercialOffering` relation. Comma-separated lookup tags will later be split into rows rather than retained as the final search representation.

### SourceMapping

An auditable source fact and its normalized interpretation. It retains source system/file/sheet, code, description, confidence, validation state, notes, and optional import provenance. It may point to a canonical item, offering, or both: a source code can identify a general concept and the particular commercial form inferred from it. Source codes remain traceable and never become canonical identity merely because they are historic.

### RateObservation

Historical/source commercial evidence, not approved price authority. It captures the useful common fields (raw identity, city/market, rate, unit, quantity, dimensions, days) and retains source-specific facts in JSON metadata. Creating an observation has no database or application path that creates or updates a `Price`.

### ImportBatch and ImportRow

`ImportBatch` identifies a source-authority type, filename, content hash, lifecycle status, optional creator, counts, timestamps, and metadata. Source type plus file hash is unique for idempotency. `ImportRow` preserves sheet, row number, raw JSON, row hash, status, and message for deterministic preview and audit. Approved prices, mappings, and observations may point back to their batch.

## Units and calculation contracts

Units are deliberately bounded: `M`, `FT`, `SQ_M`, `SQ_FT`, `RFT`, `CBM`, `NOS`, `DAY`, `DUTY`, `LITRE`, `SET`, and `LUMPSUM`. This is an operational vocabulary, not a generic scientific unit system.

The later calculation flow is:

```text
configuration parameter unit
→ explicit conversion
→ offering billing unit
→ billable quantity
```

No conversion or calculation engine is part of Phase 0.

Quantity bases have these future meanings:

| Basis | Billable quantity |
| --- | --- |
| `COUNT` | quantity |
| `AREA_LW` | length × width × quantity |
| `AREA_LH` | length × height × quantity |
| `LINEAR` | length × quantity |
| `VOLUME` | length × width × height × quantity |
| `HEADCOUNT_DUTY` | headcount × duties |
| `FIXED` | fixed billable quantity |
| `MANUAL` | explicitly entered commercial value |
| `GENERATOR` | specialized hire plus fuel calculation |

Duration bases are `ONE_OFF`, `VC_CHARGE_DAYS`, `OPS_CHARGE_DAYS`, `POWER_CHARGE_DAYS`, `DUTY`, and `MANUAL`. A later quote revision should snapshot resolved `eventDays`, `vcChargeDays`, `opsChargeDays`, and `powerChargeDays`. Divisors/policies explain derivation; the resolved values are the authoritative commercial snapshot.

## Concepts intentionally deferred

- `UsagePreset` (for example camera-riser or main-PA-power deployment intelligence)
- `ContextPreset` (editable suggestions such as green room, box office, or food-stall area)
- `PackageTemplate` / `PackageComponent`, included-component behavior, recipes, and package pricing
- offering parameters and configuration dimensions/options
- conversions, quantity/duration calculations, generator calculations, and `HEADCOUNT_DUTY` execution
- import parsing, preview UI, search ranking, active price resolution, city precedence, quote snapshots, and all legacy cutover work

Package composition and package pricing will remain separate to prevent double charging. Usage and context describe deployment; neither redefines canonical identity or automatically creates a commercial package.

## Compatibility and technical debt

The current quote builder, APIs, PDFs, and historic `QuoteLine` snapshots continue to use the legacy flat catalogue. That legacy path still contains the 40% client-from-vendor rule; it is documented technical debt and is not represented in the normalized models. Production startup remains migration-only. The next bounded phase is the normalized catalogue and rate-management admin dashboard, with no quote-flow cutover or CITY resolution.

The preview command is:

```text
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --json
npm run catalogue:preview -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --output preview.json
```

It hashes the file and source rows, detects headers, parses `RateChart` and `LookUp` into typed intermediate candidates, and performs no Prisma/database operation. Known source-review items are unmapped RateChart codes (especially power and tour-specific lines), the raw unit `unit`, aliases shared by incompatible canonical targets, and tour-specific rows whose section does not determine a duration basis. Only the separate guarded apply command may populate normalized data.

## Review and guarded apply policy

`catalogue-import-decisions.json` is version-controlled human interpretation, not duplicated source data. It is bound to the exact workbook SHA-256, parser version, review schema version, and authority type. Deterministic conflict-free mappings and known billing units are explicitly auto-approved by policy. Anything review-required defaults to `DEFER`; absence never means approval. Decisions may be `APPROVE`, `DEFER`, or `REJECT`.

Candidate-blocking conditions are unmapped/ambiguous/invalid identity, unknown billing unit, duplicate source code, invalid active master rate, or a formula error. Conflicting aliases block only those alias rows. Unknown calculation semantics such as `AREA_LW` versus `AREA_LH`, nullable entity/offering kind, and uncertain duration basis are informational because Phase 2 does not execute calculations; the schema retains them as null rather than inventing behavior. City values remain preview-only historical evidence.

```text
npm run catalogue:review -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx
npm run catalogue:apply -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --decisions ./catalogue-import-decisions.json
npm run catalogue:apply -- /absolute/path/to/CAV_Rates_VC_Ops_Power_v120826.xlsx --decisions ./catalogue-import-decisions.json --apply
```

The first apply command is a database-aware dry-run. Only the separate command containing `--apply` may mutate data. It verifies both hashes, regenerates the Phase 1 preview, validates decisions, and performs one PostgreSQL transaction containing provenance and approved normalized records. An already-applied identical workbook/decision pair is a no-op. The importer never creates `RateObservation`, `RateMarket`, or CITY `Price` records.

The permanent normalized admin architecture must expose approved rates as a matrix of `CommercialOffering × (TO_CLIENT | TO_VENDOR) × (GLOBAL | CITY/RateMarket)`. V1 quote resolution remains GLOBAL-only. Future CITY management must use the existing `Price.scopeType` and `RateMarket` model rather than redesigning offering identity or price ownership.
