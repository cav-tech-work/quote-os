import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { buildSemanticReview } from "../lib/catalogue-semantic/review";

async function main() { const outputIndex = process.argv.indexOf("--output"); const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null; const json = process.argv.includes("--json") || Boolean(output);
  const review = await buildSemanticReview(prisma);
  const text = json ? JSON.stringify(review, null, 2) + "\n" : [`QuoteOS catalogue semantic review`, `Catalogue fingerprint: ${review.catalogueFingerprint}`, `Source import: ${review.sourceImportFileHash}`, `Offerings: ${review.rows.length}`, `Missing quantity: ${review.rows.filter((r) => !r.currentQuantityBasis).length}`, `Duration unassigned: ${review.rows.filter((r) => !r.currentDurationPolicy).length}`, "", ...review.rows.map((r) => `${r.code} | ${r.family} | days=${r.daysApplies ?? "?"} | quantity=${r.currentQuantityBasis ?? "?"}→${r.candidateQuantityBasis ?? "DEFER"} | duration=${r.currentDurationPolicy ?? "?"}→${r.candidateDurationPolicy ?? "DEFER"} | blockers=${r.blockers.join(",") || "none"}`)].join("\n") + "\n";
  if (output) await writeFile(resolve(output), text); else process.stdout.write(text);
}
main().finally(() => prisma.$disconnect());
