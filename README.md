# SPERRKREIS 98

Ein mobile-first Isometrie-Survivalspiel im fiktiven Brandenburg des Jahres 1998. Welt, Loot und Konsequenzen orientieren sich am langsamen Überlebenskampf; Darstellung, Zielkampf und direkte Weltinteraktion an klassischen isometrischen Online-Rollenspielen.

## Spielen

Die veröffentlichte Version liegt in `docs/` und ist für Safari auf dem iPhone im Querformat ausgelegt. Sie benötigt weder Build-Schritt noch externe Abhängigkeiten und funktioniert nach dem ersten Laden auch offline.

## Steuerung

- Boden antippen: zum Ziel laufen.
- Auf dem Boden halten und ziehen: die Laufrichtung fortlaufend vorgeben.
- Objekt oder Zombie antippen: auswählen.
- Objekt doppelt antippen: hinlaufen und benutzen.
- Kampfmodus: Nahkampf läuft im Waffenrhythmus; Schusswaffen werden bewusst über den Aktionsknopf abgefeuert.
- Haltung wechseln: Schleichen, Gehen und Rennen verändern Tempo, Sichtbarkeit und Geräusch.
- Inventargegenstand antippen: auswählen; die eingeblendeten Aktionen benutzen ihn, rüsten ihn aus oder bearbeiten Waffenmods.

## Enthaltener Spielstand

- Charaktererstellung mit fünf Hintergründen und acht nutzungsbasierten Fähigkeiten
- zusammenhängende Karte mit Safehouse, Wohnhäusern, Markt, Apotheke, Polizeiposten und Jagdverein
- kontextabhängiger Loot, Gewicht, Behälter und echte Ausrüstungsplätze
- Nahkampf, vier Schusswaffen, physische Munition/Magazine und acht Waffenmods
- Sichtlinien, Geräusche, drei Haltungen und mehrstufiges Zombieverhalten
- Verletzungen, Blutung, behandelbare Wundinfektion und tödliche Zombieinfektion
- Ironman-Autosave, permanenter Charaktertod und fortbestehende Welt mit plünderbarem Leichnam

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
