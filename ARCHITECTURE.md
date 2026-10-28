# Modulkarte für SPERRKREIS 98

Fortlaufende Modulkarte auf Basis der technischen Modularisierung vom 02.10.2026.
Zweck: den Einstieg und den Umfang eines Patches begrenzen.
Spielregeln und Ideen stehen in `DESIGN_PLAN.md`; diese Karte enthält Zuständigkeiten.

## Einstieg nach Aufgabe

Alle JavaScript-Pfade in der Tabelle liegen unter `docs/src/`.

| Aufgabe | Zuständige Module | Relevante Verbindung |
|---|---|---|
| Tap, Doppeltap, Halten, Kamera | `input.js`, `world-input.js`, `object-selection.js`, `render.js`, `config.js` | Eingabeereignis → Ziel/Interaktion/Kamera. Zoom 100–250 %, Standard 175 %, nur +/−; Welt in passender Geräteauflösung, UI/Statusicons in Bildschirmkoordinaten. Projektion und inverse Tap-Koordinaten berücksichtigen Zoom; Ziehen bleibt pixelgenau. |
| Spielersicht, Erkundung, Kameranebel | `player-visibility.js`, `camera-overlay.js` | 16-Tile-Rundumsicht unabhängig von Deckung/KI; Erkundung in Save v4, gemeinsame Sichtgrenze für Darstellung und Auswahl; Kamera bewegt nur den Bildausschnitt |
| Laufziel, Weg und Ankunft | `player-navigation.js`, `movement.js` | Vierteltile-Spielerwege, präzise Ziele, begrenzte Deckungspräferenz; `navigation.js` bleibt die gröbere Zombie-Wegsuche |
| Deckungszone und Hide | `cover.js`, `cover-protection.js`, `stealth.js`, `cover-display.js`, `cover-surface.js` | Vegetation tarnt rundum, feste Deckung schützt pro Beobachter; gleiche Flächen/Kollision für Hide, Execution-Wege und interpolierte Bodenanzeigen; Darstellung in `render.js` |
| Sicht, Verdacht, Verfolgung, Deckungssuche | `perception.js`, `cover-awareness.js`, `ai.js` | Basiswahrnehmung, Gedächtnis pro Zombie, Zustandswechsel; Sichtlinie in `world.js` |
| Ruhephasen und Schlurfen | `zombie-idle.js` | Nur `idle`: Pausen, kurze erreichbare Wege und träge Drehung; `ai.js` behält Wahrnehmung und aktive Zustände |
| Zombie-Körper und Zuwanderung | `zombie-collision.js`, `ai.js`, `movement.js` | Maßstäbliche Körperradien, kontinuierliche Kontaktprüfung, seitliches Ausweichen und begrenzte Trennung alter Überlappungen. Weltkollisionen bleiben maßgeblich. Zuwanderung außerhalb der Spielersicht mit Abstand; ruhiger Weg ins Gebiet ohne erfundenen Suchreiz. |
| Zombie-Modelle und Animationen | `zombie-models.js`, `zombie-motion.js`, `docs/assets/zombies3d/` | Zehn echte skinned GLBs, Three.js als fest gepinnte gebündelte Abhängigkeit, interpolierte Original-Schlüssel und Pose-Blends pro Renderbild; Gehphase aus tatsächlicher Strecke und gemessenem Fußweg je Modell. Gemeinsame 2:1-Kamera und kontinuierliche Blickrichtung. Frischer WebGL-Pass pro Figur wird in die bestehende Tiefensortierung eingemischt; `render.js` behält Wände/Bäume/Dächer, Schatten und Status. Aufbereitung: `scripts/prepare-zombies-3d.py`. `zombie-animation.js`/`zombie-sprites.js` und bisherige Atlanten dienen als Ersatz bei fehlendem WebGL oder Ladefehlern. |
| Player-Modelle, Kleidung und menschliche Leichen | `player-models.js`, `character-parts.js`, `character-body.js`, `character-legs.js`, `character-surface.js`, `clothing-catalog.js`, `corpse-appearance.js`, `player-motion.js`, `quaternius-catalog.js` | Start in Unterwäsche ohne Ausrüstung. 45 einzeln lootbare Kleidungs-/Schuhteile und drei Kopfbedeckungen; Gesicht/Haare bleiben unabhängig. `character-parts.js` passt Originalkleidung an beide Rigs an. Körperflächen tragen Panty/Boxer/Sport-BH als Vertexfarben; `character-legs.js` entfernt alte Shorts-Säume, `character-body.js` verbindet den Bauch mit derselben Bundkante und passenden Gelenkgewichten. `character-surface.js` erhält Schnittkanten beim Verbinden. `corpse-appearance.js` wählt passende Originalteile für platzierte Personen; `PlayerModels.drawCorpse` friert die Todespose ein und leitet Bodenlage/Antippmaße aus sichtbaren Meshes ab. 24 Originalclips plus zwei Schleichclips; Aufbereitung: `scripts/prepare-player-animations.mjs`. |
| Gemeinsamer Modellpass und Einrichtung | `model-pass.js`, `quaternius-assets.js`, `world-models.js`, `docs/assets/quaternius/` | Ein WebGL-Kontext für Zombies, Player und statische Einrichtung; gleiche 2:1-Kamera und Meterprojektion. Neue Farbmodelle können ohne WebGL als echte animierte Canvas-Dreiecke erscheinen. Möbel/Blätter einmal pro Ausrichtung und Geräteauflösung zwischengespeichert. Maße aus Assetmetadaten gelten auch in `world.js` für Kollision und Wege. Aufbereitung: `scripts/prepare-quaternius.py`, danach `scripts/measure-quaternius.mjs`; Quellen/Maße im Asset-README. |
| Größenmaßstab und Körperhöhen | `world-scale.js`, `zombie-appearance.js`, `locomotion.js`, `docs/assets/reference-scale.json` | Gemeinsamer Metermaßstab für Player, DIN-Türblatt, Kühlgerät und Zombie-Modelle. ID-stabile Zombie-Körperhöhen; Player 1,80 m männlich / 1,68 m weiblich. `locomotion.js` hält Geschwindigkeiten in m/s und die Umrechnung in vorhandene Tiles. Vergleich/Quellen: `docs/assets/scale-reference/`; Generator `scripts/prepare-scale-reference.py`. |
| Kampf und Exekution | `combat.js`, `stealth.js` | Aufruf über `game.js`; Ansatz prüft Ziel vor Bewegung in `movement.js`, verdeckte Wege und Zielumfahrung über `player-navigation.js`; Waffenwerte in `inventory.js`, Verletzungen in `character.js` |
| Wunden, Behandlung, Bedürfnisse, Fähigkeiten | `character.js`, `item-actions.js` | Bedürfnisablauf in `game.js`; Status-/Medizinanzeige in `ui.js` |
| Gegenstände, Ausrüstung, Munition, Waffenmods | `inventory.js`, `data.js`, `item-actions.js` | Rucksack-/Waffenmenüs in `ui.js` |
| Weltobjekte, Gebäude, Fahrzeuge, Loot | `world.js`, `building-geometry.js`, `data.js`, `interaction.js` | Metrische Wanddicke/-höhe, Rahmen und Türsturz, kompakte Grundrisse und 50-cm-Innenboden unabhängig vom 2-m-Terrainraster. Gemeinsame Rechtecke für Darstellung, Sicht und Kollision; Körperradien in `world-scale.js`. Gemeinsame Zugangsprüfung für Anzeige, Annäherung und Benutzung; Punkt-/Streckenkollision in `collision.js`, Fußabdrücke in `cover.js`. |
| HUD, Statusicons, Menüs | `ui.js`, `item-icons.js`, `target-layout.js`, `status-icons.js`, `docs/style.css` | `item-icons.js` ordnet Kleidung und Rucksäcken freigestellte Modellansichten aus `docs/assets/clothing/` zu; Originalgeometrie und Materialfarben via `scripts/prepare-clothing-icons.mjs`. Bild und getragener Teil verwenden `clothingModelFor`. Zielfenster sparen Figuren und Bedienelemente aus; Canvas-Icons in `render.js`; DOM-Quelle in `web/index.html` |
| Missionsfortschritt | `missions.js`, `game.js` | `updateMission`; Missionsmenü in `ui.js` |
| Speichern und Laden | `save.js`, `game-state.js`, `world.js` | `serialize`/`load`, Weltobjekte und Zustand; Save-Version in `config.js` |
| Nachfolgefigur und Weltbeginn | `game.js` | Überlebender, Startzustand und bestehende Welt |
| Grafik, Auflösung, Renderleistung | `render.js`, `render-order.js`, `vision-cone.js`, `vision-display.js`, `vision-geometry.js`, `config.js` | Kamera, Projektion, sichtbare Objekte, Canvas; weiche Kegel auf gemeinsamer Ebene mit genauer Hindernisabschattung, Farbe nach bestehender Sicht-Erkennung; Spieltakt in `game.js` |
| Start, Laufzeitparameter, Hilfsfunktionen | `main.js`, `config.js`, `util.js` | `main.js` verbindet Welt, Renderer, Eingabe, UI und Game |
| Audio | `game-audio.js` | Bestehende Web-Audio-Presets; `Game.sound` bleibt als Aufruf erhalten |
| Veröffentlichung und Offlinecache | `scripts/build.mjs`, `scripts/release-status.mjs`, `.github/workflows/verify.yml`, `web/index.html`, `web/service-worker.js` | Generiert Einstieg, Hashdateien, Cache-ID und vollständige Cacheliste. Begrenzter Release-Beobachter ordnet Main-Prüfjob und Pages-Lauf demselben Merge-Commit zu und prüft normale Live-Dateien; Ablauf in `docs/RELEASE.md`. |
| Animationssteuerung und Workbase | `animation-controller.js`, `animation-document.js`, `animation-targets.js`, `character-pose.js`, `character-ik.js`, `animation-library.js`, `animation-replay.js`, `animation-workshop.js`, `workshop-ui.js`, `workshop-interaction.js`, `workshop-reference.js` | Gemeinsame geordnete Poseauswertung für Körper/Schatten/Waffensockel. Zeitunabhängige Grundhaltungen plus additive Zeitspuren und einstellbare Übergangsdauern. Optionale Stand-IK mit Becken, separaten Fußkontrollern und Kniezielen; Gehschritte behalten die Bewegungshoheit. Nachgeladener Editor mit Haltung/Animation/Prüfen, direkten Touchzielen, Kontaktwahl, Gestentransaktionen und lokalen Referenzbildern. Entwurf, Aktivierung und Export getrennt; Anleitung in `docs/ANIMATION_WORKSHOP.md`. |

