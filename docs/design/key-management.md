# Encryption Key Management

**Last updated:** 2026-03-08

---

## Overview

The platform uses **AES-256-GCM** symmetric encryption for sensitive data at rest:

| Key | Env Var | Protects |
|-----|---------|----------|
| Platform Credentials Key | `PLATFORM_CREDENTIALS_KEY` | SSI credentials (email, password, API key) stored per tenant |
| MFA Secret Key | `MFA_SECRET_KEY` | Reserved for future per-field MFA secret encryption |

Both keys are **64 hex characters** (32 bytes). Losing them makes encrypted database columns unreadable.

> **Account passwords are NOT affected** — they use bcrypt (one-way hash), no key needed.

---

## Where Keys Are Stored

Keys must exist in **three** locations to prevent loss:

### 1. Render Environment (runtime)

Set directly on each Render web service via Dashboard → Environment.

- **Production:** `turres-ssi-tools-v8` service env vars
- **PR previews:** Injected by `pr-preview.yml` from GitHub secrets

### 2. GitHub Repository Secrets (CI/CD)

Required for PR preview deployments. Set in GitHub → Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `PLATFORM_CREDENTIALS_KEY` | AES-256 key for SSI credential encryption |
| `MFA_SECRET_KEY` | AES-256 key for MFA secret encryption |

### 3. Offline Backup (disaster recovery)

Store both keys in a **password manager** (e.g., Bitwarden, 1Password) or encrypted vault.
Label them clearly with the project name and environment.

Example entry:
```
Name: turres-ssi-tools — Encryption Keys (Render v8 Production)
PLATFORM_CREDENTIALS_KEY: <64 hex chars>
MFA_SECRET_KEY: <64 hex chars>
Created: 2026-03-08
```

---

## Key Generation

Generate a new 32-byte (64 hex char) key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or with OpenSSL:

```bash
openssl rand -hex 32
```

---

## Key Rotation

When rotating keys (e.g., suspected compromise), use the rotation script:

```bash
cd scoring-proxy
node scripts/rotate-credentials-key.mjs \
  --old-key <current-64-hex-key> \
  --new-key <new-64-hex-key> \
  --database-url <DATABASE_URL>
```

The script:
1. Reads all encrypted `ssi_credentials` and `mfa_secret` rows
2. Decrypts each with the old key
3. Re-encrypts with the new key
4. Updates the rows in a single transaction

After rotation:
1. Update the key in **all three locations** (Render, GitHub secrets, offline backup)
2. Restart all Render services to pick up the new key
3. Verify by logging in and viewing a tenant's SSI credential status

---

## What Happens When Keys Are Wrong

The application handles key mismatches gracefully:

- **Login:** Succeeds (passwords use bcrypt, not encryption)
- **Tenant list:** SSI credentials show as unconfigured (decryption failure caught)
- **Tenant update:** Old credentials ignored, new values saved with current key
- **MFA verification:** MFA treated as disabled (decryption failure caught)

Users will need to **re-enter** SSI credentials and **re-configure** MFA after a key loss.

---

## Affected Database Columns

| Table | Column | Encryption |
|-------|--------|------------|
| `tenants` | `ssi_credentials` | AES-256-GCM via `PLATFORM_CREDENTIALS_KEY` |
| `accounts` | `mfa_secret` | AES-256-GCM via `PLATFORM_CREDENTIALS_KEY` |

---

## Checklist: After Generating New Keys

- [ ] Set `PLATFORM_CREDENTIALS_KEY` on Render service(s)
- [ ] Set `MFA_SECRET_KEY` on Render service(s)
- [ ] Add both as GitHub repo secrets
- [ ] Save both in password manager / offline backup
- [ ] Verify login works on deployed service
- [ ] Verify tenant SSI credential save/load works
