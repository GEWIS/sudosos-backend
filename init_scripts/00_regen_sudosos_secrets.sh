#!/bin/bash
set -e -o pipefail

# generate jwt.key

JWT_KEY_FILE=/app/config/jwt.key

if [ ! -f "$JWT_KEY_FILE" ]; then
    echo "generating key"

    SECRET=$(openssl genrsa 2048)
    echo ${SECRET} > ${JWT_KEY_FILE}
fi
