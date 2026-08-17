import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { buildSemanticReview } from "../lib/catalogue-semantic/review";

async function main() { const outputIndex = process.argv.indexOf("--output"); const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null; const json = process.argv.includes("--json") || Boolean(output);
  const review = await buildSemanticReview(prisma);
  const text = json ? JSON.stringify(review, null, 2) + "\n" : [`QuoteOS catalogue semantic review`, `Catalogue fingerprint: ${review.catalogueFingerprint}`, `Source import: ${review.sourceImportFileHash}`, `Offerings: ${review.rows.length}`, `Missing quantity: ${review.rows.filter((r) => !r.currentQuantityBasis).length}`, `Duration unassigned: ${review.rows.filter((r) => !r.currentDurationPolicy).length}`, "", ...review.rows.map((r) => `${r.code} | ${r.name} | canonical=${r.canonical ?? "?"} | domain=${r.domain ?? "?"} | unit=${r.billingUnit} | quantity=${r.currentQuantityBasis ?? "?"} | source=${r.sourceDescription ?? "?"} | days=${r.daysApplies ?? "?"} | legacy=${r.durationBasis ?? "?"} | rates=client:${r.globalToClientAvailable},vendor:${r.globalToVendorAvailable} | specialized=${r.specialized} | bucket=${r.reviewBucket} | policy=${r.currentDurationPolicy ?? "?"}→${r.candidateDurationPolicy ?? "DEFER"} | confidence=${r.reviewConfidence} | reason=${r.durationReason} | blockers=${r.blockers.join(",") || "none"}`)].join("\n") + "\n";
  if (output) await writeFile(resolve(output), text); else process.stdout.write(text);
}
main().finally(() => prisma.$disconnect());
