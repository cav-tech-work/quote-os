# QuoteOS MVP Delivery Plan

## 1. Product outcome

QuoteOS replaces spreadsheet-based quotation preparation for Clockwork AV. The MVP enables authorised staff to create, find, duplicate, issue, and track professional client and vendor quotations from a centrally administered catalogue.

The MVP succeeds when a quote user can produce a correct branded PDF in under five minutes, while past quotations remain financially accurate after any future catalogue change.

## 2. MVP boundary

### In scope

- Secure login and role-based access: `ADMIN` and `QUOTE_USER`.
- Catalogue management: categories, searchable items, active/archive state, client and vendor day rates, tax category, discount eligibility, and CSV import/export.
- Quote creation for client and vendor quote types.
- Draft editing, duplication, status tracking, searchable quote history, and full audit timestamps.
- Snapshotting of item name, rate, tax inputs, and line calculations at the time of quote creation.
- Professional, versioned PDF generation and email hand-off/delivery.
- Admin settings: company identity, GST/tax settings, default terms, bank details, signatory, and PDF theme/logo.

### Explicitly deferred

- Monark specification import and ProjectOS conversion.
- Package/bundle library, recommendation engine, margin analytics, and client-spend analytics.
- Automated creation of folders, calendar events, chat spaces, tasks, or Rider sessions.
- Complex approval workflows, multi-entity accounting, and multi-currency FX conversion. (Currency may be selected and displayed, but conversion is out of scope.)

## 3. Product decisions to lock before implementation

1. **Quote number policy:** use a database-issued, human-readable sequence such as `QT-2026-000153`; never reuse numbers.
2. **Money and rounding:** store monetary values as integer paise/cents, never floating point. Define one tax rounding rule (recommended: round tax at quote total) and test it.
3. **Tax model:** MVP supports one quote-wide tax mode and percentage, with item tax categories reserved for a later per-line tax expansion unless GST rules require line tax immediately.
4. **Editing policy:** drafts are editable. Once generated/sent, changes create a new revision or a duplicated quote; issued PDF records remain immutable. Recommended implementation: lock generated revisions and provide “create revision”.
5. **Deletion policy:** quotes are never deleted. Catalogue items may be archived; hard deletion only permitted when an item has never appeared on a quote.
6. **Email provider:** select the company’s transactional email service and define sender domain/authentication. This is a release dependency.
7. **PDF template:** approve one branded template and one standard terms layout before PDF implementation.

## 4. Recommended architecture

Build a responsive web application with a modular monolith architecture. Keep the API and database as the system of record; generate PDFs from the server so results are stable and auditable.

| Layer | Responsibility | Recommendation |
|---|---|---|
| Web client | Quote builder, catalogue, repository, settings | TypeScript + React/Next.js |
| Application API | Auth, permissions, calculations, workflows | TypeScript server routes/service layer |
| Relational database | Transactions, immutable snapshots, search | PostgreSQL |
| Document storage | Logos and generated PDF files | Private object storage |
| Worker/queue | PDF rendering and email delivery | Managed queue/worker; synchronous fallback for MVP |
| Observability | Errors, audit visibility, job failures | Structured logs + error tracking |

Use a relational database and database transactions for quote creation/revision. Do not calculate authoritative totals only in the browser.

## 5. Domain model

The vision’s entities should be normalised into the following initial schema.

| Entity | Key fields and rules |
|---|---|
| `users` | Name, email, role, active state. Deactivation prevents new sessions without removing history. |
| `catalogue_categories` | Name, optional parent. Supports category/subcategory hierarchy. |
| `catalogue_items` | Stable item code, category, item details, vendor/client rates, unit, discount eligibility, tax category, active/archive metadata. |
| `quotes` | Immutable quote identity/number plus current revision, client/project/venue metadata, quote type, status, currency, tax mode, totals, created/modified audit fields. |
| `quote_revisions` | Revision number and a complete immutable commercial snapshot. Required to preserve every issued version. |
| `quote_lines` | Belongs to a revision; item reference plus item-name/rate/unit/tax snapshots, quantity, days, discount, remarks, calculated amounts. |
| `quote_events` | Append-only audit events: created, revised, generated, sent, status changed. |
| `generated_documents` | Revision, template version, storage key, checksum, generated timestamp, generator user. |
| `settings` | Versioned company and quotation defaults; preserve settings snapshot on each quote revision. |

Critical invariants:

