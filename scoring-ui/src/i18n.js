// Finnish UI strings for the scoring application
export const fi = {
  // Navigation
  back: 'Takaisin',
  cups: 'Cupit',
  matches: 'Ottelut',
  squads: 'Squadit',
  squad: 'Squad',
  
  // Common actions
  search: 'Hae',
  logout: 'Kirjaudu ulos',
  home: 'Alkuun',
  save: 'Tallenna',
  cancel: 'Peruuta',
  next: 'Seuraava',
  skip: 'Ohita',
  dismiss: 'Sulje',
  
  // App header
  appTitle: 'SSI Tools',
  loginSubtitle: 'Kirjaudu sisään aloittaaksesi tulosten syötön',
  
  // HomePage features
  scoringTitle: 'Kupittaa Cup tulosten syöttö',
  scoringDescription: 'Syötä kilpailutulokset puhelimella',
  registrationTitle: 'Kupittaa Cup ilmoittautuminen',
  registrationDescription: 'Ilmoittaudu Kupittaa CUP -kilpailuun',
  managementTitle: 'Kupittaa Cup hallinta',
  managementDescription: 'Squadien ja ilmoittautumisten hallinta',
  reportTitle: 'Raportti',
  reportDescription: 'Kilpailuraportit ja tilastot',
  summaryTitle: 'Yhteenveto',
  summaryDescription: 'Kilpailujen yhteenvetoraportti',
  
  // Loading states
  loading: 'Ladataan...',
  restoringSession: 'Palautetaan istuntoa...',
  
  // CupSearch
  searchCupPlaceholder: 'Cupin nimi, esim. Kupittaa',
  searchCupSubtitle: 'Hae cup aloittaaksesi tulosten syötön',
  noCupsFound: 'Cupeja ei löytynyt',
  tryDifferentSearch: 'Kokeile eri hakutermiä',
  today: 'TÄNÄÄN',
  
  // MatchPicker
  selectMatchSubtitle: 'Valitse ottelu tulosten syöttöön',
  todayLabel: 'Tänään',
  otherMatches: 'Muut ottelut',
  noMatchesToday: 'Ei otteluita tänään',
  selectFromOtherMatches: 'Valitse tulevista tai menneistä otteluista',
  active: 'Aktiivinen',
  
  // SquadPicker
  selectSquad: 'Valitse squad',
  shooters: 'ampujaa',
  
  // ShooterPicker
  noShootersFound: 'Ampujia ei löytynyt',
  scored: 'Kirjattu',
  pts: 'p',
  pickShooter: 'Valitse ampuja',
  
  // ScoringForm
  series: 'Sarja',
  hits: 'laukausta',
  tooManyShots: 'Liikaa laukauksia!',
  removeHitsBeforeSaving: 'Poista laukauksia ennen tallennusta',
  nextSeries: 'Seuraava',
  skipToSeries: 'Ohita',
  
  // CompetitorHeader
  saveScores: 'Tallenna tulokset',
  saving: 'Tallennetaan...',
  saved: 'Tallennettu!',
  saveFailed: 'Tallennus epäonnistui',
  total: 'Yhteensä',
  xCount: 'X-määrä',
  
  // Series view
  scoreAllShootersWarning: 'Syötä kaikkien ampujien tulokset ennen siirtymistä seuraavaan',
  seriesLowerCase: 'sarjaan',
  pairLowerCase: 'pariin',
  remaining: 'jäljellä',
  saveAndNext: 'Tallenna → Seuraava ampuja',
  tooManyShotsInButton: 'Liikaa laukauksia',
  doubleSeriesPairIncompleteError: (firstSeries, secondSeries, shots, requiredShots, firstShots, secondShots) =>
    `Tallennus estetty 2x-tilassa: sarjaparin ${firstSeries}+${secondSeries} pitää olla ${requiredShots}/${requiredShots} laukausta (5+5). Nyt ${shots}/${requiredShots} (${firstShots}+${secondShots}).`,
  incompleteSeriesSaveErrorHeader: (shotsPerSeries) => `Tallennus estetty: jokaisessa sarjassa pitää olla ${shotsPerSeries} laukausta tai sarjan pitää olla tyhjä.`,
  incompleteSeriesSaveErrorLine: (seriesNumber, shots, shotsPerSeries) => `Sarja ${seriesNumber}: ${shots}/${shotsPerSeries} laukausta`,
  
  // Staffing module
  staffingTitle: 'SRA-harjoitusten vetäjähallinta',
  staffingDescription: 'Ilmoittaudu vetäjäksi ja seuraa tilannetta',
  leadInstructor: 'Vastuuvetäjä',
  equipmentManager: 'Kalustovastaava',
  instructor: 'Vetäjä',
  instructors: 'Vetäjät',
  register: 'Ilmoittaudu',
  resign: 'Peru',
  resignConfirm: 'Haluatko varmasti perua ilmoittautumisesi?',
  registrationFull: 'Täynnä',
  shooterCount: 'Ampujia',
  noUpcomingEvents: 'Ei tulevia harjoituksia',
  adminOnly: 'Vain vetäjille',
  you: '(sinä)',
  registering: 'Ilmoittaudutaan...',
  resigning: 'Perutaan...',
  registered: 'Ilmoittautuminen onnistui',
  resigned: 'Ilmoittautuminen peruttu',
  operationFailed: 'Toiminto epäonnistui',
  selectRole: 'Valitse rooli',
  confirm: 'Vahvista',
  available: 'vapaa',
  taken: 'varattu',
  staffSlots: 'paikkaa',
  registerAsStaff: 'Ilmoittaudu vetäjäksi',
  cancelRegistration: 'Peru ilmoittautuminen',
  yourRole: 'Roolisi',
  filterAll: 'Kaikki',
  filterMissingRoles: 'Roolit puuttuu',
  filterMissingStaff: 'Vetäjiä puuttuu',
  filterMyEvents: 'Omat',
  missingRolesWarning: 'Vastuuvetäjä tai kalustovastaava puuttuu',

  // Management: DNS and Paid (CUP2/CUP3)
  setDns: 'DNS',
  undoDns: 'Peru DNS',
  dnsConfirm: (name) => `Aseta ${name} DNS?`,
  undoDnsConfirm: (name) => `Peru ${name} DNS?`,
  paid: 'Maksettu',
  unpaid: 'Ei maksettu',
  didNotShow: 'DNS',
  moveSquad: '→ S?',

  // Voice scoring
  voiceScoring: 'Äänisyöttö',
  voiceNotSupported: 'Puheentunnistus ei tue tätä selainta',
  voiceListening: 'Kuuntelee...',
  voiceStart: 'Aloita äänisyöttö',
  voiceStop: 'Lopeta äänisyöttö',

  // Tablet scoring
  tabletScoringTitle: 'Kupittaa Cup tulosten syöttö (Tabletti)',
  tabletScoringDescription: 'Syötä kilpailutulokset tabletilla tai tietokoneella',
  selectShooter: 'Valitse ampuja',
  shotsFired: 'laukausta',
  shotsTotal: 'yhteensä',
  scoreTrack: 'Tuloskortti',
  reenterScore: 'Valitse tulos muokataksesi sitä',
  loadingShooterData: 'Ladataan ampujan tietoja...',
  loadFromSSIFailed: 'SSI:n lataus epäonnistui',
  retryLoad: 'Yritä uudelleen',
  mergeConflict: 'Tietojen yhdistäminen',
  mergeConflictMessage: 'Paikalliset tulokset eroavat SSI:stä. Valitse kumpi pidetään:',
  keepLocal: 'Pidä paikalliset',
  keepSSI: 'Pidä SSI:n',
  string: 'Sarja',
  saveFailed: 'Tallennus epäonnistui',
  retryAction: 'Yritä uudelleen',
  scoresSavedLocally: 'Tulokset tallennettu paikallisesti',
  loggedInAs: 'Kirjautunut',
  saveToSSI: 'Tallenna SSI:hin',
  completed: 'Valmis',
  matchCompleted: 'Ottelu valmis',
}

