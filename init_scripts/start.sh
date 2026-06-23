#!/bin/sh
set -e

/app/init_scripts/00_make_sudosos_data_dirs.sh
/app/init_scripts/00_regen_sudosos_secrets.sh

exec node /app/out/src/index.js
