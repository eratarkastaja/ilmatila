# ILMATILA

**ILMATILA 0.1.0-alpha.1** on Three.js-kirjastolla toteutettu, selaimessa pelattava ilmataistelupeli. Tämä on varhainen pelattava prototyyppi: lentomalli, tutka, aseet, viholliset ja maataistelu ovat pelisimulaatioita, eivätkä sovellu tosielämän koulutus- tai operatiiviseen käyttöön.

Käyttöliittymän oletuskieli on englanti. Pelissä voi valita myös suomen. Englanninkieliset ohjeet ovat tiedostossa [README.md](README.md).

## Käynnistä paikallisesti

Tarvitset Node.js:n 20.19+ tai 22.12+, npm:n ja WebGL:ää tukevan selaimen.

```sh
npm install
npm run dev
```

Avaa Viten tulostama paikallinen osoite. Tuotantoversion voi muodostaa komennolla `npm run build` ja esikatsella komennolla `npm run preview`. Peli ei tarvitse API-avainta toimiakseen.

## GitHub Pages

Kun GitHub Pages on ensin otettu käyttöön valinnalla **Settings → Pages → Build and deployment → Source → GitHub Actions**, sivusto rakentuu ja julkaistaan automaattisesti `master`-haaran muutoksista. Julkaisun voi käynnistää myös käsin repositorion Actions-välilehdeltä. Pelin osoite on <https://eratarkastaja.github.io/ilmatila/>.

Luodut MML:n maastopaketit on jätetty tarkoituksella Gitin ulkopuolelle. Siksi puhdas GitHub Actions -julkaisu käyttää esikatselumaastoa, kunnes maastopaketit julkaistaan erikseen ja liitetään käyttöönottoon. Peli ja lentokone toimivat ilman API-avainta.

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
| Ctrl | Laukaise ohjus; suuntaa viholliskontaktiin, kun HUD hakee lukitusta |
| R | Vaihda tutkan ilma- ja maamoodia |
| C | Käytä soihtuja ja tutkasilppua |
| Esc | Keskeytä lento tauolle |

## Maastoaineisto

Repositoriossa on pieni toiminta-alueiden luettelo, ei ladattuja maastopaketteja. Ilman paikallista aineistoa peli käyttää esikatselumaastoa. Voit ladata neljä Suomen toiminta-aluetta (Päijänne, Virolahti, Ilomantsi ja Kuusamo) [maastotyökalun ohjeella](tools/terrain/README.md). Lataus vaatii MML:n API-avaimen. Aineistot jäävät paikallisiksi eikä niitä lisätä Gitiin; peli toimii ilman niitä.

## Lentokone ja koodin rakenne

Pelaajan kone käyttää muunnettua FlightGearin F-35B-mallia F-35A:n visuaalisena vastineena. Se ei ole F-35A:lle tehty malli tai maalaus. Alkuperäinen mallilähde ja tekstuuri, lisenssi, tekijätiedot sekä muunnosskripti ovat mukana.

- `src/main.js` kokoaa valikon, lennon, tauon ja pelin elinkaaren.
- `src/combat/` sisältää ohjauksen, tutkan, aseet ja taistelutoiminnot.
- `src/terrain.js`, `src/clouds.js`, `src/sun.js` ja `src/fx.js` muodostavat ympäristön ja tehosteet.
- `src/hud.js`, `src/menu-radar.js` ja `src/i18n.js` toteuttavat HUDin, valikkotutkan ja kielivalinnat.
- `tools/terrain/` sisältää valinnaisen MML-aineiston lataustyökalun ohjeineen.
- `scripts/convert-flightgear-f35.py` muodostaa lentokoneen GLB-tiedoston mukana olevista lähdetiedostoista.

## Lisenssit ja tekijätiedot

Projektin lähdekoodi on lisensoitu [GNU GPL version 3 only -lisenssillä](LICENSE). Kolmannen osapuolen tiedostoihin ja ladattaviin aineistoihin sovelletaan niiden omia ehtoja. Katso [kolmansien osapuolten lisenssitiedot](THIRD-PARTY-NOTICES.md), pelin **Aineistot ja lisenssit** -ikkuna sekä lentokoneen [tekijätiedot](public/assets/f35/ASSET-CREDITS.md). MML:n maastoaineisto ei sisälly repositorioon.

ILMATILA on itsenäinen yhteisöprojekti, jolla ei ole yhteyttä Suomen ilmavoimiin, Lockheed Martiniin, FlightGeariin tai Maanmittauslaitokseen.
