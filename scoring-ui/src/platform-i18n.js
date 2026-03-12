// ============================================================
// Platform i18n — Finnish/English translations for Match Management Platform
//
// Usage:
//   import { PlatformI18nProvider, usePlatformT } from '../platform-i18n.js'
//
//   // In PlatformApp root:
//   <PlatformI18nProvider>...</PlatformI18nProvider>
//
//   // In any platform component:
//   const t = usePlatformT()
//   <h1>{t('dashboard')}</h1>
//
// Language detection: browser language → localStorage override.
// ============================================================

import { createContext, useContext, useState, useCallback } from 'react'

// ---- Finnish translations ----
const fi = {
  // App chrome
  appName: 'Match Management',
  signOut: 'Kirjaudu ulos',
  loading: 'Ladataan...',
  cancel: 'Peruuta',
  save: 'Tallenna',
  saving: 'Tallennetaan...',
  delete: 'Poista',
  edit: 'Muokkaa',
  close: 'Sulje',
  back: 'Takaisin',
  confirm: 'Vahvista',
  dismiss: 'Sulje',
  yes: 'Kyllä',
  no: 'Ei',
  error: 'Virhe',
  retry: 'Yritä uudelleen',
  select: 'Valitse',
  remove: 'Poista',
  actions: 'Toiminnot',

  // Navigation — sidebar & mobile
  navDashboard: 'Etusivu',
  navTemplates: 'Mallipohjat',
  navSchedule: 'Aikataulu',
  navRoster: 'Vetäjälista',
  navJoin: 'Liity',
  navMyProfile: 'Profiilini',
  navTenant: 'Organisaatio',
  navMembers: 'Jäsenet',
  navSettings: 'Asetukset',
  navMore: 'Lisää',
  navHome: 'Etusivu',
  sectionEventManagement: 'Tapahtumahallinta',
  sectionInstructorRoster: 'Vetäjälista',
  sectionAdmin: 'Ylläpito',

  // Welcome page
  welcomeTitle: 'Match Management Platform',
  welcomeSubtitle: 'Hallitse ampumakilpailusi — mallipohjista aikatauluihin ja vetäjähallintaan.',
  welcomeSignIn: 'Kirjaudu sisään',
  welcomeFeatureTemplates: 'Mallipohjat',
  welcomeFeatureTemplatesDesc: 'Tuo tapahtumapohjia SSI:stä ja luo uudelleenkäytettäviä malleja eri lajeille.',
  welcomeFeatureScheduling: 'Eräajastus',
  welcomeFeatureSchedulingDesc: 'Luo koko kauden tapahtumat kerralla. Julkaise automaattisesti kalenteriin.',
  welcomeFeatureRoster: 'Vetäjälista',
  welcomeFeatureRosterDesc: 'Hallitse vetäjäpoolia itseilmoittautumisella, hyväksynnällä ja miehityksellä.',
  welcomeTrialTitle: 'Aloita ilmainen 30 päivän kokeilu',
  welcomeTrialSubtitle: 'Luottokorttia ei tarvita. Kaikki toiminnot käytössä kokeilujakson ajan.',
  welcomeOrgPlaceholder: 'Organisaation nimi (esim. TurRes)',
  welcomeNamePlaceholder: 'Nimesi',
  welcomeEmailPlaceholder: 'Sähköpostiosoite',
  welcomePasswordPlaceholder: 'Salasana (vähintään 8 merkkiä)',
  welcomeCreating: 'Luodaan tiliä...',
  welcomeCreateAccount: 'Luo tili ja aloita kokeilu',
  welcomeAlreadyHaveAccount: 'Onko sinulla jo tili?',

  // Sign in page
  signInTitle: 'Kirjaudu sisään',
  signInSubtitle: 'Kirjaudu Match Management -tilillesi',
  signInEmail: 'Sähköposti',
  signInPassword: 'Salasana',
  signInForgotPassword: 'Unohditko salasanan?',
  signInSubmitting: 'Kirjaudutaan...',
  signInSubmit: 'Kirjaudu sisään',
  signInNoAccount: 'Eikö sinulla ole tiliä?',
  signInCreateOne: 'Luo tili',
  signInCreateAccount: 'Luo tili',

  // Forgot password page
  forgotPasswordTitle: 'Palauta salasana',
  forgotPasswordSubtitle: 'Anna sähköpostiosoitteesi, niin lähetämme sinulle linkin salasanan vaihtamiseen.',
  forgotPasswordBackToSignIn: 'Takaisin kirjautumiseen',
  forgotPasswordEmailLabel: 'Sähköpostiosoite',
  forgotPasswordSending: 'Lähetetään...',
  forgotPasswordSendLink: 'Lähetä palautuslinkki',
  forgotPasswordRemember: 'Muistatko salasanasi?',
  forgotPasswordCheckEmail: 'Tarkista sähköpostisi',
  forgotPasswordSentMessage: (email) => `Jos tili osoitteella ${email} on olemassa, olemme lähettäneet salasanan palautuslinkin. Linkki vanhenee tunnin kuluttua.`,
  forgotPasswordSpamNote: 'Etkö saanut sähköpostia? Tarkista roskapostikansio tai yritä uudelleen.',
  forgotPasswordTryDifferent: 'Kokeile eri sähköpostia',

  // Reset password page
  resetPasswordTitle: 'Aseta uusi salasana',
  resetPasswordNewPassword: 'Uusi salasana',
  resetPasswordConfirm: 'Vahvista uusi salasana',
  resetPasswordSubmitting: 'Vaihdetaan...',
  resetPasswordSubmit: 'Vaihda salasana',
  resetPasswordMinChars: 'Vähintään 8 merkkiä',
  resetPasswordNoMatch: 'Salasanat eivät täsmää',

  // MFA challenge page
  mfaTitle: 'Kaksivaiheinen tunnistautuminen',
  mfaCodePrompt: 'Syötä 6-numeroinen koodi tunnistautumissovelluksestasi.',
  mfaRecoveryPrompt: 'Syötä yksi palautuskoodeistasi.',
  mfaVerificationCode: 'Vahvistuskoodi',
  mfaRecoveryCode: 'Palautuskoodi',
  mfaVerifying: 'Vahvistetaan...',
  mfaVerify: 'Vahvista',
  mfaUseRecovery: 'Käytä palautuskoodia',
  mfaUseAuthenticator: 'Käytä tunnistautumiskoodia',

  // Tenant create page
  tenantCreateTitle: 'Luo organisaatio',
  tenantCreateDesc: 'Organisaatio edustaa seuraasi tai klubiasi. Jokaisella organisaatiolla on omat mallipohjat, tapahtumat ja vetäjälista.',
  tenantCreateOrgDetails: 'Organisaation tiedot',
  tenantCreateNameLabel: 'Organisaation nimi',
  tenantCreateNamePlaceholder: 'esim. TurRes, Porin Reserviläiset',
  tenantCreateNameHint: 'Tämä näkyy organisaatiovalitsimessa ja tunnistaa organisaatiosi.',
  tenantCreateSsiCredentials: 'SSI-tunnukset',
  tenantCreateCalendarBackend: 'Kalenteripalvelu',
  tenantCreateConfigureLater: 'määritä luonnin jälkeen',
  tenantCreateTrialTitle: '30 päivän ilmainen kokeilu',
  tenantCreateCreating: 'Luodaan...',
  tenantCreateSubmit: 'Luo organisaatio',

  // Join invite page
  joinInviteTitle: 'Liity organisaatioon',
  joinInviteInvalid: 'Virheellinen kutsu',
  joinInviteGoToPlatform: 'Siirry alustalle',
  joinInviteJoin: (tenantName) => `Liity organisaatioon ${tenantName}`,
  joinInviteInvitedBy: (name) => `${name} on kutsunut sinut liittymään organisaatioonsa.`,
  joinInviteLoggedIn: 'Olet kirjautunut sisään. Haluatko hyväksyä tämän kutsun?',
  joinInviteAccepting: 'Liitytään...',
  joinInviteAccept: 'Hyväksy kutsu',
  joinInviteSetupAccount: 'Anna nimesi ja luo salasana tilisi luomiseksi.',
  joinInviteFullName: 'Koko nimi',
  joinInviteCreatePassword: 'Luo salasana',
  joinInviteCreateAndJoin: 'Luo tili ja liity',

  // Dashboard
  dashboard: 'Etusivu',
  staffingGaps: 'Miehitysaukot',
  goToRoster: 'Siirry vetäjälistaan',
  loadingStaffingData: 'Ladataan miehitystietoja...',
  allEventsStaffed: 'Kaikki tapahtumat ovat miehitettyjä',
  noOpenRoles: 'Ei avoimia rooleja tuleville tapahtumille.',
  upcomingEvents: 'Tulevat tapahtumat',
  viewAll: 'Näytä kaikki',
  loadingEvents: 'Ladataan tapahtumia...',
  noUpcomingEventsInDays: 'Ei tulevia tapahtumia seuraavan 30 päivän aikana.',
  goToScheduleToCreate: 'Siirry aikatauluun luodaksesi tapahtumia',
  unnamedEvent: 'Nimetön tapahtuma',
  noSsiId: 'Ei SSI-tunnusta',
  volunteerActivity: 'Vapaaehtoistoiminta',
  allTime: 'Koko aika',
  last12Months: 'Viimeiset 12 kk',
  last6Months: 'Viimeiset 6 kk',
  last3Months: 'Viimeiset 3 kk',
  noStaffingActivity: 'Ei miehitystoimintaa vielä.',
  activityAppears: 'Toiminta näkyy täällä kun jäsenet ilmoittautuvat tapahtumiin.',
  events: 'tapahtumaa',

  // Status badges
  statusReady: 'Valmis',
  statusPlanned: 'Suunniteltu',
  statusFailed: 'Epäonnistunut',
  statusSsiCreated: 'SSI luotu',
  statusCalendarPublished: 'Julkaistu',
  statusCompleted: 'Valmis',
  statusCancelled: 'Peruttu',

  // Account settings
  accountSettings: 'Tiliasetukset',
  accountSettingsDesc: 'Hallitse profiiliasi ja turvallisuusasetuksiasi',
  profileTitle: 'Profiili',
  profileDesc: 'Tilisi nimi ja sähköpostiosoite.',
  profileName: 'Nimi',
  profileEmail: 'Sähköposti',
  profileEmailNote: 'Tämä on kirjautumissähköpostisi. Muutos vaikuttaa kirjautumiseen.',
  profileUpdated: 'Profiili päivitetty',
  saveProfile: 'Tallenna profiili',
  changePasswordTitle: 'Vaihda salasana',
  changePasswordDesc: 'Päivitä tilisi salasana. Nykyinen salasana vaaditaan vahvistukseksi.',
  currentPassword: 'Nykyinen salasana',
  newPassword: 'Uusi salasana',
  confirmNewPassword: 'Vahvista uusi salasana',
  minChars: 'Vähintään 8 merkkiä',
  passwordsNoMatch: 'Salasanat eivät täsmää',
  changingPassword: 'Vaihdetaan...',
  changePassword: 'Vaihda salasana',
  passwordChanged: 'Salasana vaihdettu onnistuneesti',

  // MFA settings
  mfaSettingsTitle: 'Kaksivaiheinen tunnistautuminen (MFA)',
  mfaSettingsDesc: 'Lisää ylimääräinen suojakerros tilillesi tunnistautumissovelluksella.',
  mfaEnabled: 'MFA on käytössä',
  mfaNotEnabled: 'MFA ei ole käytössä',
  mfaSettingUp: 'Alustetaan...',
  mfaEnableBtn: 'Ota MFA käyttöön',
  mfaDisableBtn: 'Poista MFA käytöstä',
  mfaStep1: 'Vaihe 1: Skannaa QR-koodi tunnistautumissovelluksellasi',
  mfaStep1Hint: 'Käytä Google Authenticatoria, Authya tai mitä tahansa TOTP-yhteensopivaa sovellusta.',
  mfaStep2: 'Vaihe 2: Tallenna palautuskoodisi',
  mfaStep2Hint: 'Nämä koodit voidaan käyttää jos menetät pääsyn tunnistautumissovellukseesi. Jokainen koodi on kertakäyttöinen. Tallenna ne turvallisesti!',
  mfaStep3: 'Vaihe 3: Syötä koodi tunnistautumissovelluksestasi',
  mfaCopyToClipboard: 'Kopioi leikepöydälle',
  mfaCodesCopied: 'Palautuskoodit kopioitu leikepöydälle',
  mfaVerifyAndEnable: 'Vahvista ja ota käyttöön',
  mfaEnabledSuccess: 'MFA otettu käyttöön onnistuneesti!',
  mfaDisabledSuccess: 'MFA on poistettu käytöstä.',
  mfaDisableConfirm: 'Anna salasanasi vahvistaaksesi. Tilisi ei enää vaadi toista tunnistautumisvaihetta.',
  mfaCurrentPasswordPlaceholder: 'Nykyinen salasana',
  mfaDisabling: 'Poistetaan...',
  show: 'Näytä',
  hide: 'Piilota',

  // Members page
  membersTitle: 'Jäsenet ja kutsut',
  membersDesc: 'Hallitse jäseniä ja heidän roolejaan organisaatiossasi.',
  inviteMember: 'Kutsu jäsen',
  pendingInvitations: 'Odottavat kutsut',
  activeMembers: 'Aktiiviset jäsenet',
  emailColumn: 'Sähköposti',
  rolesColumn: 'Roolit',
  invitedColumn: 'Kutsuttu',
  actionsColumn: 'Toiminnot',
  nameColumn: 'Nimi',
  joinedColumn: 'Liittynyt',
  revoke: 'Peruuta',
  revokeConfirm: 'Peruuta tämä kutsu?',
  roles: 'Roolit',
  removeConfirm: (name) => `Poista ${name} organisaatiosta?`,
  noMembersFound: 'Jäseniä ei löytynyt.',
  inviteModalTitle: 'Kutsu jäsen',
  inviteModalDesc: 'Lähetä kutsulinkki sähköpostilla. Vastaanottaja voi luoda tilin ja liittyä organisaatioon.',
  inviteEmailLabel: 'Sähköpostiosoite',
  inviteRolesLabel: 'Roolit',
  inviteSelectRole: 'Valitse vähintään yksi rooli.',
  inviteNoPermission: 'Sinulla ei ole oikeutta kutsua jäseniä.',
  inviteSending: 'Lähetetään...',
  inviteSend: 'Lähetä kutsu',
  memberRoleAtLeastOne: 'Jäsenellä täytyy olla vähintään yksi rooli.',
  you: '(sinä)',
  loadingMembers: 'Ladataan jäseniä...',
  unknown: 'Tuntematon',

  // Role labels
  roleOwner: 'Omistaja',
  roleTenantAdmin: 'Ylläpitäjä',
  roleMatchAdmin: 'Otteluhallinta',
  roleDisciplineAdmin: 'Lajihallinta',
  roleInstructorAdmin: 'Vetäjähallinta',
  roleInstructor: 'Vetäjä',
  roleOwnerDesc: 'Täysi pääsy, laskutus ja SSI-tunnukset',
  roleTenantAdminDesc: 'Hallitse jäseniä ja kaikkia asetuksia',
  roleMatchAdminDesc: 'Hallitse mallipohjia ja aikatauluta otteluita',
  roleDisciplineAdminDesc: 'Hallitse lajeja',
  roleInstructorAdminDesc: 'Hyväksy vetäjiä',
  roleInstructorDesc: 'Voi toimia ottelun henkilökuntana/RO',

  // Roster / Event Staffing
  eventStaffing: 'Tapahtumien miehitys',
  eventStaffingDesc: 'Ilmoittaudu vetäjäksi tuleviin tapahtumiin. Vetäjäroolin omaavia jäseniä kannustetaan ilmoittautumaan.',
  populateFromTemplates: 'Täytä mallipohjista',
  populateFromTemplatesTitle: 'Täytä miehitystarpeet mallipohjista',
  running: 'Suoritetaan...',
  loadingStaffing: 'Ladataan miehitystietoja...',
  filterAll: 'Kaikki',
  filterNeedStaff: 'Tarvitsee vetäjiä',
  filterStaffed: 'Miehitetty',
  filterMyEvents: 'Omat tapahtumat',
  needsStaff: 'Tarvitsee vetäjiä',
  staffed: 'Miehitetty',
  staff: 'Vetäjät',
  noStaffingNeeds: 'Tulevilla tapahtumilla ei ole miehitystarpeita.',
  noStaffingNeedsHint: 'Klikkaa "Täytä mallipohjista" lisätäksesi miehitystarpeet olemassa oleville tapahtumille, tai luo uusia tapahtumia mallipohjista joissa on miehityssäännöt.',
  noEventsMatchFilter: 'Yhtään tapahtumaa ei vastaa nykyistä suodatinta.',
  match: 'ottelu',
  matches: 'ottelua',
  needed: 'tarvitaan',
  signedUp: 'Ilmoittautunut',
  full: 'Täynnä',
  allRolesFilled: 'Kaikki roolit täytetty',
  today: 'Tänään',
  tomorrow: 'Huomenna',
  inDays: (n) => `${n} päivän päästä`,
  withdrawing: 'Perutaan...',
  withdraw: 'Peru ilmoittautuminen',
  signUp: 'Ilmoittaudu',
  signedUpForEvents: (n) => `Olet ilmoittautunut ${n} tapahtumaan`,
  chooseRole: 'Valitse rooli',
  positionsFilled: 'paikkaa täytetty',
  scheduledBy: 'Ajoittaja',
  backfillComplete: 'Täyttö valmis',
  populated: 'Täytetty',
  skipped: 'Ohitettu',
  errors: 'virheitä',
  unmatchedEventsPrompt: (n) => `${n} tapahtumaa ei voitu yhdistää mallipohjaan. Valitse mallipohja:`,
  backfillPermissionDenied: 'Vain omistajat ja ylläpitäjät voivat suorittaa täytön.',
  withdrawConfirm: 'Haluatko varmasti perua ilmoittautumisesi tähän tapahtumaan?',
  signupFailed: 'Ilmoittautuminen epäonnistui',
  withdrawalFailed: 'Peruminen epäonnistui',
  backfillFailed: 'Täyttö epäonnistui',

  // Placeholder view
  comingSoon: 'Tämä näkymä on tulossa pian. Rakenne on määritelty käyttöliittymäprototyypissä.',
  noTenantSelected: 'Organisaatiota ei ole valittu',
  noTenantSelectedDesc: 'Luo tai valitse organisaatio aloittaaksesi.',
  viewNotFound: (view) => `Näkymää "${view}" ei ole olemassa.`,

  // Language selector
  language: 'Kieli',
  languageFi: 'Suomi',
  languageEn: 'English',
}