Die Tabelle grenzt die Suche ein; nur tatsächlich betroffene Verbindungen verfolgen.

`asset-url.js` bindet öffentliche Modell-/Bilddateien an die Spielseite statt an
die Tiefe eines Build-Chunks. `model-loading.js` teilt laufende Abrufe zwischen
Aufrufern und begrenzt Wiederholungen; erfolgreiche Abrufe erhöhen die Modellrevision
und invalidieren auch bei pausierter Spielzeit die vorbereitete Player-Pose.
`consumeShot` in `inventory.js` führt Munitionsentnahme, Trommelstellung/Hülsen und
Schlittenverriegelung gemeinsam für Kampf und Werkstatt aus. `build.test.mjs` lädt
die acht Originalwaffen über den tatsächlich erzeugten gemeinsamen Chunk und HTTP
unter Root-/Unterpfad-Hosting auf beiden Rigs. `workshop-regression.test.mjs` prüft
Aufsatz-/Munitionsübernahme, Ladefehler/Erholung, Pause und Zeitleisten-Endbilder.

`character-workbase.test.mjs` schützt zeitunabhängige Posen, Stand-/Gehmaskierung,
Armlängen und Fußkontakte auf beiden Rigs mit allen acht Waffen. Eine Importgraph-
Prüfung hält Editoroberfläche und Gesten aus den Laufzeit-Modellmodulen heraus.
Explizite Handbindungen erhalten die modellbezogenen Handflächenkontakte;
kollineare Ellenbogenführungen und Ziele innerhalb der Mindestreichweite werden
ohne gestreckte Knochen oder ungültige Gelenkwerte aufgelöst.
`elbow-pose.js` setzt ausdrücklich bearbeitete Beugerichtungen um die tatsächlich
erreichte Originalarmstellung um und hält Hand-/Waffenkontakte fest. Die Oberfläche
zeichnet den resultierenden Beugebogen statt eines frei verschobenen IK-Pols.
`workshop-camera.js` rahmt ausgewählte Gelenkketten in Hoch-/Querformat ein und
hält die Kamera während einer Geste fest. Werkzeuge liegen in einem eigenen,
einklappbaren Bereich außerhalb der standardmäßig großen Modellansicht.
`scripts/workbase-browser-check.mjs` verwendet auf GitHub das vorinstallierte Chrome
für eine begrenzte Touch-/DOM-Prüfung ohne Browserdownload: mobile Bedienung,
Speicher-Roundtrip, Aktivierung und Zeitleiste. Der Modell-Ladepfad bleibt unabhängig
von diesen Editor-Modulen und vom Ort generierter Build-Chunks.

