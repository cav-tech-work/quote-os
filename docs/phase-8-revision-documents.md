# Phase 8 revision lifecycle and retained documents

## Previous behavior

Quote creation produced one revision, but revisions had no explicit lifecycle state, clone/edit/issue operation, issuer identity, or one-draft invariant. Quote numbers combined timestamps and randomness. The PDF endpoint always rendered the latest revision using current application code and live Quote company/project/venue/city fields. `GeneratedDocument` contained a storage key and checksum but never retained bytes, so it was not an issued-document boundary.

## Lifecycle

- `DRAFT` is editable through server-authoritative normalized recalculation.
- Issue renders the reviewed draft, then obtains a PostgreSQL advisory lock and transactionally stores the exact PDF bytes, checksum, document metadata, and `ISSUED` transition. Renderer/storage failure leaves the revision DRAFT. A draft update detected between render and lock returns `REVISION_CHANGED`.
- Repeated or concurrent issue returns the existing official document. A unique `(revisionId, documentType, documentVersion)` key prevents duplicates.
- Creating a revision from ISSUED/SUPERSEDED obtains a quote advisory lock. The database unique revision number and partial unique DRAFT index protect monotonic numbering and the one-active-draft invariant.
- Cloning copies all commercial snapshots without repricing. Editing a cloned line recalculates only that line from current approved master data; untouched lines retain their copied values.
- Issuing a later revision marks earlier ISSUED revisions `SUPERSEDED`. Superseded revisions and documents remain immutable and retrievable.

The active draft is the unique revision with status DRAFT. Latest issued/current history is determined explicitly by status and descending `revisionNumber`, never array length.

## Numbering

`QuoteNumberCounter` atomically allocates `QT-YYYY-NNNNNN` numbers using PostgreSQL `INSERT … ON CONFLICT … RETURNING`. Revision creation uses an advisory lock plus the existing unique `(quoteId, revisionNumber)` constraint.

## Durable document storage

The canonical issued PDF is stored in PostgreSQL `bytea` with SHA-256, byte size, MIME type, filename, template version, document type/version, generator, and timestamp. This avoids Render's ephemeral filesystem and introduces no new cloud vendor. Database storage is intentionally appropriate for the current internal document volume; object storage can be added later without changing the immutable artifact contract.

Draft preview is dynamically rendered and marked `DRAFT PDF PREVIEW — NOT ISSUED`; it creates no GeneratedDocument. Issued retrieval reads and verifies retained bytes and advertises `RETAINED_ISSUED_DOCUMENT`. Pre-Phase-8 issued rows without retained bytes remain explicitly `LEGACY_REGENERATABLE`; regeneration is not represented as an original artifact.

## Metadata and audit

PDF-visible quote type, company, project, venue, city, salesperson and currency are revision snapshots. Tax, event days, notes, terms, totals, and lines were already revision-scoped; creation now snapshots default terms rather than resolving them during future rendering. QuoteEvent records revision creation/cloning, issue, supersession, update, and document retention with actor and revision/document identities.

Both ADMIN and QUOTE_USER retain existing create, edit, issue, history, preview, and issued-document access. No approval-role system or pricing behavior changed.
