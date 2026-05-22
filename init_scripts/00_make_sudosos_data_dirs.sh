#!/bin/sh
set -e

mkdir -p /app/config
chown node /app/config

mkdir -p /app/data
chown node /app/data

mkdir -p /app/data/banners
chown node /app/data/banners

mkdir -p /app/data/products
chown node /app/data/products

mkdir -p /app/data/invoices
chown node /app/data/invoices

mkdir -p /app/data/payout_requests
chown node /app/data/payout_requests

mkdir -p /app/data/seller_payouts
chown node /app/data/seller_payouts
