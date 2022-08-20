#!/bin/bash
chmod +x /app/init_scripts/00_make_sudosos_data_dirs.sh
chmod +x /app/init_scripts/00_regen_sudosos_secrets.sh
sh /app/init_scripts/00_make_sudosos_data_dirs.sh
sh /app/init_scripts/00_regen_sudosos_secrets.sh
npm run serve
