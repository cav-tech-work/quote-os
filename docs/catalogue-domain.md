# Normalized catalogue domain contract

Status: Phase 7 normalized ordinary and approved personnel quote-line snapshots, 14 August 2026. The normalized catalogue is populated, administrable, and used for new quote creation. Legacy `CatalogueCategory` / `CatalogueItem` records remain available only for explicit compatibility with historical legacy quote lines.

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

Administrator changes are append-only: replacement closes the prior row and creates a current row; clearing closes it without a replacement. Partial unique indexes enforce one active GLOBAL price per offering/side and one active CITY price per offering/side/market. `PriceAuditEvent` records actor, offering, side, scope, market, CREATE/REPLACE/CLEAR action, old/new price references, required reason, and timestamp. Mutations require the current price ID observed by the editor, so stale writes fail instead of overwriting newer work.

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

Phase 4 implements a deliberately bounded calculation engine. Decimal configuration values are accepted as strings and represented as reduced `BigInt` rational numbers. The international foot is exact (`1 ft = 0.3048 m = 381/1250 m`); therefore `1 m = 1250/381 ft` and `1 m² = 1,562,500/145,161 ft²`. Area conversion uses the direct square factor rather than a rounded length conversion. `RFT` means running feet. Foot-based volume dimensions are independently normalized to metres before multiplication, producing cubic metres for `CBM`.

Measurement arithmetic remains exact internally. Public billable-quantity strings are rounded half-up to at most 12 decimal places for stable snapshots and display; that representation is not fed back into monetary arithmetic. The exact rational quantity is multiplied by integer paise and rounded half-up exactly once to produce `baseAmountPaise`. COUNT and FIXED quantities must be whole units because the current source evidence does not approve fractional commercial counts.

Quantity bases have these future meanings:

| Basis | Billable quantity |
| --- | --- |
| `COUNT` | quantity |
| `AREA_LW` | length × width × quantity |
| `AREA_LH` | length × height × quantity |
| `LINEAR` | length × quantity |
| `VOLUME` | length × width × height × quantity |
| `HEADCOUNT_DUTY` | specialized personnel path only when `pricingFamily=HEADCOUNT_DUTY` is explicitly approved; headcount × duties/person, billed in DUTY |
| `FIXED` | fixed billable quantity |
| `MANUAL` | deferred; typed manual-required state |
| `GENERATOR` | deferred; typed manual/unsupported state |

Duration bases are `ONE_OFF`, `VC_CHARGE_DAYS`, `OPS_CHARGE_DAYS`, `POWER_CHARGE_DAYS`, `DUTY`, and `MANUAL`. A later quote revision should snapshot resolved `eventDays`, `vcChargeDays`, `opsChargeDays`, and `powerChargeDays`. Divisors/policies explain derivation; the resolved values are the authoritative commercial snapshot.

### Duration policies and charge units

`durationBasis` remains imported classification evidence and is not a runtime formula selector. Runtime calculation follows `CommercialOffering.durationPolicyId`. A `DurationPolicy` is bounded to `ONE_OFF`, `USAGE_DAYS`, `CURVE`, or `MANUAL`. `USAGE_DAYS` retains non-negative rational multiplier/minimum and explicit `NONE`, `CEIL`, `FLOOR`, or `HALF_UP` rounding. It computes `max(usageDays × numerator/denominator, minimum)` and then applies policy rounding. `ONE_OFF` always resolves one charge unit. `MANUAL` requires exact caller-supplied units.

`CURVE` stores exact rational points as first-class `DurationPolicyPoint` rows. V1 accepts positive whole `usageDays`, resolves only an exact configured point, and returns `DURATION_CURVE_VALUE_UNAVAILABLE` for an absent or fractional day. It never interpolates, extrapolates, repeats the final tier, or branches on policy/domain names. Optional headless `overrideChargeUnits` wins over normal resolution and records `OVERRIDE_USED`; the normal result records `POLICY_RESOLVED`. This is quotation-instance input only and does not mutate the policy or `QuoteLine`.

Policy calculation fields, including curve points, are immutable through administration. A mathematical change requires a new policy/version and audited offering reassignment, protecting future snapshots from silent reinterpretation. Assignments record actor, offering, old/new policies, reason, and timestamp. Inactive policies cannot be newly assigned. Policies carry explicit `INTERNAL_APPROVED`, `HISTORICAL_INTERNAL`, or `EXTERNAL_REFERENCE` authority; only active internally approved policies may be assigned to the active catalogue.

`Days Applies? = N` is strong one-off evidence where its source row is approved. `Y` only establishes duration sensitivity; it does not choose full-day, half-day, minimum, or rounding behavior. Domain likewise selects no math: VC may often use half-use-days and CCTV may share that same policy, while two VC offerings may legitimately use different policies. Usage days are line-level engine input, distinct from future quote-level event days.

