| # | Requirement | Status |
|---|-------------|--------|
| 1 | It must be possible to specify match date as parameter | [x] |
| 2 | Date format is dd-mm-yyyy | [x] |
| 3 | Default start time is 09.00 | [x] |
| 4 | Default end time is 12.00 | [x] |
| 5 | A RESUL CUP is created for provided date. Example: https://shootnscoreit.com/event/136/108/ | [x] |
| 6 | Cup scoring_mode should be "series-points is same as component-match points" (pts) | [x] |
| 7 | Cup and Match max competitors is 25 | [x] |
| 8 | Cup allowed categories is 'Open' | [x] |
| 9 | Cup results are shown only to participants | [x] |
| 10 | Cup competitor will be automatically registered to all Cup Matches | [x] |
| 11 | Registration will start one week before the Cup. | [x] |
| 12 | For each Cup, three matches are created: "Tarkkuus", "Pika", "Kuvio" | [x] |
| 13 | Individual matches are type 25m Pistooli Kuvio (endpoint: /nordic/create-resul-25-kuvio-pistol/) | [x] |
| 14 | Match name is in format "Kupittaa dd.mm.yyyy <name>" | [x] |
| 15 | Matches belong to the Cup event. | [x] |
| 16 | Result verification should not be required (xxx = No verification) | [x] |
| 17 | There are three squads per match - Oma ase 1, Oma ase 2, Laina-ase | [x] |
| 18 | Oma ase 1 and 2 have max 9 shooters. Laina-ase has max 7 shooters. | [x] |
| 19 | Squad names and maximum shooters are defined in a configuration file | [x] |
| 20 | Match registration will start at the same time with the Cup | [x] |
| 21 | Cup is managed by group id 25874 | [x] |
| 22 | Match is managed by group id 25874 | [x] |
| 23 | Cup has a description (max 300 chars) defined in configuration file | [x] |
| 24 | "Tarkkuus" match has a description defined in configuration file | [x] |
| 25 | "Pika" match has a description defined in configuration file | [x] |
| 26 | "Kuvio" match has a description defined in configuration file | [x] |
| 27 | Duplicate name check for cups and matches before creation | [x] |
| 28 | Cup registration ends 12 hours before the Cup start time | [x] |
| 29 | Match registration end date/time = Cup end date/time | [x] |
| 30 | Match end date/time = Cup end date/time | [x] |
| 31 | Cup has a Web Address with URL and description "Lisätietoa" | [x] |
| 32 | Squading start date/time = Match registration start date/time | [x] |
| 33 | Squading end date/time = Match start date/time | [x] |
| 34 | Match has a location "Kupittaan urheiluhalli, Tahkonkuja 5, 20520 TURKU" | [x] |
| 35 | Auto-approve all pending registrations in Matches (up to max competitors limit) | [this is on hold. It may not be needed after all. ] |
| 36 | Copy shooter squadding from Match #1 to Matches #2 and #3 automatically | [ this is on hold. It may not be needed after all. ] |
| 37 | Login with username/password instead of manual sessionid cookie | [x] Implemented in Connect-SSI.ps1 and New-KupittaaCup.ps1 |
| | **Release 2.0 Requirements** | |
| 38 | Tapahtumakalenteri Integration: When a Cup is created, create a corresponding event in the Turun Reservilaiset WordPress event calendar (tapahtumakalenteri). Event is created as draft first. Cup URL is stored in calendar event. Cross-reference via permalink with Cup ID. Single configuration file (`kupittaa-cup-config.yml`) contains settings for both SSI and Tapahtumakalenteri. Modular/extendable design with no hardcoded parameters - all values read from config. No automatic deletions allowed. | [x] Implemented in Connect-WordPress.ps1, New-TapahtumakalenteriEvent.ps1, and New-KupittaaCup.ps1 |
| 39 | Statistics: When Cup and all matches are completed, update the total shots fired to the calendar event. Calculation: number of Cup shooters × 100 (max shots per Cup). | [ ] |

## Configuration Files

- **`config/kupittaa-cup-config.yml`** - Single configuration file for both SSI and Tapahtumakalenteri:
  - **SSI Settings**: Group ID, Cup/Match templates, descriptions, squad definitions
  - **Tapahtumakalenteri Settings**: WordPress URL, title template, location, content template, taxonomy IDs
  - All configurable values are externalized - no hardcoded parameters in scripts
  - Supports `{displayDate}`, `{ssiCupLink}` and other placeholders for dynamic content

## Developer Documentation

- **`docs/developer-guide.md`** - Process guide for Cup/Match/Squad creation flow