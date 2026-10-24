# Rekisteri- ja tietosuojaseloste: Laina-aseiden käytönseuranta / Privacy Notice: Loaner Firearm Inventory & Usage Register

> **Päivitetty / Last Updated:** 24.10.2026  
> **Sovellettava lainsäädäntö / Applicable Law:** EU:n yleinen tietosuoja-asetus (GDPR 2016/679, art. 13–14) & Tietosuojalaki (1050/2018)

---

## SUOMEKSI — Rekisteri- ja tietosuojaseloste (Laina-aseiden käytönseuranta)

### 1. Rekisterinpitäjä ja yhteyshenkilö
- **Rekisterinpitäjä:** Turun Reserviläiset ry (ampumajaosto)
- **Yhteysosoite tietosuoja-asioissa:** `ampumajaosto@turunreservilaiset.fi`

### 2. Henkilötietojen käsittelyn tarkoitus ja oikeusperuste
Rekisterin tarkoituksena on yhdistyksen omistamien laina-aseiden inventaarion hallinta, aseiden lainaus- ja palautusseuranta kilpailu- ja harjoitustapahtumissa (esim. Kupittaa Cup), luovutettujen patruunoiden kirjanpito sekä aseiden huolto- ja puhdistustarpeen seuranta.

**Käsittelyn oikeusperuste (GDPR 6 art.):**
- **Oikeutettu etu (GDPR 6.1 f art.) ja lakisääteinen huolellisuusvelvoite (Ampuma-aselaki 1/1998):** Yhdistyksellä on velvollisuus valvoa hallussaan olevien ampuma-aseiden ja patruunoiden luovuttamista, käyttöä radalla, palauttamista asekaappiin sekä turvallista toimintakuntoa.

### 3. Rekisterin tietosisältö (Käsiteltävät tiedot)
1. **Aseen tiedot:** Merkki, malli, sarjanumero, hankintavuosi ja tila (*Asekaapissa* / *Radalla käytössä* / *Poistettu*).
2. **Lainaus- ja käyttötapahtumat (`usageHistory`):**
   - Lainaajan (ampujan) nimi ja sähköpostiosoite (SSI-tunnuksesta)
   - Kilpailu tai tapahtuma (`cupId`, `cupName`)
   - Annettujen patruunoiden määrä (`cartridgesGiven`, esim. `100` kpl tai `0` kpl)
   - Lainaus- ja palautusaika (`checkedOutAt`, `returnedAt`)
   - Aseen luovuttaneen ja vastaanottaneen toimitsijan tunnus (`checkedOutBy`, `returnedBy`)
3. **Huolto- ja puhdistustapahtumat (`maintenanceHistory`):**
   - Huollon ajankohta, huollon suorittaneen toimitsijan tunnus sekä huoltomerkintä.

### 4. Tietolähteet
Tiedot saadaan ShootNScoreIt (SSI) -kilpailujärjestelmän osallistujalistasta (*Laina-ase*-squad) sekä yhdistyksen nimeämiltä ampumatoimitsijoilta (SSI Ryhmä `25874` admin-käyttäjät) aseen luovutuksen, palautuksen ja huollon yhteydessä.

### 5. Tietojen käyttöoikeus, luovutukset ja sijainti (EU/ETA)
- Rekisterin käyttöoikeus on rajattu teknisesti vain Turun Reserviläiset ry:n valtuuttamille ampumatoimitsijoille (SSI Ryhmä `25874`, rooli `admin`).
- Tietoja säilytetään EU-alueella (Render Frankfurt, Saksa). Tietoja ei siirretä EU/ETA-alueen ulkopuolelle eikä luovuteta ulkopuolisille, lukuun ottamatta viranomaispyyntöjä lakiin perustuen.

### 6. Tietojen säilytysaika
Lainaus- ja huoltolokitietoja säilytetään aseen elinkaaren ja yhdistyksen kirjanpito-/turvallisuusvelvoitteiden edellyttämän ajan (enintään kuluvan vuoden ja 6 seuraavan kalenterivuoden ajan), minkä jälkeen henkilötiedot poistetaan tai anonymisoidaan tilastollisiksi vuosiluvuiksi.

### 7. Rekisteröidyn oikeudet
Rekisteröidyllä on GDPR:n mukainen oikeus:
- tarkastaa itseään koskevat lainausmerkinnät,
- pyytää virheellisen tiedon oikaisua,
- vastustaa käsittelyä tai pyytää tietojen poistamista siltä osin kuin pakottava lainsäädäntö ei edellytä säilyttämistä,
- tehdä valitus tietosuojavaltuutetulle (`tietosuoja.fi`).

Tietopyynnöt osoitetaan sähköpostitse: `ampumajaosto@turunreservilaiset.fi`.

---

## IN ENGLISH — Privacy Notice (Club Loaner Firearm Inventory & Usage Register)

### 1. Data Controller & Contact
- **Controller:** Turun Reserviläiset ry (Shooting Section / Ampumajaosto)
- **Privacy Contact:** `ampumajaosto@turunreservilaiset.fi`

### 2. Purpose and Legal Basis for Processing
The register is maintained to track club-owned loaner firearms (*laina-aseet*), record firearm checkouts and returns during shooting matches and training events, log ammunition (*patruunat*) issued at the range, and track firearm cleaning and maintenance intervals.

**Legal Basis (GDPR Art. 6):**
- **Legitimate Interest (GDPR Art. 6(1)(f)) & Statutory Duty of Care (Finnish Firearms Act 1/1998):** The association is required to supervise the handover, range use, safe return, and mechanical safety of club firearms and ammunition.

### 3. Categories of Personal Data Processed
1. **Firearm Data:** Make, model, serial number, acquisition year, and storage status (*In gun safe* / *In range use* / *Retired*).
2. **Checkout & Usage Records (`usageHistory`):**
   - Borrower's (shooter's) name and email address (from SSI registration)
   - Competition/event identifier and name (`cupId`, `cupName`)
   - Number of cartridges issued (`cartridgesGiven`, e.g. `100` rounds or `0` rounds)
   - Checkout and return timestamps (`checkedOutAt`, `returnedAt`)
   - Identifier of the authorized range officer who issued/returned the firearm (`checkedOutBy`, `returnedBy`)
3. **Cleaning & Maintenance Records (`maintenanceHistory`):**
   - Timestamp, identifier of the administrator who performed the maintenance, and maintenance notes.

### 4. Data Sources
Data is obtained from the ShootNScoreIt (SSI) event participant list (*Laina-ase* squad) and recorded by authorized range officers (SSI Group `25874` admins) when issuing, returning, or servicing firearms.

### 5. Access Restrictions, Disclosures & Data Location (EU/EEA)
- Access is strictly restricted to authorized club officials holding the `admin` role in SSI Group `25874`.
- All data is hosted within the European Union (Render Frankfurt, Germany). Data is never transferred outside the EU/EEA or disclosed to third parties except where required by law or competent authorities.

### 6. Data Retention
Checkout and maintenance logs are retained for the active service life of the firearm and to satisfy club bookkeeping and safety obligations (up to the current year plus 6 calendar years), after which personal identifiers are deleted or anonymized into aggregate annual statistics.

### 7. Data Subject Rights
Under the GDPR, you have the right to access your loan records, request rectification of inaccurate data, object to processing, or lodge a complaint with the Office of the Data Protection Ombudsman (`tietosuoja.fi`). Requests may be sent to `ampumajaosto@turunreservilaiset.fi`.
