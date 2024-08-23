#!/bin/sh
set -e

mkdir -p /app/config
chown node /app/config

mkdir -p /app/out/data
chown node /app/out/data

mkdir -p /app/out/data/banners
chown node /app/out/data/banners

mkdir -p /app/out/data/products
chown node /app/out/data/products

mkdir -p /app/out/data/invoices
chown node /app/out/data/invoices

mkdir -p /app/out/data/payout_requests
chown node /app/out/data/payout_requests

mkdir -p /app/out/data/seller_payouts
chown node /app/out/data/seller_payouts