`weapon-reload.js` hält den gemeinsamen Nachladetakt für Animation, Munitions-
übertragung und Schusssperre. Magazine werden am Einsetzereignis atomar getauscht;
Revolverpatronen pro Ladeschleife. Abbruch und Save erhalten bereits übertragene
Munition ohne Doppelübertragung. `weapon-animation.js` verwendet die getrennt für
beide Rigs aufbereiteten KayKit-/ZenXChaos-Clips; `weapon-reload-pose.js` bewegt
Magazin/Trommel und passt die Stützhand an. `weapon-recoil.js` trennt den sichtbaren
kurzen Schussimpuls von der Zielerholung. `gunshot-effects.js` zeichnet kurzes
Mündungsfeuer und schwache, wandernde Schussspuren. `PlayerModels.shotMuzzle`
transformiert den echten Lauf-/Dämpferabschluss in Weltkoordinaten; keine Effekte
aus dem Player-Mittelpunkt. Revolver nutzt eigene Ziel-/Schussclips, einhändige
abgesenkte Tragehaltung im Stand/Sprint und beidhändiges Anlegen beim Gehen
oder tatsächlichen Anvisieren. Die entspannte Revolverhaltung folgt dem
Original-Neutralclip. Im Schleichstillstand hält ein eigener, weich überblendeter
einhändiger Kontaktfit den Revolver vor dem Oberkörper und den Lauf nach vorn
unten, unabhängig von der Vorneigung des Rumpfes; die linke Hand bleibt frei.
`weapon-ik.js` und der Kontaktfit begrenzen Unterarm- und
Handgelenkdrehung beim Reload getrennt von der Handgelenkbeugung.
Ein Patch erfordert nicht automatisch das Lesen jeder Datei in seiner Tabellenzeile.

