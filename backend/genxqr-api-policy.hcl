# Vault policy for the GenXQR API (AppRole: genxqr-api)
# Grants read-only access to the application secrets KV path.
# Applied via: vault policy write genxqr-api-policy genxqr-api-policy.hcl

# Read the current version of the secret
path "secret/data/genxqr/backend" {
  capabilities = ["read"]
}

# Read secret metadata (version history, creation time) — needed for health checks
path "secret/metadata/genxqr/backend" {
  capabilities = ["read"]
}
