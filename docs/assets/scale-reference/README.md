# Maßstab – erster Umsetzungsschritt, 15.10.2026

Beschlossen: Player 1,80 m; weiblicher Player 1,68 m ausschließlich für später
vorgemerkt. Kein neues Player-Modell in diesem Patch. Zuerst Größen abgleichen,
danach Echtzeit-3D-Zombies und Tempo/Schritte. Ein Weltport ist zurückgestellt.
Deutschland mit mehreren Städten/Bundesländern und detaillierten Häusern mit
Räumen/Etagen bleibt als spätere Richtung erhalten, ohne jetzigen Kartenumbau.

`../reference-scale.json` ist die gemeinsame, im Spiel verwendete Referenz:

- 2 m pro bestehender Boden-Kachel. Die Projektion bleibt 64 × 32 px pro Kachel,
  das entspricht 22,627 Projektionspixeln pro Meter und 19,596 vertikalen Pixeln
  pro Meter bei 30° Kameraneigung. Bildschirmdiagonalen sind keine Weltentfernungen.
- Türblatt 860 × 1985 mm nach DIN 18101, Quelle in der JSON. Freier Durchgang,
  Rahmen und Maueröffnung sind andere Maße, keine neuen Spielmechaniken.
- Kühlgerät 1860 × 600 × 665 mm, Bosch KGN362LAF. Konkretes Serienmaß,
  nicht als Deutschlands meistverkauftes Modell oder DIN-Kühlschrank belegt.
- Zombie-Varianten 0–4 weiblich, 5–9 männlich. Körperhöhen staffeln sich um
  1,68 bzw. 1,80 m, plus maximal ±2 cm ID-stabile Variation. Bereiche
  1,58–1,78 bzw. 1,70–1,90 m überlappen sich. Alte Save-v4-IDs behalten die
  bereits eingeführte Variantenverteilung. Kein Zufall beim Laden, keine Save-Migration.
- Skalierung je Modell aus derselben Referenzpose (idle, Quellrig 2, Zeit 0).
  Gemessen wird im Original-GLB nach Retargeting in Metern. Ein einziger Faktor
  bleibt für alle Aktionen einer Figur gleich; Posen werden nicht einzeln auf
  dieselbe Höhe gestreckt. Natürliche Körperformen bleiben erhalten.
- Noch vorhandene PNG-Animationen verwenden die gleichen Werte. Deren geringfügig
  abweichende Kameraneigung wird für den Maßstab vertikal korrigiert. In dieser
  Stufe gibt es noch keine Echtzeit-3D-Darstellung oder neue Gehgeschwindigkeit.

Die Bilder verwenden die gelieferten Modelle und dieselben Maßdaten, keine
generierten Ersatzfiguren. Die Darstellung der weiblichen Spielerreferenz ist
nur der bestehende Platzhalter in 1,68 m, kein angekündigtes neues Modell.

Reproduzieren (Python, numpy und Pillow):

```sh
python scripts/prepare-scale-reference.py /path/to/original.glb
```

Der Player wird in dieser Stufe schmaler und an den Boden geankert. Türblatt und
Kühlschrank werden maßstäblich gezeichnet. Bestehende Kollisions-/Interaktionsräume,
Deckungsregeln, Geräusche, Ausdauer und Speicherstände bleiben erhalten. Die Welt
wird nicht heimlich auf millimetergenaue Bauteilkollisionen umgestellt.
