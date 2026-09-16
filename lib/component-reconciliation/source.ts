import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import readExcelFile from "read-excel-file/node";
import { cleanSourceText, normalizeCode, normalizeUnit, sha256 } from "@/lib/catalogue-import/normalize";
import type { CellValue, WorkbookSheet } from "@/lib/catalogue-import/types";
import { LOOKUP_FIRST_ROW, LOOKUP_LAST_ROW, type CciComponentLabel, type LookupComponent, type SourceProfile } from "./types";

export const CCI_EXCLUDED_COMPONENT_LABELS = new Set([
  "octa l",
  "octa b",
  "area in sqm",
  "qty",
  "singleitemprice",
  "total oct area",
]);

export function normalizeComponentText(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-IN")
    .replace(/&/g, " and ")
    .replace(/\bw\//g, " with ")
    .replace(/\bpts?\b/g, " point ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function requiredSheet(sheets: WorkbookSheet[], name: string) {
  const sheet = sheets.find((item) => item.name === name);
  if (!sheet) throw new Error(`Required sheet ${name} is missing.`);
  return sheet;
}

export function parseLookupComponents(sheets: WorkbookSheet[]): LookupComponent[] {
  const rows = requiredSheet(sheets, "LookUp").rows;
  const header = rows[0] ?? [];
  const index = new Map(header.map((value, column) => [cleanSourceText(value), column]));
  for (const required of ["Code", "Description", "Maps_To", "BPH_Unit", "Parent_Code", "Tags"]) {
    if (!index.has(required)) throw new Error(`LookUp column ${required} is missing.`);
  }
  const result: LookupComponent[] = [];
  for (let rowNumber = LOOKUP_FIRST_ROW; rowNumber <= LOOKUP_LAST_ROW; rowNumber += 1) {
    const row = rows[rowNumber - 1] ?? [];
    const elementCode = normalizeCode(row[index.get("Code")!]);
    if (!elementCode) continue;
    const parentCode = normalizeCode(row[index.get("Parent_Code")!]);
    const description = cleanSourceText(row[index.get("Description")!]);
    const mapsTo = cleanSourceText(row[index.get("Maps_To")!]);
    if (!parentCode || !description || !mapsTo) throw new Error(`LookUp row ${rowNumber} is missing required component identity.`);
    const unit = normalizeUnit(row[index.get("BPH_Unit")!]);
    const rawTags = cleanSourceText(row[index.get("Tags")!]);
    result.push({
      rowNumber,
      elementCode,
      parentCode,
      description,
      mapsTo,
      billingUnit: unit.normalized,
      rawBillingUnit: unit.raw,
      tags: rawTags?.split(",").map((value) => value.trim()).filter(Boolean) ?? [],
    });
  }
  return result;
}

export function parseCciComponentLabels(sheets: WorkbookSheet[]) {
  const labels = new Map<string, { sourceLabel: string; cities: Set<string> }>();
  for (const sheet of sheets) {
    const headers = sheet.rows[1] ?? [];
    for (const value of headers) {
      const sourceLabel = cleanSourceText(value);
      if (!sourceLabel) continue;
      const normalizedText = normalizeComponentText(sourceLabel);
      const existing = labels.get(normalizedText) ?? { sourceLabel, cities: new Set<string>() };
      existing.cities.add(sheet.name);
      labels.set(normalizedText, existing);
    }
  }
  const included: CciComponentLabel[] = [];
  const excluded: CciComponentLabel[] = [];
  for (const [normalizedText, value] of labels) {
    const item = { sourceLabel: value.sourceLabel, normalizedText, cities: [...value.cities].sort() };
    (CCI_EXCLUDED_COMPONENT_LABELS.has(normalizedText) ? excluded : included).push(item);
  }
  const sort = (a: CciComponentLabel, b: CciComponentLabel) => a.sourceLabel.localeCompare(b.sourceLabel, "en-IN");
  return { included: included.sort(sort), excluded: excluded.sort(sort) };
}

async function workbookSheets(buffer: Buffer): Promise<WorkbookSheet[]> {
  const parsed = await readExcelFile(buffer);
  return parsed.map(({ sheet, data }) => ({ name: sheet, rows: data as CellValue[][] }));
}

export async function readComponentSources(lookupPath: string, cciPath: string): Promise<SourceProfile> {
  const [lookupBuffer, cciBuffer] = await Promise.all([readFile(lookupPath), readFile(cciPath)]);
  const [lookupSheets, cciSheets] = await Promise.all([workbookSheets(lookupBuffer), workbookSheets(cciBuffer)]);
  const { included, excluded } = parseCciComponentLabels(cciSheets);
  return {
    lookupFile: basename(lookupPath),
    lookupFileHash: sha256(lookupBuffer),
    cciFile: basename(cciPath),
    cciFileHash: sha256(cciBuffer),
    lookupRows: parseLookupComponents(lookupSheets),
    cciLabels: included,
    excludedCciLabels: excluded,
    lookupSheets,
    cciSheets,
  };
}