`g17-grasp.js` nutzt die am 27.10. freigegebene Schulter-/Griffreferenz 10 aus
`docs/assets/weapons/g17-grasp.json`. Kalibrierte Finger und Handrahmen sind für
beide Original-Rigs aufbereitet. `pistol-pose.js` führt weiter die gemeinsamen
Zielbahnen, Kontakte und Unterbrechungen aus; die G17 blendet ihre Oberarmreferenz
zwischen Tragen/Nachladen und Anlegen in Weltkoordinaten. Der Stützarm gewinnt
bei Bedarf Reichweite über das Schlüsselbein. Nach der vollständigen Hand-/
Nachladeauswertung richtet `alignApprovedAim` die ganze Wirbelsäulenkette auf
die Spielzielrichtung aus: Der seitliche Referenzwinkel gehört zur Körperhaltung,
nicht als zusätzlicher Winkel zur Schussrichtung. Die Original-Beinketten bleiben
unverändert; Werkstattziele folgen derselben Korrektur. `weapon-ik.js` kann für diesen
Arm die kürzeste Oberarmschwenkung erhalten. Keine Preview-/Editor-Imports im
Laufzeitpfad. `g17-approved.test.mjs` vergleicht echte Hautpunkte mit dem
freigegebenen Render, prüft Lauf und Live-Mündung gegen die Spielzielrichtung
und schützt langsame 15-Hz-Übergänge sowie die Rumpfkorrektur zusätzlich zu den
30-/60-Hz-Pistolenprüfungen. Die Kalibrierung und die unabhängigen Testpunkte
lassen sich mit `scripts/prepare-g17-grasp.mjs` aus dem gespeicherten Review-10-
Mesh und dessen Schulterbindung erneut aufbereiten.

`weapon-motion.js` speichert nach der vollständigen Nachlade-/Rückkehrauswertung
die tatsächlich erreichten Hand- und Waffenrahmen relativ zu ihren Schultern.
Ein unterbrochener Pistolen-Haltungswechsel beginnt dort statt am alten
Blend-Zwischenwert. Revolver und Langwaffen führen ihre Waffenbahn ebenfalls
zwischen erreichten Rahmen; die Stützhand der Langwaffen bekommt pro Bild genau
einen Weg-/Drehschritt, auch wenn mehrere Kontaktfits nötig sind. Der begrenzte
Kontaktfit aus `pistol-pose.js` gilt auch für deren Stützarm. Der Revolver behält
denselben Oberarmrahmen beim Grundhalten und Nachladen; direktes Überblenden
fertiger Armknochen in die Neutralpose entfällt. `animation-continuity.test.mjs`
reproduziert weibliches Revolver-Nachladen, Nachladeabbruch/Sprint-Rückkehr,
Unterarmverdrehung und die kurze Sprintumkehr aller vier Pistolen.