Phase 5.6 records an explicit internal CAV commercial decision: reviewed reusable ordinary VC rental/fabrication elements use `HALF_USE_DAYS_MIN_1` (usage days × 1/2, minimum 1, no rounding). This is candidate and assignment data, never a runtime `domain == VC` rule. Review requires `Days Applies? = Y`, supported ordinary quantity semantics, normalized/source identity describing a reusable physical VC element, and exclusion of vanity, personnel, security, generator/fuel, package, manual, and ambiguous work. Reviewed CCTV equipment may share the policy by explicit assignment; CCTV duty/personnel does not. OPS has no automatic full-day or half-day policy.

Duration policy answers how time modifies commercial quantity or amount. It remains separate from a future price-model axis: `UNIT_RATE`, `FIXED_VARIANT`, `TIERED`, `FORMULA`, and `MANUAL`. Phase 5.5 does not add price schedules or tiers. Generator/fuel formulas, personnel duties, and package composition remain specialized.

The current-rate resolver accepts only offering, side, and time. It queries the normalized `Price` table for active/effective GLOBAL rows with no market. Outcomes are `RATE_FOUND`, `RATE_UNAVAILABLE`, or defensive `RATE_DATA_CONFLICT`. Explicit zero is found; client/vendor sides are independent; CITY and all legacy sources are ignored. Pricing readiness additionally distinguishes missing semantics, incomplete configuration, manual requirements, and schedule requirements.

### Semantic review and guarded apply

`catalogue-semantic-decisions.json` is a versioned, source-import-hash and catalogue-fingerprint-bound review set. The deterministic review lists every offering, source evidence, current/candidate quantity and duration semantics, reasoning, family, and blockers. Missing decisions mean `DEFER`, never approval. Apply is dry-run by default; `--apply` requires an active administrator identity and changes only `quantityBasis` and `durationPolicyId` in one transaction. Quantity and duration changes receive durable semantic audit records, duration assignments retain the Phase 5 assignment audit, stale fingerprints fail, and an identical reapply is a no-op without duplicate events.

The Phase 5.6 inventory additionally records GLOBAL rate availability, specialist status, commercial review bucket, confidence, and per-decision evidence. All 180 previously unresolved duration rows are explicit decisions: high-confidence ordinary VC elements are approved individually and exception/OPS/specialist rows are explicitly deferred.

```text
npm run catalogue:semantic-review
npm run catalogue:semantic-review -- --json
npm run catalogue:semantic-apply -- --decisions ./catalogue-semantic-decisions.json
npm run catalogue:semantic-apply -- --decisions ./catalogue-semantic-decisions.json --actor-email admin@example.com --apply
```

Ordinary readiness is derived rather than persisted. It requires a supported ordinary quantity basis, billing unit, active assigned policy, and current approved GLOBAL rate for the requested side, while excluding `HEADCOUNT_DUTY`, generators/fuel, packages, and manual pricing.

Personnel readiness is separate. It requires an active `HEADCOUNT_DUTY` offering, `DUTY` billing unit, an audited `pricingFamily=HEADCOUNT_DUTY` approval, and exactly one current GLOBAL Price for the requested side. It does not require or apply a DurationPolicy. The authoritative workbook contains 63 `nos/duty` rows (58 with Days Applies Y and five with N), but only 24 descriptions are explicitly approved as people-based personnel semantics; missing rates reduce selectable coverage to 23 client and 22 vendor offerings.

The exact engine accepts positive rational duty units for future-safe storage and API use. The Phase 7 builder intentionally exposes whole duties/person only because the current CAV workbook contains no evidence for fractional-duty entry.

## Concepts intentionally deferred

- `UsagePreset` (for example camera-riser or main-PA-power deployment intelligence)
- `ContextPreset` (editable suggestions such as green room, box office, or food-stall area)
- `PackageTemplate` / `PackageComponent`, included-component behavior, recipes, and package pricing
- offering parameters and configuration dimensions/options
- generator calculations and unresolved OPS equipment/composite `HEADCOUNT_DUTY` classifications
- preview UI, advanced search ranking, city precedence, specialized quote snapshots, and legacy retirement

Package composition and package pricing will remain separate to prevent double charging. Usage and context describe deployment; neither redefines canonical identity or automatically creates a commercial package.

## Compatibility and technical debt

New normalized quote creation searches `CommercialOffering`, renders quantity-basis-specific ordinary controls or explicit personnel headcount/duties controls, previews through the central server calculation engine, and recalculates inside a serializable persistence transaction. Ordinary selectability requires an active approved duration policy; personnel selectability requires explicit audited pricing-family approval instead. Both require one current GLOBAL rate for the requested side. CITY, opposite-side, legacy, external, and historical fallback paths are absent.

`QuoteRevision.eventDays` defaults each ordinary normalized line's `usageDays`; a line may provide its own usage duration. Personnel duties are always explicit and independent. `QuoteLine` retains legacy fields and adds discriminated nullable normalized snapshots for identity, configuration, exact quantity, price provenance, ordinary duration resolution or personnel headcount/duties, amounts, and bounded versions. Quote totals, readback, and PDF output use persisted line values without live recalculation.

Historical legacy quotes remain readable and PDF-compatible. No automatic legacy-to-normalized mapping exists. The old 40% client-from-vendor rule remains only in the explicit legacy compatibility POST contract and inventory flow; it is never a normalized fallback. Full multi-revision editing and generated-document retention remain later work.

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
