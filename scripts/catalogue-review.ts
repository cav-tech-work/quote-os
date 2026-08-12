import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { readMasterWorkbook } from "../lib/catalogue-import/master-workbook";
import { buildCataloguePreview } from "../lib/catalogue-import/preview";
import { generateReviewDecisions, readReviewDecisions, reviewDecisionsJson, validateReviewDecisions, writeReviewDecisions } from "../lib/catalogue-import/review";

function usage(): never {
  console.error("Usage: npm run catalogue:review -- <workbook.xlsx> [--output <decisions.json>] [--json]");
  process.exit(2);
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  const workbookArgument = args[0] && !args[0].startsWith("--") ? args[0] : null;
  if (!workbookArgument) usage();
  const outputPath = resolve(option(args, "--output") ?? "catalogue-import-decisions.json");
  const preview = buildCataloguePreview(await readMasterWorkbook(resolve(workbookArgument)));
  const skeleton = generateReviewDecisions(preview);
  let decisions = skeleton;
  if (await exists(outputPath)) {
    const current = await readReviewDecisions(outputPath);
    validateReviewDecisions(preview, current);
    decisions = {
      ...skeleton,
      sourceMappings: { ...skeleton.sourceMappings, ...current.sourceMappings },
      unitOverrides: { ...skeleton.unitOverrides, ...current.unitOverrides },
      sourceRows: { ...skeleton.sourceRows, ...current.sourceRows },
      aliasConflicts: { ...skeleton.aliasConflicts, ...current.aliasConflicts },
    };
  }
  await writeReviewDecisions(outputPath, decisions);
  if (args.includes("--json")) process.stdout.write(reviewDecisionsJson(decisions));
  else console.log([
    `Review decisions: ${outputPath}`,
    `Workbook SHA-256: ${decisions.expectedFileSha256}`,
    `Deferred mappings: ${Object.values(decisions.sourceMappings).filter((item) => item.decision === "DEFER").length}`,
    `Deferred unit overrides: ${Object.values(decisions.unitOverrides).filter((item) => item.decision === "DEFER").length}`,
    `Deferred row decisions: ${Object.values(decisions.sourceRows).filter((item) => item.decision === "DEFER").length}`,
    `Deferred alias conflicts: ${Object.values(decisions.aliasConflicts).filter((item) => item.decision === "DEFER").length}`,
    "No database writes were performed.",
  ].join("\n"));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