// English UI strings
export const en = {
  // Navigation
  back: 'Back',
  cups: 'Cups',
  matches: 'Matches',
  squads: 'Squads',
  squad: 'Squad',
  
  // Common actions
  search: 'Search',
  logout: 'Logout',
  home: 'Home',
  save: 'Save',
  cancel: 'Cancel',
  next: 'Next',
  skip: 'Skip',
  dismiss: 'Close',
  
  // App header
  appTitle: 'SSI Tools',
  loginSubtitle: 'Login to start scoring',
  
  // HomePage features
  scoringTitle: 'Kupittaa Cup Scoring',
  scoringDescription: 'Enter competition scores by phone',
  registrationTitle: 'Kupittaa Cup Registration',
  registrationDescription: 'Register for Kupittaa CUP competition',
  managementTitle: 'Kupittaa Cup Management',
  managementDescription: 'Squad and registration management',
  reportTitle: 'Report',
  reportDescription: 'Competition reports and statistics',
  summaryTitle: 'Summary',
  summaryDescription: 'Competition summary report',
  
  // Loading states
  loading: 'Loading...',
  restoringSession: 'Restoring session...',
  
  // CupSearch
  searchCupPlaceholder: 'Cup name, e.g. Kupittaa',
  searchCupSubtitle: 'Search for a cup to start scoring',
  noCupsFound: 'No cups found',
  tryDifferentSearch: 'Try a different search term',
  today: 'TODAY',
  
  // MatchPicker
  selectMatchSubtitle: 'Select a match for scoring',
  todayLabel: 'Today',
  otherMatches: 'Other matches',
  noMatchesToday: 'No matches today',
  selectFromOtherMatches: 'Select from upcoming or past matches',
  active: 'Active',
  
  // SquadPicker
  selectSquad: 'Select squad',
  shooters: 'shooters',
  
  // ShooterPicker
  noShootersFound: 'No shooters found',
  scored: 'Scored',
  pts: 'pts',
  pickShooter: 'Pick shooter',
  
  // ScoringForm
  series: 'Series',
  hits: 'shots',
  tooManyShots: 'Too many shots!',
  removeHitsBeforeSaving: 'Remove shots before saving',
  nextSeries: 'Next',
  skipToSeries: 'Skip',
  
  // CompetitorHeader
  saveScores: 'Save scores',
  saving: 'Saving...',
  saved: 'Saved!',
  saveFailed: 'Save failed',
  total: 'Total',
  xCount: 'X-count',
  
  // Series view
  scoreAllShootersWarning: 'Enter scores for all shooters before moving to the next',
  seriesLowerCase: 'series',
  pairLowerCase: 'pair',
  remaining: 'remaining',
  saveAndNext: 'Save → Next shooter',
  tooManyShotsInButton: 'Too many shots',
  doubleSeriesPairIncompleteError: (firstSeries, secondSeries, shots, requiredShots, firstShots, secondShots) =>
    `Save blocked in 2x mode: pair ${firstSeries}+${secondSeries} must be ${requiredShots}/${requiredShots} shots (5+5). Current ${shots}/${requiredShots} (${firstShots}+${secondShots}).`,
  incompleteSeriesSaveErrorHeader: (shotsPerSeries) => `Save blocked: each string must have exactly ${shotsPerSeries} shots or be empty.`,
  incompleteSeriesSaveErrorLine: (seriesNumber, shots, shotsPerSeries) => `String ${seriesNumber}: ${shots}/${shotsPerSeries} shots`,
  
  // Staffing module
  staffingTitle: 'SRA Training Staff Management',
  staffingDescription: 'Sign up as staff and track status',
  leadInstructor: 'Lead Instructor',
  equipmentManager: 'Equipment Manager',
  instructor: 'Instructor',
  instructors: 'Instructors',
  register: 'Register',
  resign: 'Resign',
  resignConfirm: 'Are you sure you want to resign?',
  registrationFull: 'Full',
  shooterCount: 'Shooters',
  noUpcomingEvents: 'No upcoming training events',
  adminOnly: 'Admin only',
  you: '(you)',
  registering: 'Registering...',
  resigning: 'Resigning...',
  registered: 'Registration successful',
  resigned: 'Registration cancelled',
  operationFailed: 'Operation failed',
  selectRole: 'Select role',
  confirm: 'Confirm',
  available: 'available',
  taken: 'taken',
  staffSlots: 'slots',
  registerAsStaff: 'Register as staff',
  cancelRegistration: 'Cancel registration',
  yourRole: 'Your role',
  filterAll: 'All',
  filterMissingRoles: 'Missing roles',
  filterMissingStaff: 'Needs staff',
  filterMyEvents: 'My events',
  missingRolesWarning: 'Lead instructor or equipment manager missing',

  // Management: DNS and Paid (CUP2/CUP3)
  setDns: 'DNS',
  undoDns: 'Undo DNS',
  dnsConfirm: (name) => `Set ${name} as DNS?`,
  undoDnsConfirm: (name) => `Undo DNS for ${name}?`,
  paid: 'Paid',
  unpaid: 'Unpaid',
  didNotShow: 'DNS',
  moveSquad: '→ S?',

  // Voice scoring
  voiceScoring: 'Voice Scoring',
  voiceNotSupported: 'Speech recognition not supported in this browser',
  voiceListening: 'Listening...',
  voiceStart: 'Start voice scoring',
  voiceStop: 'Stop voice scoring',

  // Tablet scoring
  tabletScoringTitle: 'Kupittaa Cup Scoring (Tablet)',
  tabletScoringDescription: 'Enter competition scores on tablet or computer',
  selectShooter: 'Select shooter',
  shotsFired: 'shots',
  shotsTotal: 'total',
  scoreTrack: 'Score Card',
  reenterScore: 'Select score to edit it',
  loadingShooterData: 'Loading shooter data...',
  loadFromSSIFailed: 'Failed to load from SSI',
  retryLoad: 'Retry',
  mergeConflict: 'Data Merge',
  mergeConflictMessage: 'Local scores differ from SSI. Choose which to keep:',
  keepLocal: 'Keep Local',
  keepSSI: 'Keep SSI',
  string: 'String',
  saveFailed: 'Save failed',
  retryAction: 'Retry',
  scoresSavedLocally: 'Scores saved locally',
  loggedInAs: 'Logged in',
  saveToSSI: 'Save to SSI',
  completed: 'Completed',
  matchCompleted: 'Match Completed',
}

// Detect browser language and return appropriate translations
function getLanguage() {
  // In test environment or when navigator is not available, default to Finnish
  if (typeof navigator === 'undefined' || !navigator.language) {
    return fi
  }
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('en')) {
    return en
  }
  return fi // Default to Finnish
}

export default getLanguage()
