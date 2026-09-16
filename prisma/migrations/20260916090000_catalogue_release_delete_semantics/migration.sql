-- Repair the CatalogueRelease immutability trigger so DELETE actually happens.
--
-- The original function (20260818130000_business_catalogue_review) ended with
-- `RETURN NEW`. NEW is NULL during a DELETE trigger, so PostgreSQL silently
-- skipped the delete for EVERY row -- including non-approved releases -- without
-- raising an error. UPDATE protection was unaffected because NEW is populated.
--
-- This is an additive CREATE OR REPLACE of the function only; the trigger
-- definition itself is unchanged. Permitted DELETEs now return OLD (the row) so
-- the delete proceeds, and the APPROVED immutability exception is unchanged.
--
-- Unchanged guarantees:
--   * APPROVED releases remain immutable and cannot be updated or deleted.
--   * UPDATE protection for APPROVED releases is identical.
CREATE OR REPLACE FUNCTION prevent_approved_catalogue_release_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved catalogue releases are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