`interior-layout.js` ergänzt die vier Gebäude um einzeln adressierbare Möbel,
Wandmontagen und Tischobjekte. `quaternius-catalog.js` liefert gedrehte physische
Fußabdrücke und metrische Tischhöhen. `interaction.js` begrenzt Behälter auf 50 cm
vom tatsächlichen Rand; `player-navigation.js` ergänzt dafür genaue Endpunkte
zwischen den 50-cm-Wegzellen. Auch die Itemübernahme prüft die Nähe erneut. `object-selection.js` bildet
Antippflächen aus projizierten Möbelkörpern inklusive Höhe; bei Überlappungen
ordnet eine nummerierte Auswahlliste die Objekte eindeutig zu. Erst die
bestehende Aktion führt zum gewählten Ziel. Kleine Dekoobjekte referenzieren
ihre Unterlage und übernehmen deren Modellhöhe und Tiefenreihenfolge.
`render-order.js` ordnet überlappende Raumobjekte nach ihren tatsächlichen
Beziehungen zu Rück-/Vorderwänden und Unterlagen. Teppiche bilden eine eigene
Bodenebene vor Blut, Bodenmarkierungen, Möbeln und Figuren. Unabhängige Objekte
behalten die bisherige Tiefenreihenfolge.
`weapon-test-crate.js` erzeugt für jede definierte Waffe ein vollständiges Testset
mit kompatiblen Mods, vollen/leeren Wechselmagazinen und drei Stapeln passender
Munition. `world.js` platziert die Kiste direkt neben dem frischen Startpunkt;
entnommene Gegenstände bleiben über die normale Weltobjektspeicherung entnommen.
`weapon-catalog.js` beschreibt Modelle, Grundteile, Mod-Zuordnung, Anschlüsse und
Griffprofile für AK, M4, Vector und Revolver. `weapon-models.js` lädt und cached jedes Asset
getrennt; Hand und drehbare Waffenbank verwenden dieselbe Konfiguration. M4-Setups
wechseln vollständige Oberteile, verschieben Dämpfer/Anschlüsse und passen die
Stützhand an. `inventory.js` erzeugt ab Werk montierte Teile aus `defaultMods`;
`requiredMods` verhindert Schüsse ohne Laufmodul. Die Vector
behält ihre Originalgeometrie in sieben Modulen und ihre Farben als Vertexfarben
mit einem gemeinsamen Material; `model-pass.js` übernimmt diese Farben auch im
Canvas-Ersatz. Aufbereitung und CC-BY-Nachweis: `scripts/prepare-vector.py` und
`docs/assets/weapons/README.md`. M4-Aufbereitung: `scripts/prepare-m4.py`;
alle 913 Originalflächen der Grundausführung bleiben erhalten. `equipment-views.js` steuert
die Ausrüstungsslots der Charakteransicht, drei Charakterreiter sowie auswählbare
Waffen-Mod-Slots und ihre Verbindungslinien. Antippen eines Waffen-Slots öffnet
eine sichtbare Teileauswahl als Dialog mit kompatiblen Mods bzw. Magazinaktionen;
die Auswahl ist unabhängig von der Scrollposition der Modellansicht erreichbar.
Beide Ansichten drehen per einzelner
Zeigergeste; die Waffe lässt sich zusätzlich kippen. `character-inspection.js`
verwendet einen getrennt posierten Klon mit tatsächlicher Kleidung und Ausrüstung.
`model-pass.js` zeichnet beide Menüs mit eigener Kamera auf Körper-/Waffenhöhe im
gemeinsamen WebGL-Kontext; der nächste Weltpass stellt seine Auflösung wieder her.
`player-motion.js` erhält die Schrittphase und dreht die Figur begrenzt über den
kürzesten Winkel zur Laufrichtung. `movement.js` hält nach Erschöpfung Gehtempo bis
zum nächsten Sprintbefehl, statt zwischen Gehen und Sprint zu pendeln; bestehende
Ausdauer- und Geräuschwerte bleiben erhalten. `rifle-animation.js` überträgt die
aufbereiteten KayKit-Ziel-/Schuss-/Tragebewegungen auf den Oberkörper beider Rigs;
`scripts/prepare-rifle-animations.mjs` erzeugt getrennte 30-Hz-Daten mit
Bind-Pose-Korrektur. Die vorhandene Beinanimation läuft auch beim AK-Schuss weiter.
`rifle-pose.js` passt beide
Arme und Finger an die tatsächlichen Handflächen-/Griffabstände an; leichte
Oberkörperdrehung, getrennte Stützhandrotation und Schafthaltungen ergänzen die
erhaltene Ganganimation. Körperbezogene Ellbogenebenen lassen dem rechten Arm
seitlich Platz; Beugeebene des Original-Rigs und griffbezogene Unterarmdrehung
vermeiden verdrehte Ärmel und Handgelenke. Entspannte Tragehaltung im Stand und
beim Sprinten mit weiter vorn liegendem rechten Ellenbogen, körpernah vor
Brust/Bauch mit diagonal zum
Boden gerichtetem Lauf und Anlegen beim Gehen bzw. tatsächlichen Anvisieren
werden weich überblendet. Mit Schaft folgt
die Schaftkappe einem Schulterkontaktpunkt; schaftlos gilt eine eigene Position.
Korrekturen werden vor der nächsten Animation/Abwahl
zurückgenommen; Armlängen bleiben erhalten. `character-shadow.js` gewinnt je Fuß
wenige echte Sohlenproben, verfolgt ihre animierten Positionen und zeichnet weiche,
bei Fußheben schwächere Kontaktschatten. `render.js` ruft diesen Bodenpass nach
Teppichen/Blut und vor erhöhten Objekten auf; `player-models.js`/`zombie-models.js`
teilen hierfür eine vorbereitete Pose zwischen Schatten und Körperzeichnung.
`inventory.js` verwaltet eigenständige Magazine, getrennte Füll-/Wechsel-
aktionen, zwei Füllgewichtsstufen, Feuermodus und Modwerte. `combat.js` führt
gehaltenes Auto-Feuer mit sicheren Abbrüchen, Rückstoß und geraden Durchschüssen
aus. Der HUD-Abzug in `input.js` beendet Feuer auch bei Pointer-Abbruch/Blur.
Lootkleidung verweist auf ihre tatsächlich vorhandenen Originalteile; Anlegen
ersetzt nur den zugehörigen sichtbaren Kleidungsteil.

