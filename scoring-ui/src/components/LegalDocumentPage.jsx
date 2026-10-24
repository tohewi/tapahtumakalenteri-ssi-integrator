import { AppHeader } from './shared'

export function LegalFooterLinks() {
  return (
    <footer className="mt-6 pb-6 text-center text-xs text-gray-500 space-x-3">
      <a href="#/privacy" className="underline hover:text-gray-700">
        Tietosuojaseloste (Privacy Policy)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={isPrivacy ? 'Tietosuojaseloste / Privacy Policy' : 'Käyttöehdot / Terms of Service'}
        subtitle="TurRes SSI Tools"
        backLabel="Alkuun"
        onBack={() => { window.location.hash = '#/' }}
      />

      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 text-sm text-gray-700 leading-relaxed">
          {isPrivacy ? (
            <>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">1. Rekisterinpitäjä ja tarkoitus (Controller & Purpose)</h2>
                <p>
                  TurRes SSI Tools on Turun Reserviläiset ry:n ampumatoiminnan aputyökalu kilpailu- ja harjoitusilmoittautumisten,
                  squadien sekä tulosten hallintaan ShootNScoreIt (SSI) -palvelun kanssa.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-gray-900 text-base mb-1">2. Käsiteltävät henkilötiedot (Personal Data Processed)</h2>
                <p>
                  Järjestelmä käsittelee käyttäjän SSI-sähköpostiosoitetta, nimeä, kilpailu-/squad-ilmoittautumistietoja,
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
                <h2 className="font-semibold text-gray-900 text-base mb-1">4. Säilytysaika ja yhteydenotot (Retention & Contact)</h2>
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
                  suorittamaan tulosten kirjaamiseen ja kilpailuhallintaan.
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
