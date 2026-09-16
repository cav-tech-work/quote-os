import { prisma } from "@/lib/prisma";
import { formatResetReport, resetCatalogue } from "@/lib/catalogue-reset";

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

async function main() {
  const result = await resetCatalogue({
    target: option("--target"),
    confirm: option("--confirm"),
    execute: process.argv.includes("--apply"),
  });
  process.stdout.write(`${formatResetReport(result)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
