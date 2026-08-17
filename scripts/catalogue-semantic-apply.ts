import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { semanticApply } from "../lib/catalogue-semantic/apply";
import type { SemanticDecisionFile } from "../lib/catalogue-semantic/types";

async function main() { const decisionIndex = process.argv.indexOf("--decisions"); if (decisionIndex < 0 || !process.argv[decisionIndex + 1]) throw new Error("Usage: catalogue:semantic-apply -- --decisions <file> [--actor-email <active-admin>] [--apply]");
  const actorIndex = process.argv.indexOf("--actor-email"); const actorEmail = actorIndex >= 0 ? process.argv[actorIndex + 1] : ""; const decisions = JSON.parse(await readFile(resolve(process.argv[decisionIndex + 1]), "utf8")) as SemanticDecisionFile;
  const result = await semanticApply(prisma, decisions, { execute: process.argv.includes("--apply"), actorEmail }); console.log(JSON.stringify(result, null, 2));
}
main().finally(() => prisma.$disconnect());
