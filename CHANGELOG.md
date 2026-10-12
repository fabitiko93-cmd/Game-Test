# HUD-Touch und Zielfenster · 13.10.2026

- Ursache des Weglaufens beim Tippen auf AUSSCHALTEN behoben: Der Button
  erbte eine durchlässige Touchfläche vom HUD, wodurch stattdessen der Boden
  ein Laufziel erhielt. HUD-Buttons nehmen ihre eigenen Taps entgegen.
- HUD-Befehle beenden alte Haltegesten; deren Bewegung und Loslassen können
  keine neue Route oder einen Doppeltap auslösen. Deaktivierte Buttons handeln nicht.
- Der angezeigte Exekutionsbefehl gehört zu seinem konkreten Ziel. Wird ein
  bereites Ziel zwischen Anzeige und Tap ungültig, folgt eine Erklärung statt
  eines stillschweigenden Wechsels von AUSSCHALTEN zu ANSCHLEICHEN.
- Gegnerkarte und Objektinfo wählen freie Randpositionen mit Abstand zu Figur,
  Ziel, Statusicons, Lootobjekt und Steuerung. Freie Positionen bleiben stabil;
  bei Platzmangel wird die Gegnerkarte kompakter. Der Exekutionsbutton bleibt
  mindestens 44 Pixel hoch und verschiebt sich während des Drückens nicht.
- Eigene kleine Layout-Zuständigkeit in `target-layout.js`, wiederverwendete
  HUD-Geometrie und gezielte Regressionen für Touchhandler und Querformate.

# Exekutionsansatz · 13.10.2026

- Automatisches Anschleichen verwendet durchgehend nutzbare Deckung. Fehlt ein
  verdeckter Weg hinter das Ziel, bleibt die Figur stehen und nennt den Grund.
  Freifeldtarnung erlaubt offene Wege, wenn ihre Restdauer dafür ausreicht.
- Drehungen und Bewegung des Ziels werden vor dem nächsten Bewegungsschritt
  berücksichtigt; veraltete Wege werden gestoppt und zeitlich begrenzt neu geplant.
  Der Ansatz läuft um den Zombie herum statt durch dessen Position.
- Ein Exekutionsversuch ersetzt alte Lauf- und normale Angriffsaufträge, auch
  wenn kein geeigneter Ansatz möglich ist. Bereites AUSSCHALTEN tötet weiterhin sofort.
- Hinter-dem-Ziel-Prüfung korrigiert für exakt waagerechte Blickrichtungen.
  Regressionen prüfen erfolgreiche Ansätze, bewegte Ziele, Abbrüche, Freifeldtarnung
  und den Ablauf mit Wahrnehmung und Kampf.

# Gameplay-Korrekturen · 12.10.2026

- Eigene Spieler-Wegsuche in Viertel-Tiles, präzise getippte Ziele, geprüfte
  Strecken statt bloßer freier Wegpunkte. Kleine Zwischenräume werden nutzbar;
  Fahrzeuge lassen sich auch an Ecken ohne Kollisionssprünge umlaufen.
- Schleichen bevorzugt gedeckte Verbindungen. Umwege bleiben auf 25 Prozent
  plus ein halbes Tile gegenüber dem normalen Weg begrenzt. Kollisions- und
  Deckungsabfragen werden wiederverwendet; Zombie-Wegsuche bleibt separat.
- Lootzugänge werden aus erreichbaren Standorten bestimmt, große Objekte vom
  Rand aus bedient. Die gemeinsame Zugangsprüfung verhindert Loot durch Wände.
  Automatische Türen funktionieren auch entlang geglätteter Wege.
- Manuelle Laufaufträge bleiben bis zur Ankunft vorrangig; automatische
  Kampfannäherung überschreibt sie nicht nach einem Timer.
- Eine gemeinsame Bereitschaftsprüfung für Exekutionsanzeige und Aktion.
  Bereites AUSSCHALTEN tötet sofort; die anschließende Animation ist rein optisch.
  Normale ausstehende Angriffe werden beim Ansatz und Zugriff verworfen.
- Kampfmodus und Angriffsaufträge enden nach dem Tod des ausgewählten Ziels
  oder verlorener aktiver Verfolgung. Geladene Saves starten ohne alte
  Angriffsaufträge; ein ausgewähltes Ziel darf bestehen bleiben.
- Saubere Verbände stoppen die Blutung ihrer Wunde vollständig, auch in alten
  Saves. Versorgung bleibt im Menü pro Wunde. Notverbände können ersetzt werden;
  blutende Wunden stehen oben und ihr Zustand wird ausdrücklich erklärt.
- Gesundheit, Schmerzen, Infektionsregeln, Geräuschwerte, Ausdauerwerte,
  Klassen und Save-v4 bleiben erhalten. Ergänzte Regressionen für die Abläufe.

# Deckungsanzeige · 04.10.2026

- Im Schleichen zeigen zusammenhängende Bodenflächen den nutzbaren Hide-Bereich
  statt kleiner pauschaler Ovale am Deckungsobjekt. Gold markiert verfügbare
  Flächen, Grün die aktuelle Deckung; Bezugspunkt sind die Füße der Figur.
- Anzeige verwendet die bestehende Deckungsgeometrie für Bäume, Büsche, Mauern
  und Fahrzeuge. Blockierte Standorte und Wasser bleiben frei; Überlappungen
  werden verbunden, echte Lücken bleiben sichtbar. Mauer-Hervorhebung respektiert
  Gebäudeseite und Innen-/Außenseite.
- Konturen werden mit einem Achteltile-Raster dargestellt und samt Canvas-Pfaden
  gecacht; keine neue Flächenberechnung bei jedem Bild. Türen und Weltwechsel
  aktualisieren die Anzeige. Kurze Erklärung im Statusmenü.
- Hide-, Such-, Geräusch-, Ausdauer- und Klassenregeln sowie Save-v4 unverändert.

# Technischer Patch · 02.10.2026

- Bewegung, Welt-Eingabe, Gegenstandsaktionen, Spielstandtransfer und Audio aus
  `game.js` ausgelagert. Bestehende Methoden bleiben als Weiterleitungen erhalten.
- Stabile Modulimports ohne verteilte Versionsnummern. Der automatische Build
  erzeugt JavaScript-/CSS-Dateien mit Inhaltskennung sowie HTML und Offlinecache.
- Cacheliste entsteht aus den tatsächlichen Build-Dateien und Assets; neue Module
  und dynamische Imports werden automatisch berücksichtigt. Bestehender Pages-Pfad
  `docs/` bleibt nutzbar.
- Offline-Updates ersetzen keine laufende Sitzung. Unvollständige Installationen
  werden verworfen; Fremdcaches bleiben erhalten und fehlende Skripte erhalten
  keinen HTML-Fallback.
- Lokaler Entwicklungsserver mit automatischem Neubau und CI-Prüfung der
  erzeugten Veröffentlichung. Ergänzte Integrations- und Offline-/Build-Tests.
- Spielregeln, Geräusche, Ausdauer, Bedienung und Save-v4 bleiben erhalten.

# Patch v12.1 · 24.09.2026

- Statusmenü lässt sich bei geringer Bildschirmhöhe per Wischen scrollen. Kopfzeile
  mit Schließen-Knopf bleibt sichtbar; Hinweise und Symbollegende bleiben erreichbar.
- Neuer Stylesheet-/Offline-Cache-Stand für bestehende Installationen.

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
