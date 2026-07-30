#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  ./node_modules/.bin/prisma migrate deploy
fi

exec node server.js
