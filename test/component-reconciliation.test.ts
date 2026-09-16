import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildComponentReconciliationPreview } from "../lib/component-reconciliation/reconcile";
import { parseCciComponentLabels, parseLookupComponents } from "../lib/component-reconciliation/source";
import type { SourceProfile } from "../lib/component-reconciliation/types";
import type { WorkbookSheet } from "../lib/catalogue-import/types";

function lookupSheet(): WorkbookSheet {
  const rows = Array.from({ length: 166 }, () => Array(9).fill(null));
  rows[0] = ["Code", "Description", "Maps_To", "Kolkata_Rate", "BPH_Rate", "BPH_Unit", "comments", "Parent_Code", "Tags"];
  rows[1] = ["ELEM_A", "Pedestal Fan", "Fan", 999, 888, "nos", null, "PARENT_FAN", "pedestal fans, standing fan"];
  rows[2] = ["ELEM_B", "Stage Fan", "Fan", 999, 888, "nos", null, "PARENT_FAN", "stage fan"];
  rows[164] = ["ELEM_LAST", "Last allowed", "Last allowed", 999, 888, "nos", null, "PARENT_LAST", "last"];
  rows[165] = ["ROW_166", "Excluded", "Excluded", 999, 888, "nos", null, "EXCLUDED_PARENT", "excluded"];
  return { name: "LookUp", rows };
}

test("LookUp component authority is exactly rows 2 through 165", () => {
  const rows = parseLookupComponents([lookupSheet()]);
  assert.deepEqual(rows.map((row) => row.elementCode), ["ELEM_A", "ELEM_B", "ELEM_LAST"]);
  assert.equal(rows.at(-1)?.rowNumber, 165);
  assert.equal(rows.some((row) => row.elementCode === "ROW_166"), false);
  assert.equal(rows[0].parentCode, "PARENT_FAN");
});

test("CCI city headers deduplicate and geometry, Qty, SingleItemPrice and helpers are excluded", () => {
  const sheets: WorkbookSheet[] = [
    { name: "Mumbai", rows: [[], ["Octa L", "Octa B", "Area in Sqm", "Qty", "SingleItemPrice", "Total Oct Area", "Pedestal Fan"]] },
    { name: "Delhi", rows: [[], ["Pedestal Fans", "Pedestal Fan"]] },
  ];
  const parsed = parseCciComponentLabels(sheets);
  assert.deepEqual(parsed.included.map((item) => item.sourceLabel), ["Pedestal Fan", "Pedestal Fans"]);
  assert.deepEqual(parsed.included.find((item) => item.sourceLabel === "Pedestal Fan")?.cities, ["Delhi", "Mumbai"]);
  assert.deepEqual(parsed.excluded.map((item) => item.sourceLabel), ["Area in Sqm", "Octa B", "Octa L", "Qty", "SingleItemPrice", "Total Oct Area"]);
});

test("reconciliation preserves parent/element identity and applies only deterministic labels", () => {
  const lookupRows = parseLookupComponents([lookupSheet()]);
  const cci = parseCciComponentLabels([{ name: "Mumbai", rows: [[], ["Pedestal Fan", "standing fan", "Fan", "Mystery Thing"]] }]);
  const profile: SourceProfile = { lookupFile: "lookup.xlsx", lookupFileHash: "a".repeat(64), cciFile: "cci.xlsx", cciFileHash: "b".repeat(64), lookupRows, cciLabels: cci.included, excludedCciLabels: cci.excluded, lookupSheets: [], cciSheets: [] };
  const preview = buildComponentReconciliationPreview(profile, [{ id: "existing", code: "ELEM_A", name: "Pedestal Fan", canonicalCode: "PARENT_FAN", canonicalName: "Fan", aliases: [], sourceDescriptions: [] }]);
  assert.equal(preview.uniqueElementCodes, 3);
  assert.equal(preview.uniqueParentCodes, 2);
  assert.equal(preview.catalogue.find((item) => item.row.elementCode === "ELEM_A")?.state, "ALREADY_MATCHED");
  assert.equal(preview.catalogue.find((item) => item.row.elementCode === "ELEM_B")?.state, "NEEDS_NEW_ELEMENT");
  assert.equal(preview.cci.find((item) => item.sourceLabel === "Pedestal Fan")?.matchType, "EXACT_MATCH");
  assert.equal(preview.cci.find((item) => item.sourceLabel === "standing fan")?.matchType, "ALIAS_MATCH");
  assert.equal(preview.cci.find((item) => item.sourceLabel === "Fan")?.matchType, "AMBIGUOUS");
  assert.equal(preview.cci.find((item) => item.sourceLabel === "Mystery Thing")?.matchType, "UNMATCHED");
});

test("admin package builder exposes bounded V1 workflow without inventory or HYBRID", () => {
  const source = readFileSync(new URL("../app/admin/packages/new/package-builder.tsx", import.meta.url), "utf8");
  for (const text of ["Create Package", "Quantity per package", "BILLABLE", "INCLUDED", "Save draft", "RATE MISSING", "FIXED_PER_PACKAGE"]) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /available quantity|stock quantity|HYBRID/i);
});
