# Phase 10 — Package / Recipe Engine

## Boundary and evidence

Phase 10 adds reusable, versioned package recipes without adding production package data. Phase 9 remains the authoritative review of unresolved composites: descriptions provide hints, but not the complete component identities, quantities, billing roles, duties, or package-rate unit required for promotion.

| Source row | Evidence present | Missing authority | Decision |
|---|---|---|---|
| MED_ALSIAMBU | ALS ambulance + MBBS doctor + nurse; aggregate client/vendor rates | Exact component offerings, quantities, duties, billing roles, duration and proof the rate is per package | DEFER |
| MED_BLSAMBU | BLS ambulance + MBBS doctor + nurse | Same contract facts; additionally no current rates | DEFER |
| MED_FIRSAID | First-aid counter + MBBS doctor + nurse | Counter composition, quantities/duties, billing roles and package price | DEFER |
| SEC_QUICRESP | Quick Response Team; aggregate client/vendor rates | Authoritative team composition, quantities, duties, billing roles and rate unit | DEFER |
| HK/WC/WTR candidates | Service descriptions only | Deterministic components, recurrence/duration and rate meaning | DEFER |

No guarded semantic field changed, so Phase 10 has no decision hash or semantic audit. The Phase 9 artifact remains unchanged.

## Model and version safety

`PackageTemplate` has a stable code plus explicit version, authority, activation state, pricing mode and optional parent package offering. `(code, version)` is unique. Administration creates versions and toggles activation; it does not expose component mutation. `PackageComponent` references an active non-package offering, has unique ordering, a positive exact quantity, a bounded rule, explicit `BILLABLE`/`INCLUDED` role and optional fixed duties/person. Nested packages and expressions are rejected.

- `FIXED`: quantity is independent of package quantity.
- `FIXED_PER_PACKAGE`: value × package quantity.
- `PARENT_QUANTITY_MULTIPLIER`: the same bounded multiplication, retained as explicit business vocabulary.

## Pricing and readiness

`COMPONENT_SUM` dispatches billable children to the existing ordinary or personnel calculator. Included children remain visible and contribute zero. `FIXED_PACKAGE` dispatches its PACKAGE-kind parent to the existing ordinary quantity/duration calculator and does not add child prices. `HYBRID` is schema-visible but fails closed in V1 because no approved package requires it.

Readiness is calculated separately by side. It requires an active `INTERNAL_APPROVED` template, valid active children, supported calculator families, required fixed personnel duties, requested-side current GLOBAL rates, approved duration policies, and a parent rate when fixed-package pricing applies. No opposite-side, CITY, historical, derived, or external rate is accepted.

Production-data readiness is currently 0 TO_CLIENT and 0 TO_VENDOR because no templates were populated. Tests create two controlled fixtures (`COMPONENT_SUM` and `FIXED_PACKAGE`); both are ready on both sides and are never bootstrapped.

## Snapshots and lifecycle

One parent `QuoteLine` contributes the final package amount once. Ordered `QuotePackageComponentSnapshot` records retain offering identity, billing role, quantity rule/value, resolved configuration/quantity, pricing family, rate/policy/personnel provenance and component amount. Included components remain visible with zero contribution.

Draft creation calculates from current approved data. Existing draft snapshots do not auto-refresh. Revision cloning copies parent and component snapshots. Issue/PDF uses persisted line state and retains exact bytes under Phase 8. Later template versions or rate/policy changes cannot alter historical package snapshots or documents.

## Surfaces and boundaries

- `/api/packages` lists side-ready packages and previews calculations.
- The builder distinguishes package recipes, exposes quantity/components, previews, and submits server-authoritative inputs.
- `/admin/packages` lists versions, status, modes, parents and ordered components. Admin APIs create versions and activate/deactivate them.
- The additive migration creates schema only—no package data or source promotion.
- Production PostgreSQL was not used. Startup remains migration-only.
- Brand Profesor remains immutable `EXTERNAL_REFERENCE`. Generators, attributes, variants, nested packages, conditions and formula expressions remain outside Phase 10.