`scripts/prepare-revolver.py` vereinheitlicht die Anschlüsse von R1/R2/R4 auf
einem gemeinsamen Grundkörper; drei Laufmodule, zwei Griffe, Rotpunkt und Lampe
bleiben getrennt. `inventory.js` prüft `modRequirements` über `weaponModSlots`:
erst der R4-Lauf macht Optik-/Zubehörplätze nutzbar. Beim Teilewechsel gehen nicht
mehr unterstützte Aufsätze samt Identität zurück in den Rucksack. Waffenbank und
Handmodell verwenden dieselben Platzregeln. `rifle-pose.js` nutzt für den Revolver
ein Handfeuerwaffen-Griffprofil mit Stützhand am Griff und stärkerem Hochschlag.
`weapon-light.js` liest Position und volle 3D-Ausrichtung der tatsächlichen
Waffenlampenlinse aus der gezeichneten Pose, begrenzt Strahlen am Boden und
verwendet `World.hasLineOfSight` für Wände/Türen. Die Projektion erhält die
Linsenhöhe; der Cache berücksichtigt Waffenpose und Sichtrevision. Erkundung und KI-
Entdeckungsregeln bleiben unverändert. Schaltzustand liegt am Waffenobjekt.

## Bestehende Kopplungen

`game.js` ist der Orchestrator und behält die bisherigen Methoden als schlanke
Weiterleitungen. Bewegung, Welt-Eingabe, Itemaktionen, Spielstandtransfer und Audio
liegen jeweils in eigenen Modulen. Objektinteraktionen und Missionsablauf liegen
weiterhin in `game.js`; `render.js` enthält Welt-/Figurendarstellung und `ui.js`
mehrere Menüs. Weitere Auslagerungen erfolgen nur bei einem passenden Feature.

KI, Kampf, Stealth und die Aktionsfunktionen bekommen derzeit das `Game`-Objekt als
Kontext. Dadurch existieren Abhängigkeiten zusätzlich zu den Imports. Die Aktions-
module importieren `Game` nicht; die Abhängigkeit läuft nur über diesen Kontext.
Vor Änderungen an einer Game-Methode ihre Aufrufer suchen; ein reiner Importgraph
reicht dafür nicht aus. Kleinere Kontextschnittstellen können später gezielt folgen.

Sinnvolle spätere Grenzen sind Objektinteraktionen, Medizinregeln, einzelne UI-
Panels und einzelne Renderaufgaben. Das sind Vorschläge, kein Auftrag für einen
Gesamtumbau. Der Build unterstützt weitere Module, Assets und dynamische Imports.
Kleinere Dateien helfen erst, wenn Zuständigkeiten und Schnittstellen klar bleiben.

## Prüfung und Release

- `npm test` entdeckt alle Testdateien. `core.test.mjs`: Welt, Navigation, Gesten, Gegenstände, Ausrüstung,
  Munition, Waffenmods, Charakter, Medizin und Save-Grundlagen.
- `stealth.test.mjs`: Hide, Sichtunterbrechung, Deckungssuche, Klassenperk,
  Exekution, Statusicons sowie Schutz bestehender Geräusch-/Ausdauerregeln.
- `actions.test.mjs`: bestehende Game-Aufrufe für Bewegung, Touch, Items und Save-Roundtrip.
- `build.test.mjs`: reproduzierbare Hashes, automatische Erweiterung, Offlinebetrieb
  und sicherer Wechsel zwischen vollständigen Releases.
- `gameplay-regression.test.mjs`: präzise Deckungswege, Lootzugänge, Exekution,
  automatisches Kampfende, echte HUD-Touchhandler sowie wirksame Verbände und bestehende Spielstände.
- `target-layout.test.mjs`: freie, stabile Zielfenster, Randpositionen und
  Ausweichpositionen in Smartphone-Querformaten inklusive Safe-Areas.
- `zombie-idle.test.mjs`: vollständige Ruhe-/Schlurfzyklen, kurze stabile Wege,
  Blockaden, unmittelbare Alarmreaktion, aktive Geschwindigkeiten, echte Verfolgung
  gegenüber Gehen/Schleichen/Sprint bei 30 und 60 FPS sowie Save-Roundtrip.
- `vision-cone.test.mjs`: genaue Schatten an Wänden und Fahrzeugen, Türöffnungen,
  kleine Bewegungen/Drehungen, Geometrie-Cache bei Weltwechseln, weiche Grenzen und
  bestehender Erkennungsfarbverlauf ohne Änderungen an Wahrnehmungsdaten.
- `zombie-animation.test.mjs`: zehn Varianten in alten/neuen Welten, reine
  Gehzuordnung, ruhige Kadenz bei 30/60 FPS unabhängig vom Bewegungstempo,
  Pause, ruhiger Angriff zur bestehenden Trefferzeit, tatsächliche Sprite-
  Projektion in allen Oktanten, Bildraster/-Hashes und Bildcache mit Drehung
  während des Nachladens.
- `building-geometry.test.mjs`: passende Türöffnungen in allen Orientierungen,
  geschlossene Türen und feste Rahmen, gemeinsame Sicht-/Kollisionsgeometrie,
  Spieler- und Zombie-Durchgänge, Gruppenfluss durch 86-cm-Türen bei 30/60 Hz,
  erreichbare Missionsobjekte und metrische Renderhöhen. Zombie-Wege nutzen nahe
  Baugeometrie das feinere 50-cm-Raster mit genauerem Erreichen der Wegpunkte.
