import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { guardedCatalogueApply, formatIntegrityReport } from "../lib/catalogue-import/apply";
import { formatApplyPlan } from "../lib/catalogue-import/apply-plan";
import { readMasterWorkbook } from "../lib/catalogue-import/master-workbook";
import { buildCataloguePreview } from "../lib/catalogue-import/preview";
import { readReviewDecisions } from "../lib/catalogue-import/review";
import { stableJson } from "../lib/catalogue-import/normalize";

function usage(): never {
  console.error("Usage: npm run catalogue:apply -- <workbook.xlsx> --decisions <decisions.json> [--apply] [--json]");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const workbookArgument = args[0] && !args[0].startsWith("--") ? args[0] : null;
  const decisionIndex = args.indexOf("--decisions");
  const decisionArgument = decisionIndex >= 0 ? args[decisionIndex + 1] : null;
  if (!workbookArgument || !decisionArgument || decisionArgument.startsWith("--")) usage();

  const [workbook, decisions] = await Promise.all([
    readMasterWorkbook(resolve(workbookArgument)),
    readReviewDecisions(resolve(decisionArgument)),
  ]);
  const preview = buildCataloguePreview(workbook);
  const prisma = new PrismaClient();
  try {
    const result = await guardedCatalogueApply(prisma, preview, decisions, { execute: args.includes("--apply") });
    if (args.includes("--json")) process.stdout.write(`${stableJson(result)}\n`);
    else console.log(`${formatApplyPlan(result.plan, args.includes("--apply"))}\n\n${formatIntegrityReport(result.report)}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
