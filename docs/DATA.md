# Data sources and attribution

Documentation reviewed and responses verified on 14 October 2026.

| Source                                                        | Selected use                                    | Free limits / licence                                                                                        | Limitations                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [OpenFootball](https://github.com/openfootball/football.json) | Five league fixtures and results, three seasons | Schema, scripts and data dedicated to public domain; GitHub delivery fair use applies                        | Community updates, no live guarantee, no verified kickoff timezone, no player or event data                           |
| [football-data.org](https://www.football-data.org/pricing)    | Optional delayed current-season matches         | Free: 12 competitions, 10 calls/minute, delayed scores; registration required                                | Our integration uses matches only; advanced statistics are not included; global budget required                       |
| [TheSportsDB](https://www.thesportsdb.com/docs/api)           | Football player directory lookup                | Public v1 demo key 123, free rate advertised as 30 calls/minute, most queries limited                        | API response limits, community-directory freshness, no images without specific licence records                        |
| [StatsBomb Open Data](https://github.com/hudl/open-data)      | Researched, not integrated                      | Select research datasets; source attribution and logo required for published insights, separate data licence | Historical selected coverage; not a current-season live API; licence is not interchangeable with source-code licence  |
| [OpenLigaDB](https://api.openligadb.de/index.html)            | Researched, not integrated                      | Community data under ODbL, 60 requests/minute per IP; no API key                                             | Community maintenance; derived database share-alike obligations need separate consideration; image rights not granted |

## Primary documentation

- [OpenFootball README and licence](https://github.com/openfootball/football.json#license)
- [football-data.org policies](https://docs.football-data.org/general/v4/policies.html)
- [football-data.org coverage](https://www.football-data.org/coverage)
- [football-data.org terms, especially attribution and image rights](https://www.football-data.org/about)
- [TheSportsDB pricing](https://api.thesportsdb.com/pricing)
- [TheSportsDB terms and image rights](https://api.thesportsdb.com/docs_terms_of_use.php)
- [StatsBomb data licence](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)
- [OpenLigaDB licence](https://www.openligadb.de/lizenz)

Required football-data.org attribution is visible on the Data & methodology page: **Football data provided by the Football-Data.org API**. TheSportsDB is visibly credited on directory profiles and search. Source links and timestamps are included with the current dataset. Providers can change their terms and coverage; review them before public distribution or monetization.

## Snapshots

`public/data/` contains untouched record values downloaded from OpenFootball, with an added provenance object containing source URL, retrieval timestamp and public-domain designation. Fifteen league-season files were fetched successfully. No random scores or sample fixtures are inserted. Unit tests preserve a published Arsenal–Coventry fixture and normalize every file.

`tests/fixtures/player-lookup.json` contains a minimal metadata excerpt of a real Lionel Messi lookup, with description omitted. It is a contract-testing fixture, not a fabricated player statistic.

## Definitions

- Recorded completed match: a community record with a supplied final score, or delayed provider status `FINISHED`.
- Calculated points: 3 × wins + draws; deductions are not included.
- Ranking: points, goal difference, goals scored, then name. This is not an official league ranking.
- Form: five most recent recorded completed games, displayed oldest to newest.
- Goals per match: recorded home plus away goals divided by recorded completed games.
- Home/away outcome distribution: proportion of recorded completed matches where home score is greater/equal/lower than away score.
- Comparison chart: cumulative calculated points after each club's own recorded completed match. Equal x values do not imply identical calendar dates.
- Season H2H: other meetings between the two clubs within the selected season dataset only.
- Latest matches: date descending, deterministic source-ID tie-break; no claimed popularity or trending metric.

## Visual assets

No provider logo, player photo or third-party club crest is included without image-specific permission. Initials are explicitly described as original fallback artwork in the UI. Inter is bundled locally from Fontsource and licensed under the SIL Open Font License; its licence is included in the dependency package. The application icon and pitch artwork are original.
