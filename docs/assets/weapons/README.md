## Eingebaute Flinten · 02.11.2026

Ithaca Mag-10 lang und kurz, Benelli M4 Super 90 und Mossberg 590 sind Spielgegenstände.
Die aktuelle kurze Ithaca übernimmt exakt die freigegebene originale Schaftkontur
und `ithaca-one-hand.json`; frühere Griffprototypen unten sind historische Entwürfe.
`ithaca_mag10.json`, `ithaca_short.json`, `benelli_m4.json` und `mossberg_590.json`
verknüpfen Originalflächen, einzelne Mechanikteile, Halter, Griffkontakte und Mündung.
Alle drei Originalmodelle: **TastyTony / CC BY 4.0**, Quellen:

- [Ithaca Mag-10](https://sketchfab.com/3d-models/low-poly-ithaca-mag-10-f16977d768994b69be28c3a502b41c99)
- [Benelli M4 Super 90](https://sketchfab.com/3d-models/low-poly-benelli-m4-super-90-caea90a9470143b69e6042f75b9c59cc)
- [Mossberg 590](https://sketchfab.com/3d-models/low-poly-mossberg-590-c0551a6b841145f7a8e59e9304728f1f)
- [Lizenz CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Änderungen: Bindpose und metrischer Darstellungsmaßstab gebacken, Originalfarben
als Vertexfarben übernommen, bewegliche Originalflächen getrennt. Kurze Ithaca:
freigegebene digitale Lauf-/Schaftkürzung samt geschlossenen Schnittflächen.
Drei-/Fünf-Patronenhalter: eigene textile Spielmodell-Geometrie; einzeln sichtbare,
abnehmbare Ersatzpatronen. Die Inventar-SVGs stammen aus denselben Modellflächen.
Aufbereitung: `prepare-shotgun-sources.mjs`, dann `prepare-shotguns.py`.
Quell- und Ausgabedateien sind in den JSON-Metadaten mit SHA-256 dokumentiert.

Spielprofile: Ithaca Kaliber 10, 2+1; Benelli Kaliber 12, 7+1; Mossberg Kaliber 12,
8+1. Kapazität zählt Rohr und Lager zusammen; Ersatzhalter erhöhen sie nicht.
Einzelpatronen werden zeitlich beim Einsetzen übertragen. Die Mossberg pumpt,
die Halbautomaten bewegen nur den Verschluss. Crafting, Akimbo und weitere
Lauf-/Griff-/Choke- oder Dämpfermods bleiben später.

### Historische Ithaca-Vorschauen

# Waffenmodelle

## Ithaca Mag-10 kurz · Einhand-Haltungsvorschau

`ithaca-short-stance.glb.gz` ist eine Haltungsvorschau, kein bereits spielbarer
Flinten-Gegenstand. Originalwaffe: TastyTony, **Low-Poly Ithaca Mag-10**, CC BY 4.0.
Quelle: https://sketchfab.com/3d-models/low-poly-ithaca-mag-10-f16977d768994b69be28c3a502b41c99
Lizenz: https://creativecommons.org/licenses/by/4.0/
Änderungen: Im Chat abgestimmte digitale Kurzvariante mit geschlossenen neuen
Schnittflächen; kompakter selbst erstellter Dreier-Patronenhalter (CC0), niedrige
Montageplatte und mittig angeordnete Schlaufen. Die übrigen Originalflächen und
Farben bleiben erhalten. Vorschau-Modell für ein Spiel, keine Fertigungsvorlage.

Verworfener Griffentwurf vom 02.11.2026: Den kurzen Holzstummel samt dessen altem
Zierbeschlag durch einen gerundeten, längeren Spielmodell-Griff ersetzen.
Die neue geschlossene Außenfläche ist separat als `CustomGrip` modelliert
(eigene Geometrie, CC0). Gehäuse, Lauf, bewegliche Teile und Patronenhalter
bleiben erhalten; `ithaca-retained-surfaces.json` hält deren Quellflächen fest.
`scripts/prepare-ithaca-grip.py QUELLVORSCHAU.glb AUSGABE.glb.gz` reproduziert
die Modellbearbeitung aus der vorherigen kreditierten Halter-Vorschau.
Diese eigenständige Pistolengriff-Form wurde im anschließenden Abgleich
verworfen und ist keine freigegebene Gestaltung für den Einbau.

Überholte Zwischenentwürfe: `scripts/preview-ithaca-stock-variants.py` erhält die
Originalflächen am Schafthals und formt zwei alternative Enden. A bleibt näher
am kurzen Schaftrest, B führt dessen Linie länger nach hinten aus. Der passende
`.mjs`-Exporter und `scripts/lib/ithaca-stock-options.json` bilden eine erste
Handeinpassung auf beiden Rigs ab. Die Varianten sind ausschließlich Entwürfe;
Fingerkontakte und Bewegungen werden nach der Formwahl endgültig kalibriert.

Aktuelle Referenz vom 02.11.2026: Die Nutzerdatei `ithaca.jpg` markiert eine
schräge Kürzung des Originalschafts. `tests/fixtures/ithaca-reference-cut.glb.gz`
enthält diese digitale Kürzung mit geschlossener neuer Schnittfläche. Die
erhaltenen Originalflächen bleiben unverformt; der vorherige kurze Lauf und
der kompakte Halter bleiben erhalten. Originalmodell TastyTony / CC BY 4.0,
Quellen-/Lizenzlink wie oben. Keine Wicklung, Streckung oder neue Griffform.
`ithaca-reference-pose.json` enthält die passende Einhandkalibrierung beider
Rigs samt gesonderter Abzugsfingerpose. `scripts/preview-ithaca-reference.mjs`
rendert diese aktuelle Referenz; weiterhin kein spielbarer Flinten-Gegenstand.

`ithaca-short-pose.json` enthält die Kalibrierung für Tragen, Hüfthaltung,
einhändiges Zielen auf Schulterhöhe und den sichtbaren Schussimpuls. Der linke Arm folgt weiterhin
der Originalanimation; Nachladen, Akimbo und die Absäge-Mechanik sind nicht Teil
dieser Haltungsvorschau. Das Modell wird noch nicht vom Waffen-Katalog angeboten.
Die beiden `rigs` enthalten eigene Handflächenkontakte, Handrahmen und Finger-
quaternionen. Die Metakarpal-/Daumenbasis stammt aus der freigegebenen G17-
Kalibrierung; Fingerkrümmungen, Daumenöffnung und Kontakte sind auf diesen Griff
angepasst. Der Zeigefinger wechselt weich zur getrennten Abzugspose. Im Ducken
führt die Tragehand etwas weiter nach vorn, damit das Handgelenk innerhalb
seiner Grenzen bleibt und der Lauf weiterhin abgesenkt ist.
`node scripts/preview-ithaca-stance.mjs /pfad/zur/ausgabe` erzeugt die tatsächlich
verformten Original-Figurenoberflächen beider Rigs für Render und Kontrolle.
`node scripts/preview-ithaca-grip.mjs /pfad/zur/ausgabe QUELLVORSCHAU.glb`
exportiert den Griffvergleich sowie Handdetails beider Rigs mit Hautnormalen.

Die kurze Variante soll später als fertiger Loot eingebaut werden. Eine
Crafting-Aktion zum Absägen und der Einfluss des Handwerksskills bleiben später.

## Revolver · R1/R2/R4 · .44 Magnum

Originale aus Quaternius Ultimate Guns, CC0:
https://quaternius.itch.io/50-lowpoly-guns.
Die **Bildreihenfolge** lautet R1=`Revolver_4.obj`, R2=`Revolver_2.obj`,
R4=`Revolver_3.obj`. R3/R5 werden nicht verwendet. Ein gemeinsamer R2-Grundkörper
mit Trommel, Rahmen, Hahn und Abzug erhält drei komplette Lauf-/Visierungsmodule
und zwei Griffe. Die 621 Polygonflächen der R2-Ausführung bleiben vollständig
erhalten. Kleine Ursprungs-/Anschlussabweichungen von R1 werden je Modul durch
Translation ausgeglichen; die Originalteile werden weder verzerrt noch vereinfacht.
R2 und R4 teilen sich denselben Griff samt beiden seitlichen Griffschalen.

Zusätzlich: `Accessories/Flashlight.obj` von Quaternius, CC0. Rotpunktgeometrie
aus TastyTonys **bereits eingebundener und kreditierter Vector**, CC BY 4.0;
Originalquelle und Lizenz sind im Vector-Abschnitt unten und im Pausenmenü
verlinkt. Änderung: Optik als einzelnes Modul übernommen, um 25 % verkleinert,
auf die hintere Position der Revolverschiene verschoben, originale Farben erhalten.
Lampe sitzt weiter vorne; beide Module haben getrennte Montagepositionen.
Das kombinierte Asset enthält damit CC0- und CC-BY-Teile; `revolver.json` nennt
die Lizenz pro Modul sowie Quell-/Ergebnishashes. Keine Schalldämpfergeometrie.

Aufbereitung: `python scripts/prepare-revolver.py --source /pfad/zum/OBJ-Ordner`.
Ein Material mit Vertexfarben, zehn Meshknoten, Meter/+Z zur Mündung. Trommel und
Hahn sind separate Originalteile für Animationen; sämtliche Flächen bleiben erhalten.
R1-Konfiguration
ca. 25 cm, lange Ausführungen ca. 34 cm. Ein gemeinsamer Ingame-Revolver mit sechs
direkt geladenen .44-Patronen; keine herausnehmbaren Magazine. Kaliber und Werte
sind Spieldefinitionen, keine ballistische oder konkrete Herstellerzuordnung.
Rotpunkt/Lampe benötigen den R4-Lauf. Schaltzustand der Lampe wird gespeichert.
Der Lauf-/Dämpferabschluss wird direkt aus der sichtbaren Geometrie gemessen.
Mündungsfeuer und kurze Schussspuren beginnen am transformierten Abschluss des
tatsächlich gehaltenen Modells. Nachladen öffnet die Trommel; Patronen werden
mit dem Einsetzereignis der wiederholten Ladeanimation einzeln übertragen.

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


## Pistolen · G17, HK USP, SIG Emperor Scorpion, Desert Eagle

Vier Originalmodelle von **TastyTony**, **CC BY 4.0**, jeweils aus dem öffentlichen
Objaverse-Spiegel. Original- und Downloadlinks, Quellhash, Ergebnis-Hash sowie die
Herkunft jedes einzelnen Moduls stehen in `g17.json`, `usp.json`, `scorpion.json`
und `deagle.json`. Alle 2.317 / 2.772 / 4.232 / 4.299 ursprünglichen Dreiecke
bleiben erhalten. Die Hautgewichte sind starr; Dreiecke lassen sich dadurch ohne
Schnitt oder Verformung ihrem Bauteil zuordnen. Bindematrizen und vollständige
Knotentransformationen werden ausgewertet, Metermaß und Handrahmen eingebrannt.
Originalmaterialfarben bleiben als Vertexfarben erhalten. Die echten SVG-Icons
entstehen aus diesen Dreiecken; Deserteagle und G17 nutzen auch die originalen
Specular-Glossiness-Farben aus den GLBs.

Reproduktion: `python scripts/prepare-pistols.py --source-dir /pfad/zu/glbs`.
Die vier Quellrevisionen sind per SHA-256 gesperrt. Gesonderte verlängerte Magazine
behalten ihre Originalflächen; ausschließlich der untere Magazinteil wird um
25 mm verlängert. Standard-/Langmagazine: G17 17/24, USP 15/22, SIG .45 8/12.
Die Desert Eagle nutzt nur ihr ursprüngliches 7er-Magazin und keine Aufsätze.
`pistol_9mm` und die historischen beiden `mag_9mm_*`-IDs bleiben interne Identitäten
für G17/17er/24er; sichtbare Namen und tatsächliche Kapazitäten sind aktualisiert.

Dämpfer/Lampe: vorhandene Quaternius-Originalgeometrie, CC0; Leuchtpunkt: vorhandene
TastyTony-Vector, CC BY 4.0. Die Sattelplatte ist ein eigenes CC0-Modell mit
seitlichen Füßen und vier kurzen Schienenstegen. Optik benötigt die Platte und
kehrt bei deren Ausbau ohne Verlust ins Inventar zurück. Ihre Größen und Sitze
sind modellabhängig. Optik/Platte folgen dem Schlitten; Lampe sitzt am Rahmen.
Schussmechanik, Auswurf und Reload verwenden die bestehenden gemeinsamen Uhren;
Pistolen bleiben nach dem letzten Schuss offen. Die Desert Eagle behält ihren
festen Lauf. Bewegungen sind für das Spiel erstellt, keine mitgelieferten Clips.

Die gehaltenen Pistolen verwenden eigene, auf den Original-Griffen liegende
Handkontakte und einen festen Darstellungsmaßstab für die stilisierten Hände:
G17/SIG 1,18; USP 1,12; Desert Eagle 1,14 gegenüber der vorbereiteten Grundgeometrie.
Die Figurenhöhe verkleinert die Waffe nicht mehr. Die GLB-Geometrie selbst bleibt
unverändert. Pistolenhaltung, Ziel-/Griffanpassung und Rückstoß sind eigene
Spielanimationen; Quelle, Lizenz und übrige Modelländerungen bleiben wie oben angegeben.

## Patronen und Hülsen

`cartridge-models.js` enthält eigene, einfache CC0-Profile für 9 mm, .45 ACP,
.44 Magnum, .50 AE, 5,56×45 und 7,62×39. Offene Hülsenmünder, dunkler Innenraum,
Auszieherrand und Gewehrhals sind echte Geometrie; scharfe Patronen erhalten ein
eigenes kupferfarbenes Geschoss. Die Maße dienen der visuellen Annäherung.
**.50 AE ist kein verkleinertes .50 BMG.** Diese Modelle ersetzen auch die alten
vollen Messingzylinder in der Revolver-Nachladeanimation.

Hülsen werden am Waffenfenster in Weltkoordinaten gelöst, fallen mit metrischer
Schwerkraft, springen gedämpft nach und liegen auf der Seite am Boden. Bis zu
96 Hülsen bleiben maximal 45 Sekunden; ruhende Darstellungen werden zwischengespeichert.
Bodenmaterial beeinflusst Klang, Aufprall und die sehr kleinen lokalen Hörreize.
Der Revolver wirft nur wirklich abgeschossene Hülsen während des Entladens aus;
Abbruch erzeugt keine doppelten Hülsen und verbraucht keine scharfen Patronen.
Möbel-/Wandkollisionen und dauerhafte Hülsenspeicherung sind nicht Teil des Patches.

Körperdurchschuss: alle vorhandenen Schusswaffen verwenden denselben geordneten
Strahl-/Körpertest. Jede weitere durchdrungene Figur erhält kumulativ weniger
Schaden. Wände stoppen sämtliche Kaliber; kein Materialdurchschlag. Schussknall,
Migration und übrige Geräusch-/Ausdauerregeln bleiben bestehen. Alle Werte sind
vorläufige Spielbalance, keine reale ballistische Simulation.
