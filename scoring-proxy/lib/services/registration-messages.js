export const REGISTRATION_MESSAGES_FI = {
  validationInvalid: 'Virheelliset tiedot.',
  captchaExpired: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.',
  captchaWrong: 'Väärä vastaus. Yritä uudelleen.',
  cupFull: 'Tapahtuma on täynnä.',
  squadFull: 'Valittu squad on täynnä.',
  capacityFull: 'Tapahtuma tai squad on täynnä.',
  registrationReceived: 'Ilmoittautuminen vastaanotettu.',
  registrationSynced: 'Ilmoittautuminen onnistui ja SSI-squadiin asettelu onnistui.',
  registrationManualNeeded: 'Ilmoittautuminen vastaanotettu. Järjestäjä näkee ilmoittautumisesi osallistujalistalla.',
  registrationPartial: 'Ilmoittautuminen vastaanotettu. SSI-käsittely onnistui osittain ja järjestäjä tarkistaa tilanteen.',
  registrationSyncFailed: 'Ilmoittautuminen vastaanotettu. SSI-käsittely epäonnistui, mutta järjestäjä näkee ilmoittautumisesi.',
}

export function registrationMessage(key) {
  return REGISTRATION_MESSAGES_FI[key] || REGISTRATION_MESSAGES_FI.registrationReceived
}
