/**
 * Extract files from release/r80-match-manager-base into apps/scoring-app
 * using node child_process to avoid PowerShell encoding issues.
 */
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

const FILES = [
  // [r80 source path, R81 dest path]
  ['scoring-proxy/routes/platform.js',                      'apps/scoring-app/routes/platform.js'],
  ['scoring-proxy/routes/platform/auth.js',                 'apps/scoring-app/routes/platform/auth.js'],
  ['scoring-proxy/routes/platform/disciplines.js',          'apps/scoring-app/routes/platform/disciplines.js'],
  ['scoring-proxy/routes/platform/events.js',               'apps/scoring-app/routes/platform/events.js'],
  ['scoring-proxy/routes/platform/invitations.js',          'apps/scoring-app/routes/platform/invitations.js'],
  ['scoring-proxy/routes/platform/logos.js',                'apps/scoring-app/routes/platform/logos.js'],
  ['scoring-proxy/routes/platform/members.js',              'apps/scoring-app/routes/platform/members.js'],
  ['scoring-proxy/routes/platform/staffing.js',             'apps/scoring-app/routes/platform/staffing.js'],
  ['scoring-proxy/routes/platform/templates.js',            'apps/scoring-app/routes/platform/templates.js'],
  ['scoring-proxy/routes/platform/tenants.js',              'apps/scoring-app/routes/platform/tenants.js'],
  ['scoring-proxy/middleware/platform-auth.js',             'apps/scoring-app/middleware/platform-auth.js'],
  ['scoring-proxy/lib/db/postgres.js',                      'apps/scoring-app/lib/db/postgres.js'],
  ['scoring-proxy/lib/db/platform-store.js',                'apps/scoring-app/lib/db/platform-store.js'],
  ['scoring-proxy/lib/db/platform-store/index.js',          'apps/scoring-app/lib/db/platform-store/index.js'],
  ['scoring-proxy/lib/db/platform-store/rbac.js',           'apps/scoring-app/lib/db/platform-store/rbac.js'],
  ['scoring-proxy/lib/db/platform-store/accounts.js',       'apps/scoring-app/lib/db/platform-store/accounts.js'],
  ['scoring-proxy/lib/db/platform-store/audit.js',          'apps/scoring-app/lib/db/platform-store/audit.js'],
  ['scoring-proxy/lib/db/platform-store/disciplines.js',    'apps/scoring-app/lib/db/platform-store/disciplines.js'],
  ['scoring-proxy/lib/db/platform-store/events.js',         'apps/scoring-app/lib/db/platform-store/events.js'],
  ['scoring-proxy/lib/db/platform-store/invitations.js',    'apps/scoring-app/lib/db/platform-store/invitations.js'],
  ['scoring-proxy/lib/db/platform-store/logos.js',          'apps/scoring-app/lib/db/platform-store/logos.js'],
  ['scoring-proxy/lib/db/platform-store/members.js',        'apps/scoring-app/lib/db/platform-store/members.js'],
  ['scoring-proxy/lib/db/platform-store/staffing.js',       'apps/scoring-app/lib/db/platform-store/staffing.js'],
  ['scoring-proxy/lib/db/platform-store/templates.js',      'apps/scoring-app/lib/db/platform-store/templates.js'],
  ['scoring-proxy/lib/db/platform-store/tenants.js',        'apps/scoring-app/lib/db/platform-store/tenants.js'],
  ['scoring-proxy/lib/db/platform-store/utils.js',          'apps/scoring-app/lib/db/platform-store/utils.js'],
  ['scoring-proxy/lib/integrations/registry.js',            'apps/scoring-app/lib/integrations/registry.js'],
  ['scoring-proxy/lib/integrations/ssi-adapter.js',         'apps/scoring-app/lib/integrations/ssi-adapter.js'],
  ['scoring-proxy/lib/integrations/null-adapters.js',       'apps/scoring-app/lib/integrations/null-adapters.js'],
  ['scoring-proxy/lib/integrations/wp-calendar-adapter.js', 'apps/scoring-app/lib/integrations/wp-calendar-adapter.js'],
  ['scoring-proxy/lib/services/mfa-service.js',             'apps/scoring-app/lib/services/mfa-service.js'],
  ['scoring-proxy/lib/services/platform-validation.js',     'apps/scoring-app/lib/services/platform-validation.js'],
  ['scoring-proxy/lib/services/event-creation-service.js',  'apps/scoring-app/lib/services/event-creation-service.js'],
  ['scoring-proxy/lib/services/event-deletion-service.js',  'apps/scoring-app/lib/services/event-deletion-service.js'],
  ['scoring-proxy/lib/services/event-form-helpers.js',      'apps/scoring-app/lib/services/event-form-helpers.js'],
  ['scoring-proxy/lib/services/event-complete-service.js',  'apps/scoring-app/lib/services/event-complete-service.js'],
  ['scoring-proxy/lib/services/calendar-publish-service.js','apps/scoring-app/lib/services/calendar-publish-service.js'],
  ['scoring-proxy/lib/services/calendar-stats-service.js',  'apps/scoring-app/lib/services/calendar-stats-service.js'],
  ['scoring-proxy/lib/services/calendar-integrity-service.js','apps/scoring-app/lib/services/calendar-integrity-service.js'],
  ['scoring-proxy/lib/services/post-event-workflow-service.js','apps/scoring-app/lib/services/post-event-workflow-service.js'],
  ['scoring-proxy/lib/services/ssi-discipline-sync.js',     'apps/scoring-app/lib/services/ssi-discipline-sync.js'],
  ['scoring-proxy/lib/services/event-builders/index.js',    'apps/scoring-app/lib/services/event-builders/index.js'],
  ['scoring-proxy/lib/services/event-builders/legacy-web-builder.js','apps/scoring-app/lib/services/event-builders/legacy-web-builder.js'],
  ['scoring-proxy/lib/services/event-builders/nordic-cup-graphql-builder.js','apps/scoring-app/lib/services/event-builders/nordic-cup-graphql-builder.js'],
  ['scoring-proxy/lib/services/event-builders/sra-graphql-builder.js','apps/scoring-app/lib/services/event-builders/sra-graphql-builder.js'],
  ['scoring-proxy/lib/ssi-core/event-creation.js',          'apps/scoring-app/lib/ssi-core/event-creation.js'],
  ['scoring-proxy/lib/ssi-core/event-status.js',            'apps/scoring-app/lib/ssi-core/event-status.js'],
  ['scoring-proxy/lib/ssi-core/seed-import.js',             'apps/scoring-app/lib/ssi-core/seed-import.js'],
  ['scoring-proxy/lib/ssi-core/seed-form-capture.js',       'apps/scoring-app/lib/ssi-core/seed-form-capture.js'],
  ['scoring-proxy/lib/ssi-core/seed-graphql.js',            'apps/scoring-app/lib/ssi-core/seed-graphql.js'],
  ['scoring-proxy/lib/ssi-core/stats-graphql.js',           'apps/scoring-app/lib/ssi-core/stats-graphql.js'],
  ['scoring-proxy/lib/ssi-core/constants.js',               'apps/scoring-app/lib/ssi-core/constants.js'],
  ['scoring-proxy/lib/ssi-core/discipline-registry.js',     'apps/scoring-app/lib/ssi-core/discipline-registry.js'],
  ['scoring-proxy/lib/calendar/gmail-otp.js',               'apps/scoring-app/lib/calendar/gmail-otp.js'],
  ['scoring-proxy/lib/calendar/wp-adapter.js',              'apps/scoring-app/lib/calendar/wp-adapter.js'],
  ['scoring-proxy/lib/calendar/wp-auth.js',                 'apps/scoring-app/lib/calendar/wp-auth.js'],
  ['scoring-proxy/lib/session/impersonation.js',            'apps/scoring-app/lib/session/impersonation.js'],

  // Platform UI components (scoring-ui)
  ['scoring-ui/src/components/platform/AccountSettingsPage.jsx', 'scoring-ui/src/components/platform/AccountSettingsPage.jsx'],
  ['scoring-ui/src/components/platform/DashboardPage.jsx',       'scoring-ui/src/components/platform/DashboardPage.jsx'],
  ['scoring-ui/src/components/platform/DashboardView.jsx',       'scoring-ui/src/components/platform/DashboardView.jsx'],
  ['scoring-ui/src/components/platform/EventCalendar.jsx',       'scoring-ui/src/components/platform/EventCalendar.jsx'],
  ['scoring-ui/src/components/platform/ForgotPasswordPage.jsx',  'scoring-ui/src/components/platform/ForgotPasswordPage.jsx'],
  ['scoring-ui/src/components/platform/ImportSsiEventsModal.jsx','scoring-ui/src/components/platform/ImportSsiEventsModal.jsx'],
  ['scoring-ui/src/components/platform/JoinInvitePage.jsx',      'scoring-ui/src/components/platform/JoinInvitePage.jsx'],
  ['scoring-ui/src/components/platform/MembersPage.jsx',         'scoring-ui/src/components/platform/MembersPage.jsx'],
  ['scoring-ui/src/components/platform/MfaChallengePage.jsx',    'scoring-ui/src/components/platform/MfaChallengePage.jsx'],
  ['scoring-ui/src/components/platform/PlatformApp.jsx',         'scoring-ui/src/components/platform/PlatformApp.jsx'],
  ['scoring-ui/src/components/platform/ResetPasswordPage.jsx',   'scoring-ui/src/components/platform/ResetPasswordPage.jsx'],
  ['scoring-ui/src/components/platform/RosterView.jsx',          'scoring-ui/src/components/platform/RosterView.jsx'],
  ['scoring-ui/src/components/platform/SchedulePage.jsx',        'scoring-ui/src/components/platform/SchedulePage.jsx'],
  ['scoring-ui/src/components/platform/SignInPage.jsx',          'scoring-ui/src/components/platform/SignInPage.jsx'],
  ['scoring-ui/src/components/platform/TemplateEditorPage.jsx',  'scoring-ui/src/components/platform/TemplateEditorPage.jsx'],
  ['scoring-ui/src/components/platform/TenantCreatePage.jsx',    'scoring-ui/src/components/platform/TenantCreatePage.jsx'],
  ['scoring-ui/src/components/platform/TenantDetailPage.jsx',    'scoring-ui/src/components/platform/TenantDetailPage.jsx'],
  ['scoring-ui/src/components/platform/WelcomePage.jsx',         'scoring-ui/src/components/platform/WelcomePage.jsx'],
  ['scoring-ui/src/components/platform/index.js',                'scoring-ui/src/components/platform/index.js'],
  ['scoring-ui/src/components/platform/schedule/CancelEventModal.jsx',  'scoring-ui/src/components/platform/schedule/CancelEventModal.jsx'],
  ['scoring-ui/src/components/platform/schedule/CreateEventsPanel.jsx', 'scoring-ui/src/components/platform/schedule/CreateEventsPanel.jsx'],
  ['scoring-ui/src/components/platform/schedule/StatusBadge.jsx',       'scoring-ui/src/components/platform/schedule/StatusBadge.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantBrandingTab.jsx',    'scoring-ui/src/components/platform/tenant/TenantBrandingTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantCalendarTab.jsx',    'scoring-ui/src/components/platform/tenant/TenantCalendarTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantDisciplinesTab.jsx', 'scoring-ui/src/components/platform/tenant/TenantDisciplinesTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantGeneralTab.jsx',     'scoring-ui/src/components/platform/tenant/TenantGeneralTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantIntegrationsTab.jsx','scoring-ui/src/components/platform/tenant/TenantIntegrationsTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantRegionalTab.jsx',    'scoring-ui/src/components/platform/tenant/TenantRegionalTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantSsiTab.jsx',         'scoring-ui/src/components/platform/tenant/TenantSsiTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/TenantTemplatesTab.jsx',   'scoring-ui/src/components/platform/tenant/TenantTemplatesTab.jsx'],
  ['scoring-ui/src/components/platform/tenant/index.js',                 'scoring-ui/src/components/platform/tenant/index.js'],
  ['scoring-ui/src/components/platform/tenant/shared.jsx',               'scoring-ui/src/components/platform/tenant/shared.jsx'],
]

let ok = 0, skipped = 0, errors = 0

for (const [src, dest] of FILES) {
  try {
    const content = execSync(`git show release/r80-match-manager-base:${src}`, { encoding: 'buffer' })
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, content)
    // Verify no mangled bytes at start
    const first3 = Array.from(content.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    const hasBOM = content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF
    if (hasBOM) {
      // Strip UTF-8 BOM if present
      writeFileSync(dest, content.slice(3))
    }
    ok++
    console.log(`OK ${dest} (first bytes: ${first3}${hasBOM ? ' [BOM stripped]' : ''})`)
  } catch (e) {
    errors++
    console.error(`FAIL ${dest}: ${e.message.split('\n')[0]}`)
  }
}

console.log(`\nDone: ${ok} OK, ${skipped} skipped, ${errors} errors`)
