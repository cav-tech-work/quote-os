import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { parseWorkbookSheets, readMasterWorkbook, scanWorkbookCellIssues } from "../lib/catalogue-import/master-workbook";
import { buildCataloguePreview, semanticPreviewJson } from "../lib/catalogue-import/preview";
import type { WorkbookSheet } from "../lib/catalogue-import/types";
import { strToU8, zipSync } from "fflate";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "test/fixtures/master-workbook.json"), "utf8")) as WorkbookSheet[];

test("fixture preview distinguishes source edge cases conservatively", () => {
  const parsed = parseWorkbookSheets(fixture);
  const preview = buildCataloguePreview({ sourceFile: "fixture.xlsx", fileHash: "fixture-hash", ...parsed });

  assert.equal(preview.rows.rateChart, 6);
  assert.equal(preview.rows.lookup, 5);
  assert.equal(preview.summary.duplicateSourceCodes, 1);
  assert.equal(preview.summary.unknownUnits, 1);
  assert.equal(preview.summary.rates.toClient.ZERO, 1);
  assert.equal(preview.summary.rates.toClient.BLANK, 1);
  assert.equal(preview.summary.rates.toClient.INVALID, 2);
  assert.equal(preview.summary.rates.toVendor.ZERO, 1);
  assert.equal(preview.summary.rates.toVendor.BLANK, 1);
  assert.equal(preview.summary.cityValues, 3);
  assert.equal(preview.summary.aliasConflicts, 1);
  assert.ok(preview.canonicalCandidates.some((candidate) => candidate.state === "AMBIGUOUS"));
  assert.ok(preview.canonicalCandidates.some((candidate) => candidate.state === "INVALID"));
  assert.ok(preview.priceCandidates.some((price) => price.side === "TO_CLIENT" && price.amountPaise === 0));
  assert.ok(preview.priceCandidates.some((price) => price.side === "TO_VENDOR" && price.amountPaise === 65_000));
  assert.ok(preview.cityObservationCandidates.every((candidate) => candidate.disposition === "RATE_OBSERVATION_LATER"));
});

test("fixture preview is semantically deterministic", () => {
  const firstParsed = parseWorkbookSheets(fixture);
  const secondParsed = parseWorkbookSheets(structuredClone(fixture));
  const first = buildCataloguePreview({ sourceFile: "fixture.xlsx", fileHash: "fixture-hash", ...firstParsed });
  const second = buildCataloguePreview({ sourceFile: "fixture.xlsx", fileHash: "fixture-hash", ...secondParsed });
  assert.equal(semanticPreviewJson(first), semanticPreviewJson(second));
  assert.deepEqual(first.sourceRows, second.sourceRows);
});

test("raw workbook scan detects formula errors and missing cached values", () => {
  const workbook = `<?xml version="1.0"?><workbook><sheets><sheet name="RateChart" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relationships = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
  const sheet = `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="e"><f>1/0</f><v>#DIV/0!</v></c><c r="B1"><f>1+1</f></c></row></sheetData></worksheet>`;
  const archive = zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(relationships),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
  assert.deepEqual(scanWorkbookCellIssues(archive), [
    { code: "FORMULA_ERROR", sheet: "RateChart", cell: "A1", value: "#DIV/0!" },
    { code: "FORMULA_MISSING_CACHED_VALUE", sheet: "RateChart", cell: "B1", value: null },
  ]);
});

const realWorkbook = process.env.QUOTEOS_MASTER_WORKBOOK;

test("real authoritative workbook produces a stable preview", { skip: !realWorkbook }, async () => {
  const first = buildCataloguePreview(await readMasterWorkbook(realWorkbook!));
  const second = buildCataloguePreview(await readMasterWorkbook(realWorkbook!));
  assert.equal(semanticPreviewJson(first), semanticPreviewJson(second));
  assert.deepEqual(first.detectedSheets, ["RateChart", "VC", "LookUp"]);
  assert.ok(first.rows.rateChart > 0);
  assert.ok(first.rows.lookup > 0);
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("preview CLI performs zero normalized-catalogue mutation", { skip: !realWorkbook || !testDatabaseUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const counts = async () => Promise.all([
    prisma.canonicalItem.count(),
    prisma.commercialOffering.count(),
    prisma.alias.count(),
    prisma.sourceMapping.count(),
    prisma.price.count(),
    prisma.rateMarket.count(),
    prisma.rateObservation.count(),
    prisma.importBatch.count(),
    prisma.importRow.count(),
  ]);
  try {
    const before = await counts();
    execFileSync(process.execPath, ["--import", "tsx", "scripts/catalogue-preview.ts", realWorkbook!, "--json"], { cwd: repositoryRoot, stdio: "pipe" });
    assert.deepEqual(await counts(), before);
  } finally {
    await prisma.$disconnect();
  }
});
