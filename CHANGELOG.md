# Ruhige Zombie-Animationen und Blickrichtung · 15.10.2026

- Verfolgung verwendet jetzt normales Gehen. Rennclips sind aus Zuordnung und
  Veröffentlichung entfernt; Untersuchung verwendet ebenfalls den normalen
  Gehzyklus. Schlurfen und Hinken bleiben für Ruhewege und Suche erhalten.
- Die zurückgelegte Strecke beschleunigt Animationen nicht mehr. Gehzyklen
  folgen der Spielzeit mit 50–80 Prozent des jeweiligen Quelltempos, passend
  zum Zustand. Die bestehenden Bewegungsgeschwindigkeiten bleiben erhalten.
- Angriffsbewegung von 0,73 auf 1,4 Sekunden beruhigt. Die lange inaktive
  Vorphase wird übersprungen; Anlauf in Originalgeschwindigkeit und längere
  Erholung ersetzen die starke Beschleunigung des ganzen Clips. Der Treffer
  bleibt bei 0,28 Sekunden, ebenso die bestehende Abklingzeit von 1,42 Sekunden.
- Zuordnung der gebackenen Kamerazeilen zur isometrischen Weltprojektion
  korrigiert. Die abweichenden Grundrichtungen der Geh-/Hinkquellen werden
  zusätzlich anhand beider Füße über einen vollständigen Gang ausgerichtet.
  Beim Nachladen einer anderen Pose folgt auch das überbrückende Bild sofort
  der aktuellen Sichtrichtung statt eine ältere Drehung beizubehalten.
- Atlaskonfiguration gehört zum Spielbundle, Bilder tragen ihren Inhaltshash
  im Namen. Dadurch kann ein älterer aktiver Offlinecache keine alte
  Richtungszuordnung oder überarbeitete Animation unter gleichem Namen liefern.
- Regressionen für ruhige Kadenz bei unterschiedlichen Geschwindigkeiten,
  Verfolgung ohne Rennclip, Trefferpose und längere Erholung, echte projizierte
  Sprite-Richtungen, Hashbilder und Ausrichtung während eines Bildwechsels.

# Animierte Polyart-Zombies · 15.10.2026

- Zehn Zombie-Modelle von Denys Almaral (fünf weiblich, fünf männlich) ersetzen
  die bisherigen Blockfiguren. Haare und Hüte bleiben erhalten. Acht isometrische
  Blickrichtungen, gemeinsame Fußpunkte und bestehende Tiefensortierung.
- Die zehn Bewegungen aus dem gemeinsamen GLB-Take sind auf die passenden
  Zustände verteilt und auf alle benötigten Charaktervarianten übertragen:
  Ruhe, Aufmerksamkeit, langsames/ungleichmäßiges Schlurfen, Untersuchung,
  Rennen und abwechselnde linke/rechte Angriffe mit Erholung.
- Schrittphasen folgen tatsächlich zurückgelegter Strecke. Ruheanimationen
  folgen der Spielzeit und stoppen bei Pause. Angriffe passen zur bestehenden
  Anlaufzeit von 0,28 Sekunden; Treffer und Abklingzeit bleiben unverändert.
- Vorgerenderte transparente Atlanten für Canvas 2D, Bedarfsladen und begrenzter
  Bildcache. Während eines Animationswechsels bleibt die zuletzt geladene Pose
  sichtbar. Neue Assets gehören automatisch zum vollständigen Offlinecache.
- Auch bestehende Save-v4-Welten verteilen die zehn Erscheinungen ohne Reset.
  Auswahl, Lebensbalken, Statusicons, Sichtkegel, KI, Geräusche, Ausdauer und
  bestehendes Sterbeverhalten bleiben erhalten. Eine eigene Todesanimation
  enthält das Quellpaket nicht.
- Automatische Prüfungen für die Zuordnung, alle PNG-Raster, 30/60-FPS-Gangphasen,
  Pause, Angriffstiming und Bildcache; Canvas-Spielansichten mit allen Varianten.

