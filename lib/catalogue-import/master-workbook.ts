import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import readExcelFile from "read-excel-file/node";
import { strFromU8, unzipSync } from "fflate";
import { cleanSourceText, domainFromSection, isValidSourceCode, normalizeCode, normalizeUnit, parseRate, sha256, stableValue } from "./normalize";
import type { CellValue, LookupRow, RateChartRow, RawSourceRow, WorkbookCellIssue, WorkbookSheet } from "./types";

const REQUIRED_RATE_HEADERS = ["Code", "Element", "Unit", "ToClients", "ToVendors"];
const REQUIRED_LOOKUP_HEADERS = ["Code", "Description", "Maps_To", "Parent_Code", "Tags", "Category"];
const NON_CITY_HEADERS = new Set(["Copyable Formula", "Notes"]);

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function scanWorkbookCellIssues(buffer: Buffer | Uint8Array): WorkbookCellIssue[] {
  const archive = unzipSync(new Uint8Array(buffer));
  const workbookXml = archive["xl/workbook.xml"] ? strFromU8(archive["xl/workbook.xml"]) : "";
  const relationshipsXml = archive["xl/_rels/workbook.xml.rels"] ? strFromU8(archive["xl/_rels/workbook.xml.rels"]) : "";
  const relationshipTargets = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g)) {
    relationshipTargets.set(match[1], match[2].replace(/^\//, "").replace(/^xl\//, ""));
  }
  const issues: WorkbookCellIssue[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)) {
    const sheet = decodeXml(match[1]);
    const target = relationshipTargets.get(match[2]);
    if (!target) continue;
    const path = target.startsWith("worksheets/") ? `xl/${target}` : `xl/worksheets/${target.split("/").pop()}`;
    const xml = archive[path] ? strFromU8(archive[path]) : "";
    for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const address = cell[1].match(/\br="([^"]+)"/)?.[1];
      if (!address) continue;
      const body = cell[2];
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
      const isError = /\bt="e"/.test(cell[1]);
      if (isError) issues.push({ code: "FORMULA_ERROR", sheet, cell: address, value: value ? decodeXml(value) : null });
      else if (/<f(?:\s[^>]*)?>[\s\S]*?<\/f>/.test(body) && value === null) issues.push({ code: "FORMULA_MISSING_CACHED_VALUE", sheet, cell: address, value: null });
    }
  }
  return issues.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.cell.localeCompare(b.cell) || a.code.localeCompare(b.code));
}

function headerText(value: CellValue): string {
  return cleanSourceText(value) ?? "";
}

function findHeaderRow(rows: CellValue[][], requiredHeaders: string[], sheetName: string): number {
  const index = rows.findIndex((row) => requiredHeaders.every((header) => row.some((value) => headerText(value) === header)));
  if (index < 0) throw new Error(`${sheetName}: required header row not found (${requiredHeaders.join(", ")})`);
  return index;
}

