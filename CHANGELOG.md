# Patch v12 · 24.09.2026

## Verbergen und Zombie-Wissen

- SCHLEICHEN verbirgt normale Figuren sofort im nutzbaren Deckungsbereich. Kein separater
  Verbergen-Knopf, keine Kanalisierung, kein Schrittbudget. Außerhalb der Deckung bleiben
  die bisherigen Sichtkegel-, Geräusch- und Schleichregeln bestehen.
- Jeder Zombie merkt sich die letzte tatsächlich wahrgenommene Position und den dazugehörigen
  Deckungsbereich. Verborgene Bewegung aktualisiert diese Position nicht.
- Suche beginnt am festen letzten Sicht-/Geräuschpunkt, danach im bekannten Deckungsbereich.
  Andere Deckungen werden nicht automatisch mitgesucht. Mauerabschnitte unterscheiden
  Gebäudeseite und Innen-/Außenseite; einzelne Büsche bleiben eigenständige Suchbereiche.
- Nutzbare, überlappende Deckungsbereiche erlauben durchgehend verborgenes Bewegen. Sichtbare
  Lücken werden über die tatsächliche Sichtlinie des jeweiligen Zombies erkannt.
- Geduckte sichtbare Wechsel haben 1 Sekunde Erkennungsfrist. Kurze Beobachtungen addieren
  sich, sinken bei Sichtunterbrechung wieder ab und werden durch Deckungswechsel nicht
  einfach gelöscht. Aufrechte Wechsel hinterlassen sofort bekanntes neues Versteck;
  sichtbares Sprinten aus Deckung löst sofortige Verfolgung aus.
- Suchzeit läuft erst beim Eintritt in den Suchbereich: 6,5 Sekunden nach Sichtkontakt,
  5,5 Sekunden nach Geräuschen aus der bestehenden Suchlogik. Festhängende Suchanläufe
  enden nach ausbleibendem Fortschritt oder wiederholtem Wegfehler.
- Reine Nähe deckt nicht auf. Gezieltes Absuchen der bekannten Deckung kann innerhalb der
  bisherigen Nahdistanz von 0,68 Tiles aufdecken, sofern tatsächliche Sicht besteht.

## Einbrecher

- Eigener TARNEN-Knopf ausschließlich mit Openfield-Stealth-Perk; bestehende Einbrecher-Spielstände
  erhalten ihn ebenfalls. Sofort 10 Sekunden Hide, 30 Sekunden Cooldown ab Aktivierung.
- Nur geduckt und außerhalb aktiver Zombie-Verfolgung aktivierbar. Der manuelle Kampfmodus
  allein gilt nicht als Verfolgung. Abgewiesene Versuche kosten keinen Cooldown.
- Erlittene Treffer beenden die Tarnung nicht. Bereits begonnene Treffer können verletzen.
  Aufstehen, Sprinten und der eigene tatsächliche Angriff beenden die Wirkung.
- Ablauf in nutzbarer Deckung geht ohne sichtbaren Zwischenzustand in Deckungshide über.
  Der Perk-Cooldown sperrt normales Deckungshide nicht.

## Anzeigen und Welt

- Kleine Buff-/Debuff-Icons direkt an den Figuren ersetzen die vier großen taktischen HUD-Felder.
- Spieler: Tarnung, Geräuschpegel, aktive Wunden/Blutung/Krankheit; Hunger/Durst erst unter 18.
- Zombie: Verdacht, Suche oder Verfolgung. Graues Fadenkreuz bedeutet Exekutionsreichweite,
  grünes Fadenkreuz zusätzlich erfüllte Bedingungen. Auslösung bleibt im Zielfenster.
- Symbollegende im Statusmenü. Dauer am Tarnungsicon, Cooldown/Sperrgrund am Perk-Knopf.
- Bestehende hintere Messer-Exekution funktioniert auch gegen suchende Zombies, die den
  aktuellen Aufenthaltsort nicht kennen. Kein neues Exekutions-Skillset.
- Autos mit flacher Karosserie, geneigten Scheiben, Dach, sichtbaren seitlichen Rädern,
  Motorhaube und Scheinwerfern. Rechteckige Kollisions- und Sichtflächen folgen der Ausrichtung.
- Korrigierter Startpunkt am nördlichen Wagen; alte blockierte Speicherpositionen werden
  beim Laden auf die nächste freie Position gesetzt. Kein Spielstand-Reset.
- Getroffene Spieler werden kurz lokal eingefärbt statt transparent zu flackern.
- Gemeinsame Asset-Version v12 und vollständiger Offline-Cache für die neuen Module.

## Bewusst unverändert

Geräuschquellen, Lautstärken, Radien, Frequenzen und vorhandene Modifikatoren; Ausdauer;
allgemeine Verfolgungszeiten; Tap-/Doppeltap-/Halte-/Kamerasteuerung; Weltgröße und Gebäude.
Die bereits vorhandenen Außen-Schuppen und Taschen bleiben erhalten.

## Prüfung

- Bestehende Kernprüfungen plus `node tests/stealth.test.mjs`: 21 Szenarien zu Sicht,
  Deckung, individuellen Suchbereichen, Fristen, Perk, Treffern, Exekution und alten Saves.
- Spielwelt mit echtem Canvas-Renderer in 812 × 375 CSS-Pixeln gerendert und geprüft.
- Eine Prüfung auf einem physischen iPhone steht noch aus; Laufzeitmessungen der
  Entwicklungsumgebung sind keine iPhone-Leistungszusage.

Zurückgestellte Ideen bleiben mit Wiedervorlage in `DESIGN_PLAN.md` erhalten.