- A line’s `rate_used`, item description, unit, discount, and tax inputs are copied into `quote_lines`.
- Generated PDFs point to a particular quote revision and template version.
- Catalogue edits/archives never update quote snapshots.
- Status changes are append-only events with actor and timestamp.
- Server-side calculations are recomputed from submitted line inputs and persisted atomically.

## 6. Key workflows and acceptance criteria

### Quote user

1. Create draft; enter quote details and select client/vendor type.
2. Search an active catalogue by code, name, category, subcategory, manufacturer, or model.
3. Add lines; enter quantity, days, discount, and remarks. The appropriate client/vendor rate is selected automatically.
4. Review server-calculated subtotal, discount, tax, and grand total.
5. Save, duplicate, generate PDF, mark as sent, and find historical records.

Acceptance criteria:

- Inactive/archived items cannot be newly added, but appear correctly on historic quotes.
- A quote user cannot access rate, tax, template, or user administration actions.
- Duplicating a quote creates a new quote number and a fresh editable revision while retaining copied snapshots.
- Generation produces a readable branded PDF that matches displayed totals and is retained with the revision.
- Repository filters cover quote number, company/client, project, venue, city, salesperson, preparer, date range, status, and amount range.

### Admin

1. Manage users (if identity provider is not authoritative), catalogue, rates, taxes, terms, and template settings.
2. Import a catalogue CSV through preview, validation, error download, and explicit confirmation.
3. Archive/restore items; use guarded hard deletion only for unused items.
4. Export the catalogue and view basic pricing activity.

Acceptance criteria:

- Every catalogue and configuration change records actor, before/after values, and timestamp.
- Import is all-or-nothing per confirmed batch, with duplicate code and invalid money validation.
- No quote user can invoke admin API endpoints, even by manipulating the UI.

## 7. Delivery sequence

| Milestone | Deliverable | Exit criteria |
|---|---|---|
| 0. Discovery (1 week) | Approved decisions, PDF sample, rate-card source, import format, identity/email choices | Product owner signs off scope and calculation rules. |
| 1. Foundation (1-2 weeks) | App shell, authentication, RBAC, database migrations, audit framework, CI/CD, test environment | Admin/quote user access is enforced in UI and API. |
| 2. Catalogue (1-2 weeks) | Category/item CRUD, archive/restore, CSV import/export, search | A real rate card imports cleanly and admin controls work. |
| 3. Quote core (2-3 weeks) | Draft builder, calculation engine, snapshots, statuses, duplication, repository search | End-to-end quote creation passes calculation and permission tests. |
| 4. Documents and sending (1-2 weeks) | Branded PDF, document retention, email integration, send audit | Approved sample PDFs match the web totals and can be sent safely. |
| 5. UAT and launch (1-2 weeks) | Data migration, training, security review, monitoring, production rollout | Users complete real quoting scenarios; cutover owner approves launch. |

Indicative MVP duration: **7-12 weeks**, depending mainly on rate-card quality, final PDF design, identity integration, and email-provider readiness.

## 8. Quality, security, and operations

- Enforce role checks server-side; use managed authentication, secure sessions, and least privilege.
- Protect GST/bank details, PDFs, and logs with private storage, encryption in transit/at rest, and access logging.
- Validate all monetary/quantity inputs and use transactional persistence.
- Maintain daily database backups and document recovery targets before production launch.
- Add automated tests for calculations, rate selection, tax/rounding, immutability, state transitions, RBAC, and CSV validation.
- Add end-to-end tests for create → generate → send → search → duplicate.
- Track PDF/email job failures, audit access, latency, and errors; set a responsible owner for each alert.

## 9. Migration and launch checklist

1. Clean and map the current spreadsheet rate card to a reviewed import template.
2. Import to staging, reconcile record counts and 20-30 representative rates, then obtain commercial sign-off.
3. Configure logo, terms, GST, bank information, and sender identity; approve sample client and vendor PDFs.
4. Train quote users on draft/revision rules and admins on catalogue changes.
5. Run a short parallel period with selected quotations, resolve discrepancies, then designate QuoteOS as the rate and quotation source of truth.
6. Freeze spreadsheet editing or clearly mark it read-only after cutover.

## 10. Backlog after MVP

Prioritise based on observed usage: rate version history UI, reusable packages, richer tax handling, approval controls, pricing/margin analytics, Monark import, and ProjectOS conversion. Each integration should use a documented API contract and idempotent event handling so quotes cannot be duplicated or changed unexpectedly.