function uniqueHeaderKeys(row: CellValue[]): string[] {
  const seen = new Map<string, number>();
  return row.map((value, index) => {
    const base = headerText(value) || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} [${count}]`;
  });
}

function rawSourceRow(sheet: string, rowNumber: number, headers: string[], row: CellValue[]): RawSourceRow {
  const values = Object.fromEntries(headers.map((header, index) => [header, stableValue(row[index] ?? null)]));
  const rowHash = sha256(JSON.stringify({ sheet, rowNumber, values }));
  return { sheet, rowNumber, values, rowHash };
}

function candidateDuration(
  rawDaysApplies: CellValue,
  domain: RateChartRow["candidateDomain"],
): Pick<RateChartRow, "candidateDurationBasis" | "durationWarning"> {
  const value = cleanSourceText(rawDaysApplies)?.toUpperCase();
  if (value === "N") return { candidateDurationBasis: "ONE_OFF", durationWarning: null };
  if (value !== "Y") {
    return { candidateDurationBasis: null, durationWarning: value ? `Unrecognized Days Applies value: ${value}` : "Days Applies is blank" };
  }
  if (domain === "VC") return { candidateDurationBasis: "VC_CHARGE_DAYS", durationWarning: null };
  if (domain === "OPS") return { candidateDurationBasis: "OPS_CHARGE_DAYS", durationWarning: null };
  if (domain === "POWER") return { candidateDurationBasis: "POWER_CHARGE_DAYS", durationWarning: null };
  return { candidateDurationBasis: null, durationWarning: `Days apply, but ${domain} does not determine a charge-day basis` };
}

export function parseWorkbookSheets(sheets: WorkbookSheet[]): {
  detectedSheets: string[];
  rateChartRows: RateChartRow[];
  lookupRows: LookupRow[];
} {
  const rateSheet = sheets.find((sheet) => sheet.name === "RateChart");
  const lookupSheet = sheets.find((sheet) => sheet.name === "LookUp");
  if (!rateSheet) throw new Error("Required sheet RateChart is missing");
  if (!lookupSheet) throw new Error("Required sheet LookUp is missing");

  const rateHeaderIndex = findHeaderRow(rateSheet.rows, REQUIRED_RATE_HEADERS, "RateChart");
  const rateHeaders = uniqueHeaderKeys(rateSheet.rows[rateHeaderIndex]);
  const rateIndex = new Map(rateHeaders.map((header, index) => [header, index]));
  const codeColumn = rateIndex.get("Code")!;
  const clientColumn = rateIndex.get("ToClients")!;
  const vendorColumn = rateIndex.get("ToVendors")!;
  const cityColumns = rateHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index > vendorColumn && index < rateHeaders.length && !NON_CITY_HEADERS.has(header))
    .filter(({ header }) => !header.startsWith("Column ") && !header.startsWith("Venue Tab") && !header.startsWith("City") && !header.startsWith("Days ("));

  let section: string | null = null;
  const rateChartRows: RateChartRow[] = [];
  for (let index = rateHeaderIndex + 1; index < rateSheet.rows.length; index += 1) {
    const row = rateSheet.rows[index];
    const sourceCode = normalizeCode(row[codeColumn]);
    if (!sourceCode) {
      const possibleSection = cleanSourceText(row[0]);
      if (possibleSection) section = possibleSection;
      continue;
    }
    const candidateDomain = domainFromSection(section);
    const rawDaysApplies = row[rateIndex.get("Days Applies?")!] ?? null;
    rateChartRows.push({
      sourceCode,
      sourceDescription: cleanSourceText(row[rateIndex.get("Element")!]),
      category: cleanSourceText(row[rateIndex.get("Category")!]),
      sourceSection: section,
      candidateDomain,
      rawDaysApplies,
      ...candidateDuration(rawDaysApplies, candidateDomain),
      unit: normalizeUnit(row[rateIndex.get("Unit")!]),
      toClient: parseRate(row[clientColumn]),
      toVendor: parseRate(row[vendorColumn]),
      cityValues: Object.fromEntries(cityColumns.map(({ header, index: column }) => [header, parseRate(row[column] ?? null)])),
      source: rawSourceRow("RateChart", index + 1, rateHeaders, row),
    });
  }

  const lookupHeaderIndex = findHeaderRow(lookupSheet.rows, REQUIRED_LOOKUP_HEADERS, "LookUp");
  const lookupHeaders = uniqueHeaderKeys(lookupSheet.rows[lookupHeaderIndex]);
  const lookupIndex = new Map(lookupHeaders.map((header, index) => [header, index]));
  const lookupRows: LookupRow[] = [];
  for (let index = lookupHeaderIndex + 1; index < lookupSheet.rows.length; index += 1) {
    const row = lookupSheet.rows[index];
    if (!row.some((value) => cleanSourceText(value))) continue;
    lookupRows.push({
      sourceCode: normalizeCode(row[lookupIndex.get("Code")!]),
      sourceDescription: cleanSourceText(row[lookupIndex.get("Description")!]),
      mapsTo: cleanSourceText(row[lookupIndex.get("Maps_To")!]),
      parentCode: normalizeCode(row[lookupIndex.get("Parent_Code")!]),
      tags: cleanSourceText(row[lookupIndex.get("Tags")!]),
      category: cleanSourceText(row[lookupIndex.get("Category")!]),
      source: rawSourceRow("LookUp", index + 1, lookupHeaders, row),
    });
  }

  return { detectedSheets: sheets.map((sheet) => sheet.name), rateChartRows, lookupRows };
}

export async function readMasterWorkbook(filePath: string): Promise<{
  sourceFile: string;
  fileHash: string;
  detectedSheets: string[];
  rateChartRows: RateChartRow[];
  lookupRows: LookupRow[];
  workbookCellIssues: WorkbookCellIssue[];
}> {
  const buffer = await readFile(filePath);
  const parsedSheets = await readExcelFile(buffer);
  const sheets: WorkbookSheet[] = parsedSheets.map(({ sheet, data }) => ({ name: sheet, rows: data as CellValue[][] }));
  const parsed = parseWorkbookSheets(sheets);
  for (const row of [...parsed.rateChartRows, ...parsed.lookupRows]) {
    if (row.sourceCode && !isValidSourceCode(row.sourceCode)) {
      // Validation is reported by preview generation; retaining the row here keeps parsing lossless.
    }
  }
  return { sourceFile: basename(filePath), fileHash: sha256(buffer), ...parsed, workbookCellIssues: scanWorkbookCellIssues(buffer) };
}
