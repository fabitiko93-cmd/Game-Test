# AK · Quaternius Ultimate Guns

Quelle: https://quaternius.com/packs/ultimategun.html und
https://quaternius.itch.io/50-lowpoly-guns. Autor: Quaternius. Lizenz: CC0 1.0;
die originale Lizenzdatei liegt neben diesem Dokument.

Das im Chat von oben nach unten als Variante 2 gewählte Grundmodell heißt im
Originalarchiv `AssaultRifle_3`. Seine 575 Polygonflächen bleiben erhalten und
werden in Receiver, Handguard, Barrel und herausnehmbares Magazine aufgeteilt.
Der feste Schaft stammt allein aus der Schaft-Geometrie von `AssaultRifle_2`;
der offene Schaft aus `Accessories/Stock`. Das kompakte Spielvisier verwendet
`Scope_3`, der Dämpfer `Silencer_1`. Es werden keine vollständigen weiteren
Waffenvarianten und keine AWP-/Bullpup-Modelle importiert.

Aufbereitung: `python scripts/prepare-ak.py --source /pfad/zum/OBJ-Ordner`.
Der Generator übernimmt Materialfarben, trianguliert, trennt acht benannte
Meshknoten und exportiert ein kompaktes GLB ohne Texturen. `ak.json` enthält
Quellen, Geometrieanteile und den SHA-256 des gepackten GLB. Das Inventar-SVG
entsteht aus der tatsächlichen Grundmodellgeometrie.

Einheit Meter, +Z entlang des Laufs, +Y oben; Griffursprung am rechten Handgelenk.
Der Waffenkörper ist etwa 58 cm lang. Magazine und Mods behalten identische
Anschlusspunkte in Handdarstellung und drehbarer Waffenbank. Die Laufgeometrie
der Basis bleibt beim Schaftwechsel erhalten. Weitere Lauf-/Kalibervarianten
bleiben späteren Definitionen vorbehalten.

`rifle-pose.js` richtet die AK auf die Blickrichtung aus und setzt beide Arme
an Griff/Magazinschacht, innerhalb ihrer wirklichen Reichweite. Körper, Beine
und Schritte verwenden weiterhin die Originalanimationen. Waffenbank und Welt
teilen den vorhandenen WebGL-Pass; statische Ansichten werden nur bei Änderung
neu gezeichnet. Der Canvas-Ersatz zeichnet dieselben Dreiecke.
