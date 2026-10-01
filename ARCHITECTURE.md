# Modulkarte für SPERRKREIS 98

Stand: Spielregeln v12.1, technische Modularisierung vom 02.10.2026.
Zweck: den Einstieg und den Umfang eines Patches begrenzen.
Spielregeln und Ideen stehen in `DESIGN_PLAN.md`; diese Karte enthält Zuständigkeiten.

## Einstieg nach Aufgabe

Alle JavaScript-Pfade in der Tabelle liegen unter `docs/src/`.

| Aufgabe | Zuständige Module | Relevante Verbindung |
|---|---|---|
| Tap, Doppeltap, Halten, Kamera | `input.js`, `world-input.js` | Eingabeereignis → Ziel/Interaktion/Kamera; Bildschirmkoordinaten in `render.js` |
| Laufziel, Weg und Ankunft | `navigation.js`, `movement.js` | `setDestination`, `updateMovement`, `arriveAtDestination`; Kollision in `world.js` |
| Deckungszone und Hide | `cover.js`, `stealth.js` | `CoverMap.at` und `StealthSystem.refresh`; Darstellung in `render.js` |
| Sicht, Verdacht, Verfolgung, Deckungssuche | `perception.js`, `cover-awareness.js`, `ai.js` | Basiswahrnehmung, Gedächtnis pro Zombie, Zustandswechsel; Sichtlinie in `world.js` |
| Kampf und Exekution | `combat.js`, `stealth.js` | Aufruf über `game.js`; Waffenwerte in `inventory.js`, Verletzungen in `character.js` |
| Wunden, Behandlung, Bedürfnisse, Fähigkeiten | `character.js`, `item-actions.js` | Bedürfnisablauf in `game.js`; Status-/Medizinanzeige in `ui.js` |
| Gegenstände, Ausrüstung, Munition, Waffenmods | `inventory.js`, `data.js`, `item-actions.js` | Rucksack-/Waffenmenüs in `ui.js` |
| Weltobjekte, Gebäude, Fahrzeuge, Loot | `world.js`, `data.js` | Kollisions-/Sichtgeometrie in `cover.js`; Optik in `render.js` |
| HUD, Statusicons, Menüs | `ui.js`, `status-icons.js`, `docs/style.css` | Canvas-Icons in `render.js`; DOM-Quelle in `web/index.html` |
| Missionsfortschritt | `missions.js`, `game.js` | `updateMission`; Missionsmenü in `ui.js` |
| Speichern und Laden | `save.js`, `game-state.js`, `world.js` | `serialize`/`load`, Weltobjekte und Zustand; Save-Version in `config.js` |
| Nachfolgefigur und Weltbeginn | `game.js` | Überlebender, Startzustand und bestehende Welt |
| Grafik, Auflösung, Renderleistung | `render.js`, `config.js` | Kamera, Projektion, sichtbare Objekte, Canvas; Spieltakt in `game.js` |
| Start, Laufzeitparameter, Hilfsfunktionen | `main.js`, `config.js`, `util.js` | `main.js` verbindet Welt, Renderer, Eingabe, UI und Game |
| Audio | `game-audio.js` | Bestehende Web-Audio-Presets; `Game.sound` bleibt als Aufruf erhalten |
| Veröffentlichung und Offlinecache | `scripts/build.mjs`, `web/index.html`, `web/service-worker.js` | Generiert Einstieg, Hashdateien, Cache-ID und vollständige Cacheliste |

Die Tabelle grenzt die Suche ein; nur tatsächlich betroffene Verbindungen verfolgen.
Ein Patch erfordert nicht automatisch das Lesen jeder Datei in seiner Tabellenzeile.

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
- `.github/workflows/verify.yml`: alle Tests, JavaScript-Syntax und erforderliche
  Spieldateien. Bei reinen Dokumentationsänderungen genügt eine Diff-Prüfung.
- Browserprüfung auf die veränderte Bedienung oder Darstellung begrenzen.
  Eine Browser-/Canvasprüfung ersetzt keinen Test auf dem tatsächlichen iPhone.
- Vor Spielreleases `npm run build`, `npm test` und `npm run build:check` verwenden.
  `docs/build/`, `docs/index.html` und `docs/sw.js` sind generierte, committete Ausgabe
  für den bestehenden Pages-Pfad. Quellen tragen keine manuellen Versionszusätze.
- Der Worker installiert einen vollständigen Release mit Inhaltskennung und wartet
  vor der Aktivierung auf das Ende alter Sitzungen. Alte Caches bleiben bis dahin
  verfügbar; ein anderer App-Cache wird nicht gelöscht. Online-Navigation bleibt
  aktuell, offline wird die vollständig installierte Spielseite verwendet.
- Geräuschmechanik, Ausdauer und Save-v4 gelten als bestehende Verträge. Änderungen
  daran benötigen einen passenden Nutzerauftrag.
