# Modulkarte für SPERRKREIS 98

Stand: Spiel v12.1. Zweck: den Einstieg und den Umfang eines Patches begrenzen.
Spielregeln und Ideen stehen in `DESIGN_PLAN.md`; diese Karte enthält Zuständigkeiten.

## Einstieg nach Aufgabe

Alle JavaScript-Pfade in der Tabelle liegen unter `docs/src/`.

| Aufgabe | Zuständige Module | Relevante Verbindung |
|---|---|---|
| Tap, Doppeltap, Halten, Kamera | `input.js`, `game.js` | Eingabeereignis → Ziel/Interaktion/Kamera; Bildschirmkoordinaten in `render.js` |
| Laufziel, Weg und Ankunft | `navigation.js`, `game.js` | `setDestination`, `updateMovement`, `arriveAtDestination`; Kollision in `world.js` |
| Deckungszone und Hide | `cover.js`, `stealth.js` | `CoverMap.at` und `StealthSystem.refresh`; Darstellung in `render.js` |
| Sicht, Verdacht, Verfolgung, Deckungssuche | `perception.js`, `cover-awareness.js`, `ai.js` | Basiswahrnehmung, Gedächtnis pro Zombie, Zustandswechsel; Sichtlinie in `world.js` |
| Kampf und Exekution | `combat.js`, `stealth.js` | Aufruf über `game.js`; Waffenwerte in `inventory.js`, Verletzungen in `character.js` |
| Wunden, Behandlung, Bedürfnisse, Fähigkeiten | `character.js` | Behandlung/Bedürfnisse in `game.js`; Status-/Medizinanzeige in `ui.js` |
| Gegenstände, Ausrüstung, Munition, Waffenmods | `inventory.js`, `data.js` | Aktionen in `game.js`; Rucksack-/Waffenmenüs in `ui.js` |
| Weltobjekte, Gebäude, Fahrzeuge, Loot | `world.js`, `data.js` | Kollisions-/Sichtgeometrie in `cover.js`; Optik in `render.js` |
| HUD, Statusicons, Menüs | `ui.js`, `status-icons.js`, `docs/style.css` | Canvas-Icons in `render.js`; DOM-Struktur in `docs/index.html` |
| Missionsfortschritt | `missions.js`, `game.js` | `updateMission`; Missionsmenü in `ui.js` |
| Speichern, Laden, Nachfolgefigur | `save.js`, `game.js`, `world.js` | `serialize`/`load`, Weltobjekte und Zustand; Save-Version in `config.js` |
| Grafik, Auflösung, Renderleistung | `render.js`, `config.js` | Kamera, Projektion, sichtbare Objekte, Canvas; Spieltakt in `game.js` |
| Start, Laufzeitparameter, Hilfsfunktionen | `main.js`, `config.js`, `util.js` | `main.js` verbindet Welt, Renderer, Eingabe, UI und Game |
| Veröffentlichung und Offlinecache | `docs/index.html`, `docs/sw.js` | HTML-Einstieg, Versionsparameter an Modulimports, Service-Worker-Cache |

Die Tabelle grenzt die Suche ein; nur tatsächlich betroffene Verbindungen verfolgen.
Ein Patch erfordert nicht automatisch das Lesen jeder Datei in seiner Tabellenzeile.

## Bestehende Kopplungen

Das Spiel besitzt bereits 21 JavaScript-Module. `game.js` ist zugleich Orchestrator
und Aktionssammlung: Bewegung, Interaktionen, Gegenstandsnutzung, Menüs, Speichern
und Audio liegen darin. `render.js` enthält Welt- und Figurendarstellung;
`ui.js` enthält mehrere Menüs. Diese Bereiche sind die ersten Kandidaten für eine
gezielte Auslagerung, wenn ein Feature sie ohnehin verändert.

KI, Kampf und Stealth bekommen derzeit das gesamte `Game`-Objekt. Dadurch existieren
Abhängigkeiten zusätzlich zu den Imports. Vor Änderungen an einer Game-Methode
ihre Aufrufer suchen; ein reiner Importgraph reicht dafür nicht aus.

Sinnvolle spätere Grenzen sind Bewegung/Navigation, Objekt- und Itemaktionen,
Medizinregeln, einzelne UI-Panels und einzelne Renderaufgaben. Das sind Vorschläge,
keine bereits vorhandenen Module und kein Auftrag für einen Gesamtumbau.
Kleinere Dateien helfen erst, wenn Zuständigkeiten und Schnittstellen klar bleiben.

## Prüfung und Release

- `node tests/core.test.mjs`: Welt, Navigation, Gesten, Gegenstände, Ausrüstung,
  Munition, Waffenmods, Charakter, Medizin und Save-Grundlagen.
- `node tests/stealth.test.mjs`: Hide, Sichtunterbrechung, Deckungssuche, Klassenperk,
  Exekution, Statusicons sowie Schutz bestehender Geräusch-/Ausdauerregeln.
- `.github/workflows/verify.yml`: beide Tests, JavaScript-Syntax und erforderliche
  Spieldateien. Bei reinen Dokumentationsänderungen genügt eine Diff-Prüfung.
- Browserprüfung auf die veränderte Bedienung oder Darstellung begrenzen.
  Eine Browser-/Canvasprüfung ersetzt keinen Test auf dem tatsächlichen iPhone.
- Vor Spielreleases Cache und Einstieg zusammen prüfen. Die derzeitigen `?v=12`
  Modulimports und der v12.1-Cache sind getrennte Versionsangaben; kein blindes
  globales Ersetzen und kein pauschales Ändern aller Module pro Patch.
- Geräuschmechanik, Ausdauer und Save-v4 gelten als bestehende Verträge. Änderungen
  daran benötigen einen passenden Nutzerauftrag.