// ---- English translations ----
const en = {
  // App chrome
  appName: 'Match Management',
  signOut: 'Sign out',
  loading: 'Loading...',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
  delete: 'Delete',
  edit: 'Edit',
  close: 'Close',
  back: 'Back',
  confirm: 'Confirm',
  dismiss: 'Dismiss',
  yes: 'Yes',
  no: 'No',
  error: 'Error',
  retry: 'Retry',
  select: 'Select',
  remove: 'Remove',
  actions: 'Actions',

  // Navigation — sidebar & mobile
  navDashboard: 'Dashboard',
  navTemplates: 'Templates',
  navSchedule: 'Schedule',
  navRoster: 'Roster',
  navJoin: 'Join',
  navMyProfile: 'My Profile',
  navTenant: 'Tenant',
  navMembers: 'Members',
  navSettings: 'Settings',
  navMore: 'More',
  navHome: 'Home',
  sectionEventManagement: 'Event Management',
  sectionInstructorRoster: 'Instructor Roster',
  sectionAdmin: 'Admin',

  // Welcome page
  welcomeTitle: 'Match Management Platform',
  welcomeSubtitle: 'Streamline your shooting competition events — from templates to schedules to instructor management.',
  welcomeSignIn: 'Sign in',
  welcomeFeatureTemplates: 'Templates',
  welcomeFeatureTemplatesDesc: 'Import seed events from SSI and create reusable templates for any discipline.',
  welcomeFeatureScheduling: 'Batch Scheduling',
  welcomeFeatureSchedulingDesc: 'Create an entire season of events in one go. Auto-publish to calendars.',
  welcomeFeatureRoster: 'Instructor Roster',
  welcomeFeatureRosterDesc: 'Manage your instructor pool with self-registration, approvals, and staffing.',
  welcomeTrialTitle: 'Start your free 30-day trial',
  welcomeTrialSubtitle: 'No credit card required. Full functionality during trial.',
  welcomeOrgPlaceholder: 'Organization name (e.g. TurRes)',
  welcomeNamePlaceholder: 'Your name',
  welcomeEmailPlaceholder: 'Email address',
  welcomePasswordPlaceholder: 'Password (min 8 characters)',
  welcomeCreating: 'Creating account...',
  welcomeCreateAccount: 'Create Account & Start Trial',
  welcomeAlreadyHaveAccount: 'Already have an account?',

  // Sign in page
  signInTitle: 'Sign in',
  signInSubtitle: 'Sign in to your Match Management account',
  signInEmail: 'Email',
  signInPassword: 'Password',
  signInForgotPassword: 'Forgot password?',
  signInSubmitting: 'Signing in...',
  signInSubmit: 'Sign in',
  signInNoAccount: "Don't have an account?",
  signInCreateOne: 'Create one',
  signInCreateAccount: 'Create account',

  // Forgot password page
  forgotPasswordTitle: 'Reset Password',
  forgotPasswordSubtitle: "Enter your email address and we'll send you a link to reset your password.",
  forgotPasswordBackToSignIn: 'Back to Sign in',
  forgotPasswordEmailLabel: 'Email Address',
  forgotPasswordSending: 'Sending...',
  forgotPasswordSendLink: 'Send Reset Link',
  forgotPasswordRemember: 'Remember your password?',
  forgotPasswordCheckEmail: 'Check your email',
  forgotPasswordSentMessage: (email) => `If an account with ${email} exists, we've sent a password reset link. The link expires in 1 hour.`,
  forgotPasswordSpamNote: "Didn't receive an email? Check your spam folder, or try again.",
  forgotPasswordTryDifferent: 'Try a different email',

  // Reset password page
  resetPasswordTitle: 'Set New Password',
  resetPasswordNewPassword: 'New Password',
  resetPasswordConfirm: 'Confirm New Password',
  resetPasswordSubmitting: 'Changing...',
  resetPasswordSubmit: 'Change Password',
  resetPasswordMinChars: 'Minimum 8 characters',
  resetPasswordNoMatch: 'Passwords do not match',

  // MFA challenge page
  mfaTitle: 'Two-Factor Authentication',
  mfaCodePrompt: 'Enter the 6-digit code from your authenticator app.',
  mfaRecoveryPrompt: 'Enter one of your recovery codes.',
  mfaVerificationCode: 'Verification Code',
  mfaRecoveryCode: 'Recovery Code',
  mfaVerifying: 'Verifying...',
  mfaVerify: 'Verify',
  mfaUseRecovery: 'Use recovery code',
  mfaUseAuthenticator: 'Use authenticator code',

  // Tenant create page
  tenantCreateTitle: 'Create Organization',
  tenantCreateDesc: 'A tenant represents your organization or club. Each tenant has its own templates, events, and instructor roster.',
  tenantCreateOrgDetails: 'Organization Details',
  tenantCreateNameLabel: 'Organization Name',
  tenantCreateNamePlaceholder: 'e.g. TurRes, Porin Reserviläiset',
  tenantCreateNameHint: 'This will be shown in the tenant switcher and used to identify your organization.',
  tenantCreateSsiCredentials: 'SSI Credentials',
  tenantCreateCalendarBackend: 'Calendar Backend',
  tenantCreateConfigureLater: 'configure after creation',
  tenantCreateTrialTitle: '30-day free trial',
  tenantCreateCreating: 'Creating...',
  tenantCreateSubmit: 'Create Organization',

  // Join invite page
  joinInviteTitle: 'Join Organization',
  joinInviteInvalid: 'Invalid Invitation',
  joinInviteGoToPlatform: 'Go to Platform',
  joinInviteJoin: (tenantName) => `Join ${tenantName}`,
  joinInviteInvitedBy: (name) => `You have been invited by ${name} to join their organization.`,
  joinInviteLoggedIn: 'You are currently logged in. Do you want to accept this invitation?',
  joinInviteAccepting: 'Joining...',
  joinInviteAccept: 'Accept Invitation',
  joinInviteSetupAccount: 'Please enter your name and create a password to set up your account.',
  joinInviteFullName: 'Full Name',
  joinInviteCreatePassword: 'Create Password',
  joinInviteCreateAndJoin: 'Create Account & Join',

  // Dashboard
  dashboard: 'Dashboard',
  staffingGaps: 'Staffing Gaps',
  goToRoster: 'Go to Roster',
  loadingStaffingData: 'Loading staffing data...',
  allEventsStaffed: 'All events are fully staffed',
  noOpenRoles: 'No open roles for upcoming events.',
  upcomingEvents: 'Upcoming Events',
  viewAll: 'View all',
  loadingEvents: 'Loading events...',
  noUpcomingEventsInDays: 'No upcoming events scheduled in the next 30 days.',
  goToScheduleToCreate: 'Go to Schedule to create some',
  unnamedEvent: 'Unnamed Event',
  noSsiId: 'No SSI ID',
  volunteerActivity: 'Volunteer Activity',
  allTime: 'All time',
  last12Months: 'Last 12 months',
  last6Months: 'Last 6 months',
  last3Months: 'Last 3 months',
  noStaffingActivity: 'No staffing activity yet.',
  activityAppears: 'Activity will appear here as members sign up for event roles.',
  events: 'events',

  // Status badges
  statusReady: 'Ready',
  statusPlanned: 'Planned',
  statusFailed: 'Failed',
  statusSsiCreated: 'SSI Created',
  statusCalendarPublished: 'Published',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',

  // Account settings
  accountSettings: 'Account Settings',
  accountSettingsDesc: 'Manage your profile and security',
  profileTitle: 'Profile',
  profileDesc: 'Your account name and email address.',
  profileName: 'Name',
  profileEmail: 'Email',
  profileEmailNote: 'This is your login email. Changing it will require you to use the new email to sign in.',
  profileUpdated: 'Profile updated',
  saveProfile: 'Save Profile',
  changePasswordTitle: 'Change Password',
  changePasswordDesc: 'Update your account password. You must enter your current password to confirm.',
  currentPassword: 'Current Password',
  newPassword: 'New Password',
  confirmNewPassword: 'Confirm New Password',
  minChars: 'Minimum 8 characters',
  passwordsNoMatch: 'Passwords do not match',
  changingPassword: 'Changing...',
  changePassword: 'Change Password',
  passwordChanged: 'Password changed successfully',

  // MFA settings
  mfaSettingsTitle: 'Two-Factor Authentication (MFA)',
  mfaSettingsDesc: 'Add an extra layer of security to your account using an authenticator app.',
  mfaEnabled: 'MFA is enabled',
  mfaNotEnabled: 'MFA is not enabled',
  mfaSettingUp: 'Setting up...',
  mfaEnableBtn: 'Enable MFA',
  mfaDisableBtn: 'Disable MFA',
  mfaStep1: 'Step 1: Scan the QR code with your authenticator app',
  mfaStep1Hint: 'Use Google Authenticator, Authy, or any TOTP-compatible app.',
  mfaStep2: 'Step 2: Save your recovery codes',
  mfaStep2Hint: 'These codes can be used if you lose access to your authenticator app. Each code can only be used once. Save them securely!',
  mfaStep3: 'Step 3: Enter the code from your authenticator app',
  mfaCopyToClipboard: 'Copy to clipboard',
  mfaCodesCopied: 'Recovery codes copied to clipboard',
  mfaVerifyAndEnable: 'Verify & Enable',
  mfaEnabledSuccess: 'MFA enabled successfully!',
  mfaDisabledSuccess: 'MFA has been disabled.',
  mfaDisableConfirm: 'Enter your password to confirm. Your account will no longer require a second factor to sign in.',
  mfaCurrentPasswordPlaceholder: 'Current password',
  mfaDisabling: 'Disabling...',
  show: 'Show',
  hide: 'Hide',

  // Members page
  membersTitle: 'Members & Invitations',
  membersDesc: 'Manage members and their roles in your organization.',
  inviteMember: 'Invite Member',
  pendingInvitations: 'Pending Invitations',
  activeMembers: 'Active Members',
  emailColumn: 'Email',
  rolesColumn: 'Roles',
  invitedColumn: 'Invited',
  actionsColumn: 'Actions',
  nameColumn: 'Name',
  joinedColumn: 'Joined',
  revoke: 'Revoke',
  revokeConfirm: 'Revoke this invitation?',
  roles: 'Roles',
  removeConfirm: (name) => `Remove ${name} from this organization?`,
  noMembersFound: 'No members found.',
  inviteModalTitle: 'Invite Member',
  inviteModalDesc: 'Send an invitation link by email. The recipient can create an account and join this tenant.',
  inviteEmailLabel: 'Email Address',
  inviteRolesLabel: 'Roles',
  inviteSelectRole: 'Select at least one role.',
  inviteNoPermission: 'You do not have permission to invite members.',
  inviteSending: 'Sending...',
  inviteSend: 'Send Invitation',
  memberRoleAtLeastOne: 'A member must have at least one role.',
  you: '(you)',
  loadingMembers: 'Loading members...',
  unknown: 'Unknown',

  // Role labels
  roleOwner: 'Owner',
  roleTenantAdmin: 'Tenant Admin',
  roleMatchAdmin: 'Match Admin',
  roleDisciplineAdmin: 'Discipline Admin',
  roleInstructorAdmin: 'Instructor Admin',
  roleInstructor: 'Instructor',
  roleOwnerDesc: 'Full access, billing, and SSI credentials',
  roleTenantAdminDesc: 'Manage members and all settings',
  roleMatchAdminDesc: 'Manage templates and schedule matches',
  roleDisciplineAdminDesc: 'Manage disciplines',
  roleInstructorAdminDesc: 'Approve instructors',
  roleInstructorDesc: 'Can act as match staff/RO',

  // Roster / Event Staffing
  eventStaffing: 'Event Staffing',
  eventStaffingDesc: 'Sign up to staff upcoming events. Members with the instructor role are encouraged to volunteer.',
  populateFromTemplates: 'Populate from Templates',
  populateFromTemplatesTitle: 'Populate staffing needs for events from their templates',
  running: 'Running...',
  loadingStaffing: 'Loading staffing data...',
  filterAll: 'All',
  filterNeedStaff: 'Need Staff',
  filterStaffed: 'Staffed',
  filterMyEvents: 'My Events',
  needsStaff: 'Needs staff',
  staffed: 'Staffed',
  staff: 'Staff',
  noStaffingNeeds: 'No upcoming events have staffing needs configured.',
  noStaffingNeedsHint: 'Click "Populate from Templates" above to add staffing needs to existing events, or create new events from templates with staffing rules.',
  noEventsMatchFilter: 'No events match the current filter.',
  match: 'match',
  matches: 'matches',
  needed: 'needed',
  signedUp: 'Signed up',
  full: 'Full',
  allRolesFilled: 'All roles filled',
  today: 'Today',
  tomorrow: 'Tomorrow',
  inDays: (n) => `In ${n} days`,
  withdrawing: 'Withdrawing...',
  withdraw: 'Withdraw',
  signUp: 'Sign Up',
  signedUpForEvents: (n) => `You are signed up for ${n} event${n !== 1 ? 's' : ''}`,
  chooseRole: 'Choose a role',
  positionsFilled: 'positions filled',
  scheduledBy: 'Scheduled by',
  backfillComplete: 'Backfill complete',
  populated: 'Populated',
  skipped: 'Skipped',
  errors: 'errors',
  unmatchedEventsPrompt: (n) => `${n} event(s) couldn't be matched to a template. Select a template to assign:`,
  backfillPermissionDenied: 'Only owners and tenant admins can run backfill.',
  withdrawConfirm: 'Are you sure you want to withdraw from this event?',
  signupFailed: 'Signup failed',
  withdrawalFailed: 'Withdrawal failed',
  backfillFailed: 'Backfill failed',

  // Placeholder view
  comingSoon: 'This view is coming soon. The structure is defined in the UI prototype.',
  noTenantSelected: 'No Tenant Selected',
  noTenantSelectedDesc: 'Create or select a tenant to get started.',
  viewNotFound: (view) => `View "${view}" does not exist.`,

  // Language selector
  language: 'Language',
  languageFi: 'Suomi',
  languageEn: 'English',
}

