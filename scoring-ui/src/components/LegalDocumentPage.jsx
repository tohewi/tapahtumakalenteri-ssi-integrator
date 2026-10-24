import { AppHeader } from './shared'

export function LegalFooterLinks() {
  return (
    <footer className="mt-6 pb-6 text-center text-xs text-gray-500 space-x-3">
      <a href="#/privacy" className="underline hover:text-gray-700">
        Tietosuojaseloste (Privacy Policy)
      </a>
      <span>·</span>
      <a href="#/privacy-guns" className="underline hover:text-gray-700">
        Laina-aseiden rekisteriseloste (Gun Register Privacy)
      </a>
      <span>·</span>
      <a href="#/terms" className="underline hover:text-gray-700">
        Käyttöehdot (Terms of Service)
      </a>
    </footer>
  )
}

export default function LegalDocumentPage({ type = 'privacy' }) {
  const isPrivacy = type === 'privacy'
  const isGunsPrivacy = type === 'privacy-guns'

  const headerTitle = isGunsPrivacy
    ? 'Rekisteriseloste: Laina-aseet / Gun Register Privacy'
    : isPrivacy
      ? 'Tietosuojaseloste / Privacy Policy'
      : 'Käyttöehdot / Terms of Service'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={headerTitle}
        subtitle="TurRes SSI Tools"
        backLabel="Alkuun"
        onBack={() => { window.location.hash = '#/' }}
      />

      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 text-sm text-gray-700 leading-relaxed">
          {isGunsPrivacy ? (
            <>
              <section className="space-y-2">
                <h2 className="font-bold text-gray-900 text-base">
                  FI — Rekisteri- ja tietosuojaseloste: Laina-aseiden käytönseuranta (GDPR art. 13–14)
                </h2>
                <p>
                  <strong>1. Rekisterinpitäjä:</strong> Turun Reserviläiset ry (ampumajaosto), yhteysosoite:{' '}
                  <a href="mailto:ampumajaosto@turunreservilaiset.fi" className="text-blue-600 underline">
                    ampumajaosto@turunreservilaiset.fi
                  </a>.
                </p>
                <p>
                  <strong>2. Tarkoitus ja oikeusperuste:</strong> Yhdistyksen laina-aseiden inventaarion, lainaus- ja palautustapahtumien,
                  annettujen patruunoiden sekä huolto-/puhdistustarpeen seuranta. Oikeusperusteena on yhdistyksen oikeutettu etu
                  (GDPR 6.1 f art.) ja ampuma-aselain (1/1998) mukainen huolellisuusvelvoite ampuma-aseiden ja patruunoiden valvonnasta.
                </p>
                <p>
                  <strong>3. Käsiteltävät tiedot:</strong> Aseen yksilöintitiedot (merkki, malli, sarjanumero, hankintavuosi),
                  lainaajan nimi ja sähköpostiosoite, kilpailun nimi, luovutettujen patruunoiden määrä (esim. 100 tai 0 kpl),
                  lainaus- ja palautusaika sekä aseen luovuttaneen/huoltaneen toimitsijan tunnus.
                </p>
                <p>
                  <strong>4. Käyttöoikeus ja säilytys (EU):</strong> Rekisteriin on pääsy vain valtuutetuilla toimitsijoilla
                  (SSI Ryhmä 25874, rooli <code>admin</code>). Tiedot säilytetään EU-alueella (Render Frankfurt) aseen elinkaaren ja
                  kirjanpito-/turvallisuusvelvoitteiden ajan (enintään kuluva vuosi + 6 kalenterivuotta), minkä jälkeen henkilötiedot
                  poistetaan tai anonymisoidaan vuositilastoiksi.
                </p>
                <p>
                  <strong>5. Rekisteröidyn oikeudet:</strong> Rekisteröidyllä on oikeus tarkastaa itseään koskevat lainausmerkinnät,
                  pyytää virheellisen tiedon oikaisua ja tehdä valitus tietosuojavaltuutetulle (<code>tietosuoja.fi</code>).
                </p>
              </section>

              <hr className="border-gray-200" />

              <section className="space-y-2">
                <h2 className="font-bold text-gray-900 text-base">
                  EN — Privacy Notice: Club Loaner Firearm Inventory &amp; Usage Register (GDPR Art. 13–14)
                </h2>
                <p>
                  <strong>1. Controller:</strong> Turun Reserviläiset ry (Shooting Section), contact:{' '}
                  <a href="mailto:ampumajaosto@turunreservilaiset.fi" className="text-blue-600 underline">
                    ampumajaosto@turunreservilaiset.fi
                  </a>.
                </p>
                <p>
                  <strong>2. Purpose &amp; Legal Basis:</strong> Tracking club-owned loaner firearms, range checkouts and returns,
                  cartridges issued, and cleaning/maintenance intervals. Processed under legitimate interest (GDPR Art. 6(1)(f))
                  and statutory duty of care for firearms and ammunition supervision (Finnish Firearms Act 1/1998).
                </p>
                <p>
                  <strong>3. Personal Data Processed:</strong> Firearm details (make, model, serial number, acquisition year),
                  borrower&apos;s name and email address, competition name, cartridges issued (e.g. 100 or 0 rounds), checkout/return
                  timestamps, and the identifier of the authorized range officer who issued, returned, or serviced the firearm.
                </p>
                <p>
                  <strong>4. Access &amp; Retention (EU):</strong> Access is strictly restricted to authorized club officials
                  (SSI Group 25874, role <code>admin</code>). Data is hosted in the EU (Render Frankfurt) and retained for the
                  service life of the firearm and statutory safety/bookkeeping periods (up to current year + 6 calendar years),
                  after which personal data is deleted or anonymized into annual statistics.
                </p>
                <p>
                  <strong>5. Data Subject Rights:</strong> You have the right to access your loan records, request rectification
                  of inaccurate data, and lodge a complaint with the Data Protection Ombudsman (<code>tietosuoja.fi</code>).
                </p>
              </section>
            </>
          ) : isPrivacy ? (
            <>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">1. Rekisterinpitäjä ja tarkoitus (Controller &amp; Purpose)</h2>
                <p>
                  TurRes SSI Tools on Turun Reserviläiset ry:n ampumatoiminnan aputyökalu kilpailu- ja harjoitusilmoittautumisten,
                  squadien, laina-aseiden sekä tulosten hallintaan ShootNScoreIt (SSI) -palvelun kanssa.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">2. Käsiteltävät henkilötiedot (Personal Data Processed)</h2>
                <p>
                  Järjestelmä käsittelee käyttäjän SSI-sähköpostiosoitetta, nimeä, kilpailu-/squad-ilmoittautumistietoja,
                  laina-aseen ja patruunoiden luovutusmerkintöjä (<a href="#/privacy-guns" className="text-blue-600 underline">Laina-aseiden rekisteriseloste</a>),
                  ammuntatuloksia sekä väliaikaista istuntotunnistetta (SSI passthrough -tunnistautuminen).
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">3. Kolmannen osapuolen käsittelijät (Third-Party Processors)</h2>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>ShootNScoreIt (SSI):</strong> Varsinainen kilpailuhallintajärjestelmä, johon ilmoittautumiset ja tulokset tallennetaan.</li>
                  <li><strong>Resend:</strong> Ilmoittautumisvahvistusten sähköpostitoimitus.</li>
                  <li><strong>Render (Frankfurt, EU):</strong> Sovelluksen ja väliaikaisen istuntomuistin (Redis) palvelinympäristö EU-alueella.</li>
                </ul>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">4. Säilytysaika ja yhteydenotot (Retention &amp; Contact)</h2>
                <p>
                  Istuntotiedot poistuvat automaattisesti 8 tunnin kuluessa. Kilpailutiedot säilytetään SSI-palvelussa.
                  Tietopyynnöt ja kysymykset: <a href="mailto:ampumajaosto@turunreservilaiset.fi" className="text-blue-600 underline">ampumajaosto@turunreservilaiset.fi</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">1. Palvelun käyttö (Acceptable Use)</h2>
                <p>
                  TurRes SSI Tools -työkaluja saa käyttää vain omiin ilmoittautumisiin sekä valtuutettujen toimitsijoiden
                  suorittamaan tulosten kirjaamiseen, laina-aseiden hallintaan ja kilpailuhallintaan.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">2. Käyttäjän vastuu (User Responsibilities)</h2>
                <p>
                  Käyttäjä vastaa antamiensa tietojen oikeellisuudesta sekä omien SSI-tunnustensa huolellisesta säilyttämisestä.
                  Toisen henkilön ilmoittaminen tai tietojen muokkaaminen ilman lupaa on kielletty.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">3. Vastuunrajoitus (Limitation of Liability)</h2>
                <p>
                  Palvelu tarjotaan &quot;sellaisena kuin se on&quot; ShootNScoreIt-palvelun rinnalle. Viralliset kilpailutiedot
                  määräytyvät ShootNScoreIt-järjestelmän mukaisesti.
                </p>
              </section>
            </>
          )}

          <LegalFooterLinks />
        </div>
      </div>
    </div>
  )
}
