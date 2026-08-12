import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readMasterWorkbook } from "../lib/catalogue-import/master-workbook";
import { buildCataloguePreview, formatPreviewSummary, semanticPreviewJson } from "../lib/catalogue-import/preview";

function usage(): never {
  console.error("Usage: npm run catalogue:preview -- <workbook.xlsx> [--json] [--output <preview.json>]");
  process.exit(2);
}

const args = process.argv.slice(2);
const fileArgument = args.find((argument) => !argument.startsWith("--"));
if (!fileArgument) usage();
const outputIndex = args.indexOf("--output");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
if (outputIndex >= 0 && (!outputPath || outputPath.startsWith("--"))) usage();

async function main() {
  try {
    const workbook = await readMasterWorkbook(resolve(fileArgument!));
    const preview = buildCataloguePreview(workbook);
    const json = semanticPreviewJson(preview);
    if (outputPath) await writeFile(resolve(outputPath), json, "utf8");
    if (args.includes("--json")) process.stdout.write(json);
    else console.log(formatPreviewSummary(preview));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