- `zombie-models.test.mjs`: echte GLB-Geometrie und Skelettauswertung mit Three.js,
  metrische Höhe/Bodenkontakt, Original-Schlüssel und Trefferzeit, Weg-/Schrittkopplung
  bei 30/60/120 Hz, 32 kontinuierliche Richtungen zur echten Renderkamera,
  Zwischenposen innerhalb eines 60-Hz-Frames, Pause, Pose-Blends und frische
  Farb-/Tiefenpuffer ohne Motion Blur; unveränderte Geräusch-/Ausdauerwerte.
- `zombie-corpses.test.mjs`: echte Tötung mit gleicher Modellidentität und Körpergröße,
  Loot/Selektion und aktuellem Save-Roundtrip; passende Originalmodell-Sprites als
  WebGL-Ersatz. `zombie-models.test.mjs` prüft zusätzlich die zehn liegenden,
  unbewegten Skelettkörper mit Bodenkontakt und unveränderter Geometrie.
- `quaternius-models.test.mjs`: alle 21 Originalfiguren/24 Clips, wechselbare
  Kleidung auf gemeinsamem Rig, männlicher/weiblicher Maßstab, metrische
  Schrittphase, Fußkontakt beim Ducken, 123 geerdete Möbelmodelle mit passenden
  Tür-/Kühlgerätemaßen, reale Wege zu Behältern, Canvas-Ersatz/Cache und Player-Leiche.
- `zombie-collision.test.mjs`: Gegenverkehr, Türdurchgang und zwanzig gleichzeitig
  verfolgende Zombies bei 30/60 Hz ohne Körperüberlappung, kein Durchtunneln,
  sanfte Auflösung alter Stapel vor Wänden/Fahrzeugen, unsichtbare und ruhige
  Zuwanderung mit echten Hörreizen sowie Routen und Populationsgrenze der echten Karte.
- `directional-cover.test.mjs`: Schutz pro Beobachter, Vegetationsvorrang, glatte
  Zonenkanten/Wandkollision, Türöffnungen, sichere Execution-Wege und bestehende Geräuschregeln.
- `.github/workflows/verify.yml`: alle Tests, JavaScript-Syntax und erforderliche
  Spieldateien. Auf Main danach `Confirm live release`: derselbe Merge-Commit,
  erfolgreicher Pages-Lauf und bytegleiche normale Live-Dateien. Der Beobachter
  wartet auf den Job `verify`, nicht auf den eigenen Gesamtworkflow.
  `release-status.test.mjs` schützt gegen PR-/Commit-Verwechslung, fehlende Läufe,
  Selbstwarten, veraltete Live-Dateien und unbegrenzte Wiederholungen.
  Bei reinen Dokumentationsänderungen genügt eine Diff-Prüfung.
- `camera-interaction.test.mjs`: Projektion/inverse Taps, Ziehen und Zoomgrenzen,
  native Weltauflösung und konstante UI-Koordinaten, echte HUD-Touchhandler ohne
  anschließende Bewegungsbefehle, kurze Rand-Reichweite, vollständige Containerwege
  in der eingerichteten Karte und echte Kampfereignisse mit Originalanimationen.
- Browserprüfung auf die veränderte Bedienung oder Darstellung begrenzen.
  Eine Browser-/Canvasprüfung ersetzt keinen Test auf dem tatsächlichen iPhone.
- Vor Spielreleases `npm run build`, `npm test` und `npm run build:check` verwenden.
  `docs/build/`, `docs/index.html` und `docs/sw.js` sind generierte, committete Ausgabe
  für den bestehenden Pages-Pfad. Quellen tragen keine manuellen Versionszusätze.
- Der Worker installiert einen vollständigen Release mit Inhaltskennung und wartet
  vor der Aktivierung auf das Ende alter Sitzungen. Alte Caches bleiben bis dahin
  verfügbar; ein anderer App-Cache wird nicht gelöscht. Online-Navigation bleibt
  aktuell, offline wird die vollständig installierte Spielseite verwendet.
- Geräuschmechanik und Ausdauer bleiben ohne passenden Nutzerauftrag unverändert.
  Spieltests beginnen mit neuen Spielständen; alte Spielstände benötigen keine
  Übernahme oder Migration.

- `object-selection.test.mjs`: genaue erhöhte Tippflächen bei allen Zoomstufen,
  Mehrfachauswahl ohne Bewegung/Interaktion, verbindliches ausgewähltes Ziel,
  reale Deko-Unterlagen und gespeicherte/wechselbare Startkleidung.

- `render-order.test.mjs`: echter Teppich/Couchtisch und übermalter Küchenschrank,
  Überlagerungen in allen vier Gebäuden, Vorderwände, Deko-Unterlagen, vollständige
  Objektlisten und tatsächlicher Bodenpass vor Effekten und erhöhten Objekten.
