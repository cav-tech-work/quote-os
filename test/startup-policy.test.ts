import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function startupHarness(failMigration = false) {
  const directory = mkdtempSync(join(tmpdir(), "quoteos-startup-"));
  const binaryDirectory = join(directory, "bin");
  const logPath = join(directory, "commands.log");
  mkdirSync(binaryDirectory);

  const fakeCommand = `#!/bin/sh
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$QUOTEOS_STARTUP_LOG"
if [ "\${FAIL_MIGRATION:-}" = "1" ] && [ "$*" = "./node_modules/prisma/build/index.js migrate deploy" ]; then
  exit 23
fi
exit 0
`;

  for (const command of ["node", "npx", "npm", "prisma"]) {
    const path = join(binaryDirectory, command);
    writeFileSync(path, fakeCommand);
    chmodSync(path, 0o755);
  }

  const env = {
    ...process.env,
    DATABASE_URL: "postgresql://startup-policy.invalid/quoteos",
    FAIL_MIGRATION: failMigration ? "1" : "0",
    PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
    QUOTEOS_STARTUP_LOG: logPath,
  };

  return {
    directory,
    logPath,
    run: () => execFileSync("sh", ["scripts/start.sh"], { cwd: repositoryRoot, env, stdio: "pipe" }),
  };
}

function recordedCommands(logPath: string) {
  return readFileSync(logPath, "utf8").trim().split("\n");
}

test("production startup migrates before starting and invokes no seed or import", () => {
  const harness = startupHarness();
  try {
    harness.run();
    assert.deepEqual(recordedCommands(harness.logPath), [
      "node ./node_modules/prisma/build/index.js migrate deploy",
      "node server.js",
    ]);
  } finally {
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

test("migration failure prevents application startup", () => {
  const harness = startupHarness(true);
  try {
    assert.throws(() => harness.run());
    assert.deepEqual(recordedCommands(harness.logPath), [
      "node ./node_modules/prisma/build/index.js migrate deploy",
    ]);
  } finally {
    rmSync(harness.directory, { recursive: true, force: true });
  }
});