# Weiche Sichtkegel und Verfolgungstempo · 14.10.2026

- Sichtkegel als transparenter Lichtschein ohne farbige oder dunkle Kontur.
  Entsättigtes Warmgelb, weich auslaufende Seiten und Reichweitenenden; Orange
  bis Rot folgt weiterhin dem bestehenden Erkennungsfortschritt. Ausgewählte
  Zombies erhalten eine moderate Hervorhebung, keine zusätzliche Bedienung.
- Eine gemeinsame Zeichenebene begrenzt die Gesamtdichte überlappender Kegel
  auf 25 Prozent. Gefahr wird zuletzt gezeichnet, damit ruhige gelbe Kegel
  die rote Warnung nicht überdecken. Kleine Nahbereichsringe entfallen.
- Exakte Strahlenschnittpunkte an zusammengefassten Sichtzellen und tatsächlichen
  Fahrzeugflächen ersetzen die grobe Abstandssuche. Zusätzliche Strahlen an
  Hindernisecken erhalten saubere Schatten und freie Türöffnungen. Die weiche
  Textur bleibt auf die sichtbare Fläche beschränkt und scheint nicht durch Wände.
- Position, Richtung und Reichweite aktualisieren die Kegel ohne Rasterstufen
  oder zeitlich verzögerte Weltpunkte. Statische Hinderniskanten, unveränderte
  Kegel und begrenzt viele Farbtexturen werden wiederverwendet.
- Verfolgungstempo 2,0 statt 1,1 Tiles pro Sekunde. Bereits erreichte Wegpunkte
  kosten in der Verfolgung keinen zusätzlichen KI-Takt: Gehen und Schleichen
  verlieren Abstand, Sprint gewinnt Abstand. Ruhe-/Schlurfverhalten, Such- und
  Untersuchungstempo sowie Spielerbewegung bleiben erhalten.
- Bestehende Sicht-/Hide-Regeln, Geräusche, Ausdauer und Save v4 bleiben erhalten.
  Neue Regressionen prüfen Abschattung, Bewegung und tatsächliche Verfolgung.

# Ruhige Zombies · 13.10.2026

- Nicht alarmierte Zombies wechseln zwischen individuellen Ruhephasen von
  6–14 Sekunden und kurzen Schlurfwegen von 0,5–1,5 Tiles. Das Ziel bleibt bis
  zur Ankunft bestehen; erst danach wird erneut pausiert und ein Weg gewählt.
- Schlurftempo 0,2 Tiles pro Sekunde und träge Drehungen. Vor dem Losgehen
  richten sie sich aus; während einer Pause gibt es höchstens einen kleinen
  Blickwechsel statt ständiger Rundumblicke.
- Lokale Wege müssen von Anfang an erreichbar sein. Blockierte Wege führen
  zurück in eine Ruhephase. Das Ruheverhalten benötigt keine laufende Wegsuche
  und bleibt in der Umgebung des bisherigen Ausgangspunkts.
- Geräusche und Sichtungen unterbrechen die Ruhe weiterhin sofort. Gegneranzahl,
  Spawnpunkte, Migration, Sichtwerte, Such-/Verfolgungszeiten, aktive Geschwindigkeiten,
  Kampf, Ausdauer und Geräuschquellen bleiben erhalten.
- Waagerechte Blickrichtungen werden bei Drehung, Sichtprüfung und Sichtkegel
  einheitlich ausgewertet; eine Nullkomponente wird nicht als fehlender Wert ersetzt.
- Eigene Zuständigkeit in `zombie-idle.js`. Bestehende Save-v4-Spielstände
  übernehmen das Verhalten ohne Weltreset; neue Ruhe-/Schlurfphasen werden gespeichert.
  Tests für vollständige Zyklen, Blockaden, Alarmübergänge und Save-Roundtrip.

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