- `ak.test.mjs`: kompatible Startsets, Magazinaktionen/Identität/Füllgewicht,
  Mod-/Bewegungseffekte, Auto-Kadenz bei 30/60/120 Hz, Abbruchfälle, Durchschuss,
  reale GLB-Teile und Save-Roundtrip. `rifle-pose.test.mjs`: beide Originalrigs,
  sieben Animationsclips und vier Ausrichtungen mit zusammenhängenden Armen,
  Stützhand am Griff, unveränderten Beinen und passender Mündungsrichtung;
  alle Schaftzustände, echte Fingerpositionen am Griff/Vorderschaft und Rücknahme
  der Korrekturen beim Ablegen. `character-shadow.test.mjs`: echte Sohlenproben
  beider Rigs beim Gehen/Schleichen, identische 3D-/Bodenprojektion, schwächere
  Schatten angehobener Füße und eine gemeinsame Pose für Schatten/Körper.

`weapon-ik.js` löst die Armketten mit bindeposenbezogener Unterarmdrehung.
`weapon-hands.js` enthält getrennte Finger-/Daumenstellungen und Handflächenrahmen
für Vorderschaft, aufrechten Vector-Griff, Revolver, Magazine und Patronengriff.
`rifle-pose.js` hält den Handflächenkontakt fest und korrigiert erreichbare
Handgelenkwinkel statt einen starren Handgelenkpunkt zu erzwingen. Körperbezogene
Ellbogenführung bleibt beim Wechsel der Haltung kontinuierlich. Die Schussabfrage
in `player-models.js` misst die gerade sichtbare Mündung ohne Haltungswechsel.
`weapon-reload-pose.js` führt Waffen-/Handkontakte nach derselben Nachladeuhr:
Geometrieschnitt am Magazin, gemeinsames Tragen, geradliniges Einsetzen; Revolver
mit zur Stützhand geöffneter Trommel und sichtbar zwischen Daumen/Zeigefinger
gehaltener Einzelpatrone. Taschenpunkte folgen der Hüfte auch beim Ducken.
Unterbrechungen kehren weich zur laufenden Haltung zurück; Ausrüstungswechsel
verwerfen die alte Übergangspose. Platzhalterwaffen bleiben im bisherigen Ablauf.
`weapon-hands.test.mjs` prüft echte Griffoberflächen, beide Handgelenke, Patronen-
kontakt/Übergabe, kontinuierliche vollständige Abläufe und unveränderte Hüftschüsse.


`weapon-cycle.js` bewegt Schlitten/Hahn/Lauf und die Revolvertrommel aus derselben
Schussuhr wie Rückstoß und Auswurf. `projectile-path.js` liefert nach Entfernung
geordnete Körperkontakte der tatsächlichen Schusslinie; `combat.js` wendet den
kumulativen Durchschlagsverlust an. `casings.js` löst Hülsen in Weltkoordinaten,
integriert Flug/Bodenkontakt im Spieltakt und erzeugt kleine Hörreize am Auftreffort.
Ruhende Hülsen liegen im Bodenpass, fliegende in der normalen Tiefensortierung.
`cartridge-models.js` liefert gemeinsame kaliberbezogene Geometrie für Hülsen und
Revolver-Nachladen; `game-audio.js` übernimmt leisere räumliche Metallklänge.
Keine Möbelkollisionen, keine dauerhafte Hülsenspeicherung. Vier Pistolen-GLBs,
Original-SVG-Icons und Herkunftsnachweise entstehen in `scripts/prepare-pistols.py`.

`pistol-pose.js` hält die vier Pistolen unabhängig vom Körpermaßstab, verbindet
den Griff mit dem gemessenen Mittelhandkontakt und richtet die Zielpose an den
Augen des tatsächlichen Kopfmodells aus. `weapon-catalog.js` enthält je Modell
Griff-/Daumenpunkte und den moderaten Darstellungsmaßstab. Eigene Handflächenrahmen,
erreichbare Handziele begrenzen Beugung und axiale Verdrehung getrennt.
Schulterbezogene Handbahnen führen Tragen/Anlegen/Ducken; die IK begrenzt
Ellenbogenebene und Strecktempo und verwendet die tatsächlich zuletzt sichtbare
Pose auch nach Unterbrechungen. Finger werden vor dem Kontaktfit gesetzt.
Die Original-Beinanimation bleibt erhalten. Rückstoß dreht um das Handgelenk.
`weapon-reload-pose.js` nutzt dieselben Pistolenrahmen für Magazin, Rückkehr und
Abbruch; gelöste Magazine folgen der tatsächlich erreichten Hand. Die übrigen
Waffen verwenden weiterhin ihre vorhandenen Kontaktprofile.
`pistol-pose.test.mjs` prüft Originalgeometrie/Griffkontakt, konstante Weltgröße,
Visierlinie, Arm-/Beinmaße, axiale Hautdrehung, vollständige Übergänge bei 30/60 Hz,
Nachladen/Abbruch und maximalen Magnum-Rückstoß auf beiden Original-Rigs.
Direkte Schleich-/Sprintwechsel und schnelle Unterbrechungen prüfen zusätzlich
Handbahn, Ellenbogenhöhe und Griffwiederaufnahme. `clothing.test.mjs` prüft die
einlagige Bauchfläche und die geschlossene innere/äußere BH-Stofffläche rundum.
