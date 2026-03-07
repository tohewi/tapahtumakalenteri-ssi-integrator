// ============================================================
// Platform Data Store — Barrel Re-export
//
// This file delegates to domain-specific modules in ./platform-store/.
// See that directory for accounts, tenants, members, invitations,
// disciplines, templates, events, staffing, and audit domains.
//
// PostgreSQL tables:
//   accounts        — id, email, name, password_hash, tenants[], timestamps
//   tenants         — id, account_id, name, subscription{}, config, timestamps
//   tenant_members  — id, tenant_id, account_id, roles[], status, timestamps
//   disciplines     — id, tenant_id, name, labels, SSI refs, timestamps
//   match_templates — id, tenant_id, discipline_id, name, JSONB config
//   scheduled_events — id, tenant_id, template_id, event_date, status, ...
//   event_staffing_needs — id, event_id, role_key, min_count, max_count
//   staff_signups   — id, event_id, need_id, account_id, status, ...
//
// Redis keys:
//   platform:session:{id} — platform login session (24h TTL)
// ============================================================

export * from './platform-store/index.js'
