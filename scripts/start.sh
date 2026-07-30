#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  node ./node_modules/prisma/build/index.js migrate deploy
  node prisma/seed.mjs
fi

exec node server.js
