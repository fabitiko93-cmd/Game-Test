# Animationswerkstatt

Im laufenden Spiel das Pausenmenü öffnen und **Animationswerkstatt** wählen.
Die Welt bleibt pausiert; die Werkstatt verwendet einen eigenen Testcharakter.

1. Körpermodell, Waffe und bei Bedarf Aufsätze auswählen.
2. Haltung, Bewegung und Prüfablauf festlegen. Für Änderungen einen einzelnen
   Ablauf wählen; die kombinierten Abläufe dienen zum Prüfen der Übergänge.
3. Abspielen, Zeitlupe oder Einzelschritte verwenden. Die Kamera mit einem Finger
   drehen; Fokus und Zoom verändern ausschließlich die Ansicht.
4. Anhalten, einen Bereich wählen und Werte mit den Schritttasten oder Eingabefeldern
   ändern. Jede Änderung erzeugt eine Schlüsselstellung am aktuellen Zeitpunkt.
5. Die Schlüsselstellungen auf der Zeitleiste anfahren, ergänzen oder löschen.
   Rückgängig/Wiederholen erhält auch Änderungen an anderen Körper-/Waffenprofilen.
6. **Entwurf speichern** sichert den Entwurf. **Im Spiel verwenden** aktiviert ihn
   zusätzlich auf diesem Gerät. **Spiel auf Original setzen** entfernt diese
   Aktivierung, ohne den Entwurf zu löschen.

Die Testwaffe übernimmt die ausgewählten Aufsätze und startet mit drei Patronen;
ein Ersatzmagazin enthält sieben Patronen. Schusstests verwenden dieselbe
Munitionsentnahme, Trommelstellung und Schlittenverriegelung wie das Spiel.
Fehlt ein Modell, bleibt die Wiedergabe gesperrt. **Modelle erneut laden** startet
einen neuen Versuch. Vorübergehende Fehler werden mit Abstand höchstens dreimal
automatisch versucht; ein einzelner Abruf wartet maximal 15 Sekunden.

**Posen exportieren** sichert die bearbeitbaren Daten als JSON-Datei. Mit
**Prüfablauf exportieren** werden zusätzlich Waffe, Aufsätze, Körpermodell, Ablauf,
Prüftakt und Zeitpunkt gespeichert. Beide Dateitypen können wieder importiert werden.
Ein Export ist auch die Grundlage für eine spätere Übernahme in die allgemeine
Projektversion. Browserdaten können vom Gerät gelöscht werden; wichtige Entwürfe
deshalb zusätzlich exportieren.

## Gemeinsame Auswertung

`AnimationController` ordnet Basisbewegung, Waffenhaltung, Nachladeaktion, Finger
und Waffenmechanik. `PlayerModels` hält das ausgewertete Ergebnis für denselben
Zeitpunkt/Zustand bereit. Mündungs- und Auswurfsockel lesen dieses Ergebnis;
Kamera und Schatten verändern den Spielzustand nicht. Die Charakteransicht nutzt
ebenfalls den gemeinsamen Controller.

Bestehende, abgestimmte Waffenhaltungen bilden die Referenz. Die benannten
Pistolenreferenzen liegen in `weapon-poses.js`; Langwaffen/Revolver verwenden ihre
Originalbewegungen und modellbezogenen Griffdaten. Korrekturen verändern Ziele
vor der Arm-IK. Originale GLBs, Skelettgewichte, Waffenmaßstab und Spielregeln
bleiben erhalten.

Profile sind nach Körpermodell und Waffentyp getrennt und gelten für deren
Aufsatzkonfigurationen. Positionswerte sind Meter in Blickrichtung der Figur;
Waffen-/Handdrehungen sind Grad um die Figurenachsen. Körperdrehungen beziehen
sich auf die jeweiligen lokalen Skelettachsen. Die Oberfläche zeigt cm und Grad,
Fingerbeugung in Radiant. Übergangsspuren werden an den Enden weich ausgeblendet.

Die Werkstatt wiederholt Aktionen bei 30 oder 60 Hz aus einem frischen Zustand.
Rückspulen wiederholt die vollständige Historie einschließlich Nachladen und
Unterbrechungen. Unterschiedliche Prüftakte können geringe numerische Unterschiede
zeigen. Munitionsübertragung und Waffenmechanik behalten die gemeinsame Aktionszeit;
die Werkstatt zeigt die Übernahmeereignisse als anfahrbare Markierungen.
Einzelschritte verwenden die tatsächlichen Bildpositionen, einschließlich eines
verkürzten Schlussbildes. Rundungsreste importierter Cliplängen erzeugen keine
zusätzlichen winzigen Zeitschritte für die Handgeschwindigkeitsmessung.

Die eingeblendeten Prüfungen zeigen Beugung, axiale Verdrehung, Handtempo und
Abstand zum gewünschten Ziel. Während einer Bewegung kann ein Ziel noch nicht
erreicht sein. Natürlichkeit und sichtbare Haut-/Kleidungsdurchdringung zusätzlich
aus mehreren Blickwinkeln prüfen. Der Editor verändert keine Modellgeometrie oder
Skinning-Gewichte.