// ---- Language detection ----
const STORAGE_KEY = 'platform-lang'

function detectLanguage() {
  // Check localStorage override
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'fi' || stored === 'en') return stored
  } catch { /* ignore */ }
  // Browser language detection
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('en')) return 'en'
  }
  return 'fi' // Default to Finnish
}

// ---- React Context ----
const I18nContext = createContext(null)

/**
 * Platform i18n provider. Wrap PlatformApp with this.
 * Provides language state + t() function to all children.
 */
export function PlatformI18nProvider({ children }) {
  const [lang, setLang] = useState(detectLanguage)
  const strings = lang === 'en' ? en : fi

  const setLanguage = useCallback((newLang) => {
    setLang(newLang)
    try { localStorage.setItem(STORAGE_KEY, newLang) } catch { /* ignore */ }
  }, [])

  // t(key) — lookup string, return key if missing
  const t = useCallback((key, ...args) => {
    const val = strings[key]
    if (val === undefined) return key
    if (typeof val === 'function') return val(...args)
    return val
  }, [strings])

  return (
    <I18nContext.Provider value={{ t, lang, setLanguage }}>
      {children}
    </I18nContext.Provider>
  )
}

/**
 * Hook: get the t() translation function.
 * Returns { t, lang, setLanguage }
 */
export function usePlatformT() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback for components rendered outside provider (e.g. tests)
    return {
      t: (key) => key,
      lang: 'en',
      setLanguage: () => {},
    }
  }
  return ctx
}

// Export dictionaries for testing
export { fi, en }
