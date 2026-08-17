import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";
import { personnelSemanticApply, type PersonnelDecisionFile } from "../lib/catalogue-semantic/personnel-apply";

async function main() {
  const decisionIndex = process.argv.indexOf("--decisions"); const actorIndex = process.argv.indexOf("--actor-email");
  if (decisionIndex < 0 || !process.argv[decisionIndex + 1]) throw new Error("Usage: catalogue:personnel-apply -- --decisions <file> [--actor-email <active-admin>] [--apply]");
  const decisions = JSON.parse(await readFile(resolve(process.argv[decisionIndex + 1]), "utf8")) as PersonnelDecisionFile;
  console.log(JSON.stringify(await personnelSemanticApply(prisma, decisions, { execute: process.argv.includes("--apply"), actorEmail: actorIndex >= 0 ? process.argv[actorIndex + 1] : "" }), null, 2));
}
main().finally(() => prisma.$disconnect());
