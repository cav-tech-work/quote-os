import { prisma } from "@/lib/prisma";
import { applyComponentReconciliation, previewComponentReconciliation } from "@/lib/component-reconciliation/database";
import { readComponentSources } from "@/lib/component-reconciliation/source";

async function main() {
  const [lookupPath, cciPath, mode = "--preview"] = process.argv.slice(2);
  if (!lookupPath || !cciPath || !["--preview", "--apply"].includes(mode)) throw new Error("Usage: npm run components:reconcile -- <lookup.xlsx> <cci.xlsx> [--preview|--apply]");
  const profile = await readComponentSources(lookupPath, cciPath);
  const result = mode === "--apply" ? await applyComponentReconciliation(profile) : { preview: await previewComponentReconciliation(profile) };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
