# SPERRKREIS 98

Ein mobile-first Isometrie-Survivalspiel im fiktiven Brandenburg des Jahres 1998. Welt, Loot und Konsequenzen orientieren sich am langsamen Überlebenskampf; Darstellung, Zielkampf und direkte Weltinteraktion an klassischen isometrischen Online-Rollenspielen.

## Spielen

Die aktuelle Version ist unter **[fabitiko93-cmd.github.io/Game-Test](https://fabitiko93-cmd.github.io/Game-Test/)** spielbar. Die fertige Veröffentlichung liegt in `docs/`, ist für Safari auf dem iPhone im Querformat ausgelegt und funktioniert nach der ersten erfolgreichen Offline-Installation auch ohne Netz. Zum Spielen werden weder Node noch externe Dienste benötigt.

## Entwickeln und patchen

Node 22 oder neuer verwenden. Einmal `npm ci`, dann `npm run dev`: Der lokale Server
unter `http://127.0.0.1:4173/` baut Änderungen an Modulen, Oberfläche und Assets
automatisch neu. Nach einer Änderung die Spielseite neu laden. Ein anderer Port
lässt sich mit `SPERRKREIS_PORT` setzen.

- Spielcode: `docs/src/`; zuständiges Modul über [ARCHITECTURE.md](ARCHITECTURE.md) finden.
- Oberfläche: `web/index.html` und `docs/style.css`.
- Offlineverhalten: `web/service-worker.js`.
- Veröffentlichung: `npm run build`, `npm test`, `npm run build:check`.

`docs/index.html`, `docs/sw.js` und `docs/build/` werden automatisch erzeugt und
gemeinsam mit den geänderten Quellen committed. GitHub Pages kann deshalb weiterhin
direkt aus `docs/` veröffentlichen. Diese Ausgabedateien nicht von Hand bearbeiten.
Versionsnummern in Imports oder Cachelisten müssen nicht mehr gepflegt werden.
CI prüft, dass die veröffentlichte Ausgabe zu den Quellen passt.

Dateinamen folgen dem Inhalt; unverändertes CSS behält beispielsweise seine URL.
Neue importierte Module und spätere dynamische Imports werden automatisch gebaut;
die Cacheliste wird aus den erzeugten Dateien und öffentlichen Assets abgeleitet.

## Steuerung

- Boden antippen: zum Ziel laufen.
- Boden doppelt antippen: bewusst zum Ziel rennen.
- Auf dem Boden halten und ziehen: die Laufrichtung fortlaufend im Gehtempo vorgeben.
- Mit zwei Fingern ziehen: den Bildausschnitt verschieben; `◎` zentriert wieder auf die Figur.
- Objekt oder Zombie antippen: auswählen.
- Dasselbe Objekt erneut oder doppelt antippen: hinlaufen und benutzen.
- Kampfmodus: Nahkampf läuft im Waffenrhythmus; Schusswaffen werden bewusst über den Aktionsknopf abgefeuert.
- Haltung wechseln: Schleichen, Gehen und Rennen verändern Tempo, Sichtbarkeit und Geräusch.
- Geduckt in nutzbare Deckung gehen: sofort verborgen, ohne Knopfdruck oder Schrittlimit.
- Einbrecher: `◈ TARNEN` gewährt geduckt 10 Sekunden Freifeldtarnung (30 Sekunden Cooldown).
- Inventargegenstand erneut antippen oder `BENUTZEN` wählen: benutzen, ausrüsten oder nachladen; Schusswaffen lassen sich über `ANPASSEN` modifizieren.
- Missionsziele sowie Bedürfnis-, Wahrnehmungs- und Deckungsanzeigen stehen im separaten Status-/Missionsmenü; das HUD bleibt auf die unmittelbare Spielsituation konzentriert.
- Aktuelle Tarnung, Geräuschpegel und kritische Zustände stehen als Icons neben der Figur;
  Suche und Exekutionsreichweite direkt am Zombie. Die Symbollegende steht unter STATUS.
- Liegengebliebene Fahrzeuge, Schuppen und Außenlager sind eigene Lootquellen und zugleich Deckungsobjekte.
- Bei Gegenständen mit Voraussetzungen nennt die Detailbeschreibung das benötigte Werkzeug direkt (z. B. „BENÖTIGT: DOSENÖFFNER“). Eine ausgeblendete Exekution wird im Ziel-Fenster als eigener, erklärter Aktionsknopf eingeblendet.

## Enthaltener Spielstand

- Charaktererstellung mit fünf Hintergründen und acht nutzungsbasierten Fähigkeiten
- zusammenhängende Karte mit vier Ankergebäuden, offenem Wohnhof, Jagdgelände und lootbaren Fahrzeugen
- kontextabhängiger Loot, Gewicht, Behälter und echte Ausrüstungsplätze
- Nahkampf, vier Schusswaffen, physische Munition/Magazine und acht Waffenmods
- Sichtlinien, Geräusche, drei Haltungen und mehrstufiges Zombieverhalten
- sichtbare, von Hindernissen abgeschnittene Sichtkegel beim Schleichen; hohe Wahrnehmung macht sie auch beim Gehen lesbar
- Verletzungen, Blutung, behandelbare Wundinfektion und tödliche Zombieinfektion
- Ironman-Autosave, permanenter Charaktertod und fortbestehende Welt mit plünderbarem Leichnam
- auf mobile Safari begrenzte Pixeldichte, Sichtbereich-Culling und lokale Trefferreaktionen ohne globales Bildschirmwackeln
- versionierter Autosave; ein struktureller Kartenwechsel startet bewusst mit einem frischen Spielstand

## Architektur

Das Spiel ist bewusst in austauschbare ES-Module getrennt:

| Modul | Verantwortung |
| --- | --- |
| `data.js` | Gegenstände, Waffen, Mods, Skills und Hintergründe |
| `world.js` | Karte, POIs, Gebäude, Türen, Fahrzeuge, Behälter und Loot |
| `navigation.js` | Wegfindung und Interaktionswege |
| `perception.js` / `ai.js` | Sicht, Geräusch und Zombie-Zustände |
| `cover.js` / `cover-awareness.js` | Deckungsgeometrie, stabile Suchbereiche und individuelles Zombie-Wissen |
| `stealth.js` / `status-icons.js` | Hide-Quellen, Einbrecher-Perk, Exekutionsablauf und gemeinsame Statussymbole |
| `inventory.js` / `character.js` | Ausrüstung, Magazine, Fortschritt und Wunden |
| `combat.js` | Zielkampf, Nahkampf und Schusswaffen |
| `save.js` | versionierter lokaler Spielstand |
| `movement.js` / `world-input.js` | Bewegungsablauf, Laufziele, Tap-/Halteaktionen und Kamerabedienung |
| `item-actions.js` | Benutzen, Behandeln, Looten, Ausrüsten und Waffenaktionen |
| `game-state.js` / `game-audio.js` | Spielstand übertragen und laden; bestehende Audioeffekte |
| `input.js` / `ui.js` / `render.js` | Eingabe, Oberfläche und Darstellung |
| `game.js` | Orchestrierung der Systeme ohne Datendefinitionen |

Die Werte in `config.js` und `data.js` sind die vorgesehenen Erweiterungspunkte. Der
automatische Build liegt in `scripts/build.mjs`, die Pages-Ausgabe in `docs/` und
Tests in `tests/`. Die bestehenden `Game`-Methoden delegieren an die Aktionsmodule,
sodass Aufrufer aus KI, Kampf, UI und Spielstandtests erhalten bleiben.

Deckungs- und Perkwerte stehen in `COVER_RULES`, `COVER_SEARCH` und `STEALTH_RULES`.
Prüfen: `npm test` findet alle Testdateien automatisch.
Änderungen: [CHANGELOG.md](CHANGELOG.md).
