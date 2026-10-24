# Character & IK Workbase

Im Pausenmenü **Animationswerkstatt** öffnen. Die Welt bleibt pausiert; die
Werkstatt verwendet einen eigenen Charakter und dieselbe Poseauswertung wie das
Spiel. Modelle und Kleidung bleiben Originalassets. Die Werkstatt verändert
Ziele, Kontakte und Gelenkausrichtungen, nicht die Geometrie oder Skinning-Gewichte.

## Haltung

1. Körpermodell, Waffe und Grundhaltung auswählen. Die Karten zeigen Tragen,
   Angelegt, Hüfte und die beiden Schleichhaltungen. Nach dem Speichern erscheint
   ein kleines Vorschaubild der gewählten Haltung.
2. Einen markierten Punkt antippen oder oben **Körperteil auswählen** verwenden.
   Die Kamera zoomt auf den Körperbereich einschließlich seiner Gelenkkette.
3. **Verschieben** bewegt das Ziel in der sichtbaren Bildebene. **Vor / zurück**
   bewegt es entlang der Blickrichtung der Figur: nach oben ziehen = nach vorn.
4. Für Ellenbogen am sichtbaren **Beugebogen** ziehen: Die Hand bleibt am Griff,
   der Ellenbogen bewegt sich um die Schulter-Hand-Achse. Beim fast gestreckten
   Arm ist der mögliche Bogen klein; bei Bedarf die Hand/Waffe näher zum Körper
   führen. Bewegungsgrenzen werden als Meldung angezeigt. Die frühere orange
   Führungspunkt-Linie wird an Ellenbogen nicht mehr als Verschiebeziel dargestellt.
5. **Drehen** verwenden und Neigen, Drehen oder Kippen auswählen. Am Punkt oder
   dem eingeblendeten Ring ziehen. Brust, Schultern und Kopf werden direkt gedreht.
6. Mit **Vorne / Seite / Schräg** den anderen Blickwinkel prüfen. **Ansicht drehen**
   bewegt ausschließlich die Kamera. +/− und Fokus ändern den Bildausschnitt.
7. **Entwurf speichern** sichert alle bearbeiteten Profile. **Im Spiel verwenden**
   aktiviert den Entwurf zusätzlich auf diesem Gerät.

Die Modellansicht verwendet standardmäßig den verfügbaren Bildschirm zwischen
der kompakten oberen Auswahl und der unteren Werkzeugleiste. **Werkzeuge** öffnet
die Einstellungen in einem eigenen Fach; das Fach verkleinert die Ansicht und
überdeckt sie nicht. Dort liegen auch die Zeitleiste und Speicherfunktionen.
**Ganz** zeigt die gesamte Figur, **◎** zoomt erneut auf die Auswahl. Während
eines Ziehvorgangs bleibt die Kamera fest. Antippen ohne Ziehen verändert keine
Pose und erzeugt keinen Rückgängig-Schritt. Auf schmalen Displays steht die Ansicht
über dem Fach, im Querformat daneben.

Grundhaltungen gelten unabhängig von der Zeit. Jede Bearbeitung ändert diese
Grundhaltung; es entstehen dabei keine zeitlichen Anfangs-/Endschlüssel.
**Haltung festhalten** übernimmt auch eine bisher unveränderte Haltung als Entwurf.

Die rechte Hand führt die Waffe. Beim Verschieben der Waffe folgen ihre Arme und
vorhandenen Handkontakte. Ellenbogenpunkte steuern die Beugerichtung und ändern
keine Armlänge. Die linke Hand kann automatisch dem Aktionskontakt folgen, am
Waffengriff gehalten oder frei positioniert werden. Zum unabhängigen Verschieben
zunächst **Hand frei positionieren** wählen. Das übernimmt die aktuelle Handlage
als Ausgangspunkt; anschließendes Ziehen verändert das freie Handziel.
Die Bindung unterscheidet Handflächenanker der Pistolen von Handgelenkankern der
Langwaffen und des Revolvers. Ellenbogenführungen bleiben auch dann gültig, wenn
der gewünschte Führungspunkt auf der Schulter-Hand-Achse liegt; zu nahe Ziele
werden auf die aus Ober-/Unterarm abgeleitete Mindestreichweite begrenzt.

Becken, Knie, Füße und Fußfixierung wirken im Stillstand einschließlich Ducken.
Die Schritte beim Gehen/Schleichen/Sprinten bleiben bei der Originalanimation.
Fixierte Füße halten beim Bearbeiten des Beckens ihre ursprünglichen Kontakte;
Fußziele können seitlich versetzt, angehoben und gedreht werden. Nicht erreichbare
Ziele werden begrenzt und als Abweichung angezeigt. Ein Zielfeld kann deshalb
weiter von der Figur entfernt liegen als der tatsächlich erreichte Körperpunkt.

Ein Ziehvorgang ist ein Rückgängig-Schritt. Ein zweiter Finger übernimmt keine
laufende Geste. Bei Pointer-Abbruch oder Fenster-Fokusverlust wird eine laufende
Bearbeitung zurückgenommen. **Auswahl zurücksetzen** betrifft nur den gewählten
Bereich; **Haltung / Spur zurücksetzen** entfernt die aktuelle Grundhaltung bzw.
Animationsspur. Die Zahlen unter **Feineinstellung** zeigen cm und Grad, Finger
werden in Radiant bearbeitet.

## Animation

