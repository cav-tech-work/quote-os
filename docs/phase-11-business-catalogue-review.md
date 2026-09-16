# Phase 11 — Business Catalogue Review and Release Candidates

## Approval boundary

Technical semantic decisions establish calculability; they do not authorize production use. `OfferingBusinessReview` is an independent offering decision with `UNREVIEWED`, `APPROVED`, `CHANGE_REQUIRED`, `DEFERRED`, and `REJECTED` states. Nine field decisions cover identity, category, billing unit, quantity, duration, both rate sides, active inclusion, and package treatment. Proposed corrections are evidence only and never mutate the commercial master.

Every decision records actor, old/new state, field/value where applicable, reason, and time. Existing price, semantic, duration, and package audits remain authoritative for commercial mutations.

## Workspace

`/admin/catalogue/review` is ADMIN-only. It combines normalized identity/semantics, canonical context, current GLOBAL rates including explicit zero, duration definitions/curve points, aliases, source evidence, package recipes, derived side readiness, field decisions, and audit history. Filters cover review state, readiness, pricing family, domain, missing rate side, and free-text source/alias/name search.

The 17 Phase 9 rows carry specific questions rather than a generic unsupported flag. Missing-rate queues remain distinct from semantic, duration, specialized, and package blockers.

Deterministic JSON export contains review status/comments plus a catalogue fingerprint. Guarded import may update those fields only; unknown/duplicate codes and stale fingerprints fail closed. It cannot change rates, semantics, policies, activation, or packages.

## CatalogueRelease

A release snapshots only business-`APPROVED`, provenance-backed offerings. It binds normalized semantics, active state, current Price IDs, DurationPolicy identity, active package versions, source mappings, source workbook hash, technical decision hashes, business decision hash, and catalogue fingerprint.

States are `DRAFT → READY_FOR_APPROVAL → APPROVED`. Approval requires at least one included offering, with every included offering ready for at least one side. Client and vendor coverage are reported independently; both are not guessed as mandatory. Deferred/rejected/unreviewed offerings are excluded without deleting evidence. Database and service guards make approved releases immutable.

Serialization sorts keys and business identities before SHA-256. Equivalent state produces the same fingerprint; changing an included rate, policy, package version, semantic field, or approved offering changes it.

## Future production bootstrap contract

Phase 11 does not bootstrap production. A later bootstrap must accept one `APPROVED CatalogueRelease.id`, verify its stored hashes/status, and transactionally materialize only:

1. Required CanonicalItems.
2. Approved CommercialOfferings and active state.
3. Referenced aliases and validated source mappings.
4. Referenced current Price IDs/values for each side.
5. Referenced DurationPolicies and curve points.
6. Referenced PackageTemplate versions and components.
7. Release identity, fingerprint, source hash, and bootstrap audit.

It must be idempotent by release identity/fingerprint, reject drift or unknown references, preserve source provenance, and never infer missing rows or rates. That bootstrap is intentionally not implemented here.

## Isolation

Migrations create review/release schema only. They create no decisions, releases, offerings, rates, packages, or bootstrap data. Production PostgreSQL was not accessed. Startup remains migration-only. Fixtures lacking validated business provenance cannot enter releases. Brand Profesor remains `EXTERNAL_REFERENCE` and excluded.
