# ILMATILA

**ILMATILA 0.1.0-alpha.2** on ERÄGAMESin itsenäinen, Three.js-kirjastolla toteutettu ilmataistelupeli. Tämä on varhainen pelattava prototyyppi: lentomalli, tutka, aseet, viholliset ja maataistelu ovat pelisimulaatioita, eivätkä sovellu tosielämän koulutus- tai operatiiviseen käyttöön.

Käyttöliittymän oletuskieli on englanti. Pelissä voi valita myös suomen. Englanninkieliset ohjeet ovat tiedostossa [README.md](README.md). Tämän alphaversion muutokset on koottu [muutoslokiin](CHANGELOG.md).

## Käynnistä paikallisesti

Tarvitset Node.js:n 20.19+ tai 22.12+, npm:n ja WebGL:ää tukevan selaimen.

```sh
npm ci
npm run dev
```

Avaa Viten tulostama paikallinen osoite. Tuotantoversion voi muodostaa komennolla `npm run build` ja esikatsella komennolla `npm run preview`. Peli ei tarvitse API-avainta toimiakseen.

## GitHub Pages

Kun GitHub Pages on ensin otettu käyttöön valinnalla **Settings → Pages → Build and deployment → Source → GitHub Actions**, sivusto rakentuu ja julkaistaan automaattisesti `master`-haaran muutoksista. Julkaisun voi käynnistää myös käsin repositorion Actions-välilehdeltä. Pelin osoite on <https://eratarkastaja.github.io/ilmatila/>.

MML:n maastopaketit pidetään Git-historian ulkopuolella. Pages-työnkulku lataa neljä versioitua aluetta [maastoaineiston julkaisusta](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0), tarkistaa SHA-256-tarkisteet ja sisällyttää aineistot sivustoon. Peli ei tarvitse API-avainta; avainta käytetään vain uusien lähdeaineistojen lataamiseen.

## Ohjaimet

| Näppäin | Toiminto |
| --- | --- |
| W / nuoli ylös | Laske nokkaa |
| S / nuoli alas | Nosta nokkaa |
| A / nuoli vasemmalle | Kallista ja kaartaa vasemmalle |
| D / nuoli oikealle | Kallista ja kaartaa oikealle |
| Q / E | Pyöritä konetta pituusakselin ympäri |
| Shift | Jälkipoltin |
| Space | Ammu konetykillä |
| T | Selaa havaittuja vihollisen tutkamaaleja |
| M | Laukaise ohjus, kun valittu vihollismaali on kantamalla ja lukittuna |
| R | Vaihda tutkan ilma- ja maamoodia |
| C | Käytä soihtuja ja tutkasilppua |
| Esc | Keskeytä lento tauolle |

## Äänet

Taisteluäänissä käytetään CC0-lisensoituja tykki-, ohjus- ja räjähdysnäytteitä sekä CC BY 3.0 -lisensoitua suihkumoottorin äänitehostetta. Lähteet ja tekijätiedot näkyvät pelin **Aineistot ja lisenssit** -ikkunassa ja tiedostossa [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). Synteettiset äänet toimivat varalla, jos ääninäyte ei lataudu.

## Maastoaineisto

Repositoriossa on toiminta-alueiden luettelo ja aineiston lataustyökalu. Valmiit maastopaketit julkaistaan [versioituina arkistoina](https://github.com/eratarkastaja/ilmatila/releases/tag/terrain-data-v1.0.0). Pages-julkaisu lataa kaikki neljä aluetta (Päijänne, Virolahti, Ilomantsi ja Kuusamo) ja sisällyttää ne sivustoon. Lähdeaineiston päivittäminen vaatii MML:n API-avaimen; katso [maastotyökalun ohje](tools/terrain/README.md). Peli ei tarvitse avainta.

## Lentokone ja koodin rakenne

Pelaajan kone käyttää muunnettua FlightGearin F-35B-mallia F-35A:n visuaalisena vastineena. Se ei ole F-35A:lle tehty malli tai maalaus. Alkuperäinen mallilähde ja tekstuuri, lisenssi, tekijätiedot sekä muunnosskripti ovat mukana. Vihollislento-osastot käyttävät muunnettuja FlightGearin Su-27- ja MiG-29-ulkomalleja. Su-27 on Flanker-perheen malli, ei Su-35-kohtainen versio. Maajoukkojen mallit ovat toistaiseksi projektissa tehtyä geometriaa; lisenssitarkistetut jatkovaihtoehdot on kirjattu [mallien hankintamuistioon](docs/asset-sourcing.md).

- `src/main.js` kokoaa valikon, lennon, tauon ja pelin elinkaaren.
- `src/combat/` sisältää ohjauksen, tutkan, ballistiikan, aseet, osumatarkistukset sekä ilma- ja maataistelut.
- `src/terrain.js`, `src/clouds.js`, `src/sun.js` ja `src/fx.js` muodostavat ympäristön ja tehosteet.
- `src/hud.js`, `src/menu-radar.js` ja `src/i18n.js` toteuttavat HUDin, valikkotutkan ja kielivalinnat.
- `tools/terrain/` sisältää valinnaisen MML-aineiston lataustyökalun ohjeineen.
- `scripts/convert-flightgear-f35.py` muodostaa pelaajan koneen GLB-tiedoston mukana olevista lähdetiedostoista.
- `npm run assets:aircraft` muodostaa Su-27- ja MiG-29-GLB-tiedostot niiden mukana olevista lähdetiedostoista.

## Lisenssit ja tekijätiedot

Projektin lähdekoodi on lisensoitu [GNU GPL version 3 only -lisenssillä](LICENSE). Tekijänoikeus © 2026 ERÄGAMES. ERÄGAMES-nimi ja -logo ovat pelistudion brändiaineistoa, eivätkä kuulu lähdekoodin lisenssiin. Kolmannen osapuolen tiedostoihin ja ladattaviin aineistoihin sovelletaan niiden omia ehtoja. Katso [kolmansien osapuolten lisenssitiedot](THIRD-PARTY-NOTICES.md), pelin **Aineistot ja lisenssit** -ikkuna sekä lentokoneiden [tekijätiedot](public/assets/aircraft/ASSET-CREDITS.md). MML:n maastoaineisto ei sisälly repositorioon.

ILMATILA on ERÄGAMESin itsenäinen peli, jolla ei ole yhteyttä Suomen ilmavoimiin, Lockheed Martiniin, FlightGeariin tai Maanmittauslaitokseen.
