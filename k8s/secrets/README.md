# Sealed Secrets

This directory contains templates and sealed secrets for each environment.

## Workflow

1. Fetch the kubeseal public cert (requires GEWIS network access):
   ```bash
   curl -s https://sealed-secrets.gewis.nl/v1/cert.pem > ../cert.pem
   ```

2. Copy a template and fill in real values:
   ```bash
   cp backend-env.production.template.yaml backend-env.production.yaml
   # Edit backend-env.production.yaml with real values
   ```

3. Seal the secret:
   ```bash
   kubeseal --cert ../cert.pem \
     --format yaml \
     --scope namespace-wide \
     < backend-env.production.yaml \
     > ../../overlays/production/sealed-backend-env.yaml
   ```

4. Delete the plaintext file:
   ```bash
   rm backend-env.production.yaml
   ```

5. The sealed secret in `overlays/<env>/sealed-backend-env.yaml` is safe to commit.

## Rotating secrets

Repeat steps 2-4. The sealed-secrets controller will detect the update and
unseal the new values.
