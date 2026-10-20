# Waffenmodelle

## M4 · Quaternius Ultimate Guns · CC0

Quelle: https://quaternius.itch.io/50-lowpoly-guns und
https://quaternius.com/packs/ultimategun.html. Originalarchiv:
`Ultimate Gun Pack by Quaternius.zip`. Autor: Quaternius, CC0 1.0.

Nutzer-Variante 1 = `AssaultRifle2_1.obj`. Alle **913 Polygonflächen** bleiben
erhalten; mit eingesetztem Magazin entspricht die Grundausführung den originalen
1.928 nicht entarteten Dreiecken. Unterteil/Griff, Magazin, Schaft, Oberteil und
abnehmbare hintere Visierung sind einzeln adressierbar. Variante 2 =
`AssaultRifle2_2.obj`: vollständiges alternatives Oberteil inklusive Lauf,
Vorderschaft, Korn und Schienen. Die Originalursprünge werden über die identischen
Pistolengriffe ausgerichtet; keine Verzerrung und kein erfundener Geometrieschnitt.
Die hintere Visierung wird bei montiertem ACOG ausgeblendet.

Zusätzliches CC0-Zubehör aus demselben Pack: `Accessories/Stock.obj` als
Duster-Rahmen, `Scope_3.obj` als 3×-Visier und `Silencer_1.obj` als M4-Dämpfer.
Insgesamt neun Meshknoten mit originalen Materialfarben als Vertexfarben;
ein gemeinsames Material, keine externen Texturen. Meter, +Y oben, +Z zur Mündung.
Standardausführung ca. 83 cm, alternatives Oberteil ca. 5,5 cm kürzer.

Reproduzierbar mit Python 3:
`python scripts/prepare-m4.py --source /pfad/zum/OBJ-Ordner`.
`m4.json` dokumentiert Quellhashes, Komponenten/Flächen, Ergebnis-Hash, beide
Stützhandprofile und die laufabhängigen Anschlüsse/Dämpferverschiebungen.

Eine Waffenart `m4_556`, zwei austauschbare `barrel`-Mods; gleiche 5,56×45-Munition
und 30er-Magazine. Standardlauf und Originalschaft sind ab Werk montierte eigene
Gegenstände. Lauf ausgebaut: kein Schuss, kein Munitionsverbrauch; zugehöriges
Visier/Dämpfer werden bis zum Wiedereinbau ausgeblendet. Die Start-Testkiste enthält
alle kompatiblen Mods sowie volle/leere Magazine und Munition. Gewichte/Kampfwerte
sind vorläufige Spielbalance. Varianten 3/4 mit MP-Magazinaufnahme bleiben später.

## AK · Quaternius Ultimate Guns

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

## Vector · TastyTony · CC BY 4.0

**„Low-Poly Kriss Vector“ von TastyTony**:
https://sketchfab.com/3d-models/low-poly-kriss-vector-ec2fb60fecaf4aea94b681a52ec7bc26

Lizenz: **Creative Commons Attribution 4.0 International (CC BY 4.0)**:
https://creativecommons.org/licenses/by/4.0/
Namensnennung, Quellen-/Lizenzlink und Änderungshinweis bleiben bei Weitergabe
erhalten. Der Credit ist zusätzlich im Pausenmenü des Spiels erreichbar.

Die unveränderte GLB-Quelle stammt aus dem öffentlichen Ai2-Objaverse-Datensatz:
https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-023/ec2fb60fecaf4aea94b681a52ec7bc26.glb
SHA-256: `3becb93d03e7a1ea26bca1338047d2f86c883ee8ef232b2752fcbfc970519d34`.
Die eingebetteten Assetdaten nennen TastyTony, Originalquelle und CC BY 4.0.
Objaverse: Deitke et al., *Objaverse: A Universe of Annotated 3D Objects*, 2022,
https://arxiv.org/abs/2212.08051. Die Datensammlung steht unter ODC-By 1.0;
für das einzelne Modell gilt die oben dokumentierte CC-BY-Lizenz.

Änderungen durch SPERRKREIS 98:

- Maßstab auf 62 cm Gesamtlänge mit ausgezogenem Schaft normiert, +Z nach vorn,
  +Y nach oben; tatsächlicher Pistolengriff als Bezug für das vorhandene Rig.
- Alle 7.419 Dreiecke der veröffentlichten GLB bleiben erhalten. Gehäuse, Lauf
  mit Mündungsaufsatz, Magazin inklusive Bodenplatte, Schaft, Vordergriff und
  Leuchtpunktvisier sind unabhängig adressierbare Module.
- Originalfarben als Vertexfarben mit einem gemeinsamen Material; flache
  Dreiecksnormalen und entfernte unbenutzte UV-Daten. Keine externen Texturen.
- Optionaler Dämpfer: vorhandenes `Silencer_1` von **Quaternius, CC0**,
  maßstäblich auf die Vector-Mündung gesetzt. Dieser Zubehörteil stammt nicht
  von TastyTony. Mit Dämpfer enthält das Asset sieben Module.
- Vereinfachtes eigenes SVG-Inventarsymbol nach der Modell-Seitenansicht.

Reproduzierbar mit Python 3 und numpy:
`python scripts/prepare-vector.py --source /path/to/original.glb`.
Die Aufbereitung prüft die Quellrevision vor der Teiletrennung. `vector.json`
enthält Ergebnis-Hash, Herkunft je Modul, Anschlüsse und beide Stützhandprofile.

`vector_9mm` nutzt vorhandene 9-mm-Munition und eigene 33er-Magazine.
Das Grundmodell ist leer und schaftlos; die Start-Testkiste enthält alle
kompatiblen Mods, volle/leere Magazine und Munition. Spielwerte sind vorläufige
Balancewerte. Lauf und ursprünglicher Mündungsaufsatz wechseln nur gemeinsam;
eine Klappanimation des abnehmbaren Schafts ist nicht enthalten.
