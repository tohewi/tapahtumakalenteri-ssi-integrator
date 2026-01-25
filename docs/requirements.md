| # | Requirement | Status |
|---|-------------|--------|
| 1 | It must be possible to specify match date as parameter | [x] |
| 2 | Date format is dd-mm-yyyy | [x] |
| 3 | Default start time is 09.00 | [x] |
| 4 | Default end time is 12.00 | [x] |
| 5 | A RESUL CUP is created for provided date. | [x] |
|   | - example event: https://shootnscoreit.com/event/136/108/ | |
| 6 | Cup scoring_mode should be "series-points is same as component-match points" (pts) | [x] |
| 7 | Cup and Match max competitors is 25 | [x] |
| 8 | Cup allowed categories is 'Open' | [x] |
| 9 | Cup results are shown only to participants | [x] |
| 10 | Cup competitor will be automatically registered to all Cup Matches | [x] |
| 11 | Registration will start one week before the Cup. | [x] |
| 12 | for each Cup, three matches are created with following names: | [x] |
|    | - one for "Tarkkuus" | |
|    | - one for "Pika" | |
|    | - one for "Kuvio" | |
| 13 | Individual matches are following type: | [x] |
|    | 25m Pistooli Kuvio | |
|    | End point: https://shootnscoreit.com/nordic/create-resul-25-kuvio-pistol/ | |
| 14 | Match name is in format "Kupittaa dd.mm.yyyy <name> | [x] |
|    | "Tarkkuus" example: https://shootnscoreit.com/event/91/1753/ | |
|    | "Pika" example: https://shootnscoreit.com/event/91/1754/ | |
|    | "Kuvio" example: https://shootnscoreit.com/event/91/1755/" | |
| 15 | Matches belong to the Cup event. | [x] |
| 16 | Result verification should not be required. | [x] |
|    | xxx = No verification, sgn = Signature, pin = PIN code |[x]|
| 17 | There are three squads per match - Oma ase 1, Oma ase 2, Laina-ase. |[x]|
| 18 | Oma ase 1 and 2 have maximum of 9 shooters. Laina-ase has maximum of 7 shooters.  |[x]|
| 19 | Squad names and maximum shooters are defined in a configuration file.    |[x]|
| 20 | Match registration will start at the same time with the Cup. |[x]|
| 21 | Cup is managed by group id 25874|[x]|
| 22 | Match is managed by group id 25874|[x]|
| 23 | CUP has a description "Ammutaan kolme osuutta: Tarkkuus ja Pika, sekä Pistoolipika. Laukausmäärä: 100. Osallistujilla on oltava ammunnan kattava vakuutus (Reserviläisen toimintaturva tai SAL vakuutus) sekä suojalasit. Suojalasien käyttö pakollista harjoituksissa.Jos olet ensikertalainen, ilmoittaudu perehdytysvuorolle (ks. ohjeet tapahtumakalenterista)Laina-aseet käytössä (valvottu käyttö) Laina-aseille ratamaksu kattaa kaiken ammunnassa tarvittavan materiaalin.Ratamaksu 7 euroa. Omalla aseella ampuvat 6 euroa. (MobilePay tai tilisiirto) Huom! Ammunta alkaa klo 9.30, eikä en jälkeen ei ole mahdollista tulla paikalle.Kysymyksiä? Lisätietoja ampumajaosto(at)turunreservilaiset.fi", which is defined in a configuration file|[x]|
| 24 | "Tarkkuus" match has a description, which is defined in a configuration file. "SAL 25m pistooli (https://www.ampumaurheiluliitto.fi/pistooli/25m-pistooli/)

Tarkkuusosa
Ammutaan yksi koesarja ja kuusi kilpasarjaa.
Sarjan aikana taulut näkyvillä 5 minuuttia."|[x]|
| 25 | "Pika" match has a description, which is defined in a configuration file. "SAL 25m pistooli (https://www.ampumaurheiluliitto.fi/pistooli/25m-pistooli/)

Pikaosa
Ammutaan yksi koesarja ja kuusi kilpasarjaa.
Kutakin sarjan laukausta kohden taulut ovat piilossa 7 sekuntia ja näkyvissä 3 sekuntia."|[x]|
| 26 | "Kuvio" match has a description, which is defined in a configuration file. "Lyhennetty RESUL Pistoolipika-ammunta (https://resul.fi/pistoolipika-ammunta/)

Pika-ammunta käsittää 30 kilpalaukausta:

2×5 laukauksen sarja, aikaa 10 sek/sarja
2×5 laukauksen sarja, aikaa 8 sek/sarja
2×5 laukauksen sarja, aikaa 6 sek/sarja"|[x]|
||Please add a check to prevent cups and matches with duplicate names. It seems SSI allows duplicate names, hence that needs to be checked while creating events.|[x]|
||Cup registration ends 12 hours before the Cup start time.|[x]|
||Match registration end date and time per cup end date and time.|[x]|
||Match end date and time per cup end date and time.|[x]|
||Cup has a Web Address with following value "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi/toiminta/ammunta/reservilaisammunta/"and description "Lisätietoa."|[x]|
||Squading start date and time per Match Registration start date and time.|[x]|
||Squading end date and time per Match start date and time.|[x]|
||Match has a location "Kupittaan urheiluhalli, Tahkonkuja 5, 20520 TURKU"|[x]|




|||[]|

## Configuration Files

- **`config/kupittaa-cup-config.yml`** - Contains all event settings including:
  - Group ID (25874)
  - Organizer ID
  - Cup and Match settings
  - Match type definitions with descriptions
  - Squad definitions with names and max shooters

## Developer Documentation

- **`docs/developer-guide.md`** - Process guide for Cup/Match/Squad creation flow