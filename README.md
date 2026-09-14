# SPERRKREIS 98

Ein mobile-first Isometrie-Survivalspiel im fiktiven Brandenburg des Jahres 1998. Welt, Loot und Konsequenzen orientieren sich am langsamen Überlebenskampf; Darstellung, Zielkampf und direkte Weltinteraktion an klassischen isometrischen Online-Rollenspielen.

## Spielen

Die aktuelle Version ist unter **[fabitiko93-cmd.github.io/Game-Test](https://fabitiko93-cmd.github.io/Game-Test/)** spielbar. Sie liegt in `docs/`, ist für Safari auf dem iPhone im Querformat ausgelegt, benötigt weder Build-Schritt noch externe Abhängigkeiten und funktioniert nach dem ersten Laden auch offline.

## Steuerung

- Boden antippen: zum Ziel laufen.
- Boden doppelt antippen: bewusst zum Ziel rennen.
- Auf dem Boden halten und ziehen: die Laufrichtung fortlaufend im Gehtempo vorgeben.
- Mit zwei Fingern ziehen: den Bildausschnitt verschieben; `◎` zentriert wieder auf die Figur.
- Objekt oder Zombie antippen: auswählen.
- Dasselbe Objekt erneut oder doppelt antippen: hinlaufen und benutzen.
- Kampfmodus: Nahkampf läuft im Waffenrhythmus; Schusswaffen werden bewusst über den Aktionsknopf abgefeuert.
- Haltung wechseln: Schleichen, Gehen und Rennen verändern Tempo, Sichtbarkeit und Geräusch.
- Inventargegenstand erneut antippen oder `BENUTZEN` wählen: benutzen, ausrüsten oder nachladen; Schusswaffen lassen sich über `ANPASSEN` modifizieren.
- Missionsziele sowie Bedürfnis-, Wahrnehmungs- und Deckungsanzeigen stehen im separaten Status-/Missionsmenü; das HUD bleibt auf die unmittelbare Spielsituation konzentriert.
- Bei Gegenständen mit Voraussetzungen nennt die Detailbeschreibung das benötigte Werkzeug direkt (z. B. „BENÖTIGT: DOSENÖFFNER“). Eine ausgeblendete Exekution wird im Ziel-Fenster als eigener, erklärter Aktionsknopf eingeblendet.

## Enthaltener Spielstand

- Charaktererstellung mit fünf Hintergründen und acht nutzungsbasierten Fähigkeiten
- zusammenhängende Karte mit Safehouse, Wohnhäusern, Markt, Apotheke, Polizeiposten und Jagdverein
- kontextabhängiger Loot, Gewicht, Behälter und echte Ausrüstungsplätze
- Nahkampf, vier Schusswaffen, physische Munition/Magazine und acht Waffenmods
- Sichtlinien, Geräusche, drei Haltungen und mehrstufiges Zombieverhalten
- sichtbare, von Hindernissen abgeschnittene Sichtkegel beim Schleichen; hohe Wahrnehmung macht sie auch beim Gehen lesbar
- Verletzungen, Blutung, behandelbare Wundinfektion und tödliche Zombieinfektion
- Ironman-Autosave, permanenter Charaktertod und fortbestehende Welt mit plünderbarem Leichnam
- auf mobile Safari begrenzte Pixeldichte, Sichtbereich-Culling und lokale Trefferreaktionen ohne globales Bildschirmwackeln

## Architektur

Das Spiel ist bewusst in austauschbare ES-Module getrennt:

| Modul | Verantwortung |
| --- | --- |
| `data.js` | Gegenstände, Waffen, Mods, Skills und Hintergründe |
| `world.js` | Karte, Gebäude, Türen, Behälter und Loot |
| `navigation.js` | Wegfindung und Interaktionswege |
| `perception.js` / `ai.js` | Sicht, Geräusch und Zombie-Zustände |
| `inventory.js` / `character.js` | Ausrüstung, Magazine, Fortschritt und Wunden |
| `combat.js` | Zielkampf, Nahkampf und Schusswaffen |
| `save.js` | versionierter lokaler Spielstand |
| `input.js` / `ui.js` / `render.js` | Eingabe, Oberfläche und Darstellung |
| `game.js` | Orchestrierung der Systeme ohne Datendefinitionen |

Die Werte in `config.js` und `data.js` sind die vorgesehenen Erweiterungspunkte. Der Pages-Build befindet sich in `docs/`; Kernlogik-Tests liegen in `tests/`.
