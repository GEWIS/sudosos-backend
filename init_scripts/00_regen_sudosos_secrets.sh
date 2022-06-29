#!/bin/bash
set -e -o pipefail

# generate jwt.key

JWT_KEY_FILE=/app/config/jwt.key

if [ ! -f "$JWT_KEY_FILE" ]; then
    echo "generating key"

    openssl genrsa -out ${JWT_KEY_FILE} 2048
fi