Hier bleibt die Zeitleiste sichtbar. Haltung/Aktion, Bewegung und Zeitpunkt
wählen, anhalten und bearbeiten. Jede Änderung setzt ein Schlüsselbild an der
gewählten Stelle. Vorhandene Grundhaltungen bleiben als Basis erhalten; die
Animationsspur ergänzt zeitabhängige Korrekturen. Die Schaltfläche
**Schlüsselstellung setzen** übernimmt eine unveränderte Zwischenstellung.

Übergangsspuren formen die Hand-/Waffenwege zum Tragen, Anlegen oder zur Hüfte.
Ihre Dauer ist zwischen 0,1 und 2 Sekunden einstellbar und wird vom gemeinsamen
Spielcontroller verwendet. Die Korrekturen blenden an den Enden weich aus.
Nachladen und Schüsse verwenden weiterhin ihre tatsächlichen Aktionsuhren,
Munitionsereignisse und Waffenmechanik. Marker fahren diese Ereignisse direkt an.
Einzelschritte besuchen die tatsächlichen Bildpositionen einschließlich eines
verkürzten Schlussbildes. Zeitlupe und Wiederholung stehen unter Wiedergabe.

Während des Ziehens wird die aktuelle Pose ohne erneutes Klonen der Modelle
aktualisiert. Nach dem Loslassen wird der vollständige Ablauf einmal aus seinem
Ausgangszustand ausgewertet, damit auch Übergänge und Abbrüche reproduzierbar sind.

## Prüfen und vergleichen

**Prüfen** ist schreibgeschützt und wiederholt Kombinationen wie Anlegen,
Schleichen, Sprint, Richtungswechsel und Nachladeabbruch bei 30 oder 60 Hz. Zur
Bearbeitung zu **Haltung** oder **Animation** wechseln.

**Original vergleichen** zeigt die Ausgangsposen und sperrt die Bearbeitung.
Die Gelenkprüfung zeigt Handgelenkbeugung, Verdrehung, Geschwindigkeit und
Zielabweichungen. Die Anfasspunkte zeigen tatsächlich erreichte Stellen; ein
abgesetztes Zielfeld macht nicht erreichte Wunschpositionen sichtbar.
Natürlichkeit sowie Haut-/Kleidungsdurchdringungen zusätzlich aus mehreren
Blickwinkeln prüfen. Numerische Grenzen ersetzen diese Beurteilung nicht.

Ein eigenes Referenzbild (bis 15 MB, browserlesbares Bildformat) lässt sich mit
veränderbarer Deckkraft über der Figur anzeigen. Blickwinkel und Zoom passend
wählen. Das Bild bleibt lokal und gehört nicht zum exportierten Posenprofil.

## Speichern und Modelle

Entwurf, aktivierte Spielprofile und optionale Geräte-Vorschaubilder werden
getrennt gespeichert. **Spiel auf Original setzen** entfernt nur die Aktivierung.
Browserdaten können gelöscht werden; wichtige Entwürfe deshalb exportieren.
**Posen exportieren** sichert alle bearbeitbaren Daten. **Prüfablauf exportieren**
sichert zusätzlich Modus, Waffe, Aufsätze, Körpermodell, Ablauf, Prüftakt und Zeit.
Beide Formate lassen sich importieren. Frühere Exporte bleiben als Zeitspuren
lesbar; ihre Zeitabhängigkeit wird nicht automatisch in eine Grundhaltung umgedeutet.

Die Testwaffe erhält die gewählten Aufsätze und drei Patronen, das Ersatzmagazin
sieben. Fehlende Figuren-/Waffenmodelle sperren die Werkstatt mit einer konkreten
Meldung. **Modelle erneut laden** startet einen neuen Versuch; automatische
Versuche und Abrufdauer bleiben begrenzt.

## Modulgrenzen und Prüfung

- `animation-document.js`: versionierte Grundhaltungen, Korrekturspuren,
  Übergangsdauer, Validierung, Export und transaktionales Rückgängig.
- `animation-targets.js`, `character-pose.js`, `character-ik.js`: optionale,
  gemeinsame Ziele und Stand-IK. Keine DOM- oder Asset-Ladeabhängigkeit.
- `animation-controller.js`: geordnete Auswertung für Spiel und Werkstatt.
- `animation-workshop.js`: Orchestrierung des isolierten Editors.
- `workshop-ui.js`, `workshop-interaction.js`, `workshop-reference.js`:
  ausschließlich nachgeladene Oberfläche, Touchbedienung und Gerätebilder.
- `elbow-pose.js`: erreichbare, anatomisch begrenzte Ellenbogenrichtungen bei
  erhaltenen Handkontakten. Die Originalarmstellung bildet die Referenz.
- `workshop-camera.js`: Körperteil-Framing und während einer Geste feste Kamera.
- `asset-url.js` und Modellbibliotheken: unveränderte, öffentliche Assetauflösung,
  unabhängig von Position und Existenz des Werkstatt-Chunks.

`character-workbase.test.mjs` prüft gespeicherte Ganzkörperhaltungen auf allen
acht Waffen und beiden Rigs, Armlängen, Füße, Rücknahme, Gehmaskierung, freie
Handziele, Übergangstakt, Gesten und die Importgrenze zwischen Spiel und Editor.
Der vorhandene Buildtest lädt die tatsächlich erzeugten Waffen über HTTP unter
Root und Unterpfad. `scripts/workbase-browser-check.mjs` ergänzt auf GitHub eine
gezielte Prüfung mit installiertem Chrome: mobiles Layout, echter Touch-Drag,
Rückgängig, Speichern/Neuladen, Aktivierung, Nachlade-Zeitleiste und Prüfmodus.
Die optische Prüfung auf dem tatsächlichen iPhone übernimmt der Nutzer.
