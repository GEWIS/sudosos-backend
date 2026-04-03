# SudoSOS Kubernetes Deployment

Kustomize-based deployment for all SudoSOS services.

## Structure

```
k8s/
├── base/                     # Shared resource definitions
│   ├── kustomization.yaml
│   ├── pvcs.yaml             # Shared RWX volumes (products, invoices, etc.)
│   ├── nginx/                # Reverse proxy (cookie-based beta routing)
│   ├── backend/              # Express API
│   ├── frontend/             # Dashboard (stable)
│   ├── frontend-beta/        # Dashboard (develop)
│   ├── pos/                  # Point of Sale (stable)
│   ├── pos-develop/          # Point of Sale (develop)
│   ├── docs/                 # Documentation site
│   ├── pdf/                  # LaTeX PDF generator
│   ├── pdf-compiler/         # HTML PDF compiler
│   └── redis/                # Session/cache store
├── overlays/
│   ├── production/           # sudosos.gewis.nl
│   │   ├── kustomization.yaml
│   │   ├── namespace.yaml
│   │   └── patches/
│   └── test/                 # sudosos.test.gewis.nl
│       ├── kustomization.yaml
│       ├── namespace.yaml
│       └── patches/
└── secrets/                  # Secret templates & sealing workflow (see secrets/README.md)
```

## Deploying

```bash
# Preview what will be applied
kubectl kustomize k8s/overlays/production

# Apply to production
kubectl apply -k k8s/overlays/production

# Apply to test
kubectl apply -k k8s/overlays/test
```

## Secrets & Environment Variables

Backend secrets (DB credentials, Stripe keys, LDAP config, etc.) are managed via
[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets). Each overlay references
a `sealed-backend-env.yaml` that is safe to commit — it can only be decrypted by the
in-cluster Sealed Secrets controller.

Non-sensitive config (ports, feature flags, service hostnames) lives in the
`backend-env-config` ConfigMap defined in `base/backend/configmap.yaml` and patched
per-overlay in `overlays/<env>/patches/backend-config.yaml`.

To generate or rotate sealed secrets, see `secrets/README.md`.

## PVCs

The shared volumes use `ReadWriteMany` access mode:

| PVC name                   | Mount path              |
|----------------------------|-------------------------|
| `sudosos-products`         | `/data/products`        |
| `sudosos-banners`          | `/data/banners`         |
| `sudosos-invoices`         | `/data/invoices`        |
| `sudosos-payout-requests`  | `/data/payout_requests` |
| `sudosos-seller-payouts`   | `/data/seller_payouts`  |
| `sudosos-write-offs`       | `/data/write_offs`      |

Your cluster needs a storage class that supports RWX (e.g. NFS, Longhorn with NFS, or a shared filesystem).

## Image Tags

Most application image tags are set per-overlay in `kustomization.yaml`:
- **Production**: pinned to release versions (e.g. `backend:1.28.2`)
- **Test**: uses `develop` tags

Exceptions managed in the base (not overridden per-overlay):
- `docs` — always uses `develop` (no versioned releases)
- `pdf-compiler` — pinned to `:latest` in base
