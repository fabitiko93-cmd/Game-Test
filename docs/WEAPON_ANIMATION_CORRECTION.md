# Waffenanimationskorrektur · 30.10.2026

Die beim Audit vom 29.10. gefundenen Rotationssprünge und die verbliebenen
acht Kollisionsfälle sind korrigiert. Die freigegebene G17-Zielhaltung,
Fingerformen, Original-Beinanimationen und Munitionsereignisse bleiben erhalten.

## Verhalten

- Pistolen bewegen das Handgelenk auf einer Bahn vor dem Körper. Die Rotation
  von Waffe und Hand verschiebt das Handgelenk nicht wieder hinter diese Bahn.
- Die freie G17-Stützhand bleibt im Schleichen in Bereitschaft neben dem Knie.
  Vor dem seitlichen Wechsel zum Griff oder Magazin steigt sie über die Beine;
  die Führung berücksichtigt den erreichten Handrahmen und den Weg dazwischen.
- Der fest geschlossene Griff verwendet seine kalibrierte Position. Eine
  vorsorgliche Schulter-Hand-Gerade hebt die Hand nicht vom Griff ab.
- Die G17 wird beim Nachladen im Schleichen höher gehalten, damit das Ziehen
  des Magazins den Unterarm nicht durch das angewinkelte Bein führt.
- Ellenbogenbeugung, Unterarmtorsion und Oberarmrollung folgen erreichten
  Rahmen. Nachladen und Abbruch führen die Hände vor dem Körper zurück.
- Beim Nachladeende übernimmt die G17 den tatsächlichen Anteil ihrer
  Schulterreferenz. Die rechte Armführung bleibt nötigenfalls über das Ende
  der Aktion hinaus aktiv, bis der Zielrahmen erreicht ist. Danach wird die
  normale, kalibrierte Zielführung wieder vollständig übernommen.

## Reproduzierbare Prüfung

**287 Tests bestanden; Build und reproduzierbare Build-Prüfung erfolgreich.**

```sh
npm test -- --test-concurrency=2
npm run build
npm run build:check
node scripts/audit-weapon-clearance.mjs
```

Die neue Fallmatrix enthält alle vier Pistolen auf beiden Rigs mit 15, 30
und 60 Hz: Anlegen und Absenken im Schleichstand und beim Schleichen,
Nachladen beim Gehen und im Schleichstand, Haltungswechsel sowie Abbrüche.
Der [Auditbericht](weapon-animation-audit-2026-10-30.json) hält die
Quellhashes und das Ergebnis fest: **192 Abläufe, 11.840 Frames, 0 Treffer**.

Die unabhängige Geometrieprüfung schneidet Unterarm- und Handmittellinien mit
verformten Körperdreiecken; sie verwendet die Laufzeit-Abstandsvolumen nicht.
Das Ergebnis gilt für diese geprüften Bahnen und Situationen und ist kein
allgemeiner Beweis der Kollisionsfreiheit jeder möglichen Armhautposition.

Weitere Regressionen schützen den kurzen G17-Anlegeweg, stationäre
Nachladeabbrüche, das vollständige Ende der rechten Schulterführung und die
anschließende kalibrierte Zielrichtung. Die bestehenden Prüfungen vergleichen
G17-Hautpunkte und Finger mit der Freigabe und prüfen Griffkontakte,
Lauf-/Mündungsrichtung, Beine, Werkstattbearbeitung, Magazin-/Patronenkontakte
und Munitionsereignisse.
