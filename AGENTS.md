# Zusammenarbeit an SPERRKREIS 98

Für Codearbeiten mit der kurzen Modulkarte in `ARCHITECTURE.md` beginnen.
`DESIGN_PLAN.md` nicht routinemäßig vor jeder Aufgabe oder jedem Patch lesen.
Die Datei dokumentiert bestehende Beschlüsse, offene Fragen und spätere Ideen;
sie ist kein Pflichtdurchlauf für technische Arbeiten. Nur bei einer konkreten,
für die aktuelle Änderung relevanten offenen Designfrage den passenden Abschnitt
gezielt heranziehen, sofern Gesprächskontext und kurze Projektregeln nicht genügen.
Eine ausdrückliche Nutzeranweisung, eine Datei nicht zu lesen, hat Vorrang.

Vorgemerkt am 04.10.2026: Später eine sechste Charakterklasse ergänzen. Name,
Rolle und Fähigkeiten sind noch offen; aktuell kein Auftrag zur Implementierung.
Beim nächsten Ausbau der Klassendefinitionen bzw. Klassenschnittstellen aufgreifen.

Vom Nutzer eingebrachte oder aktiv erwogene Ideen bleiben erhalten, bis sie
ausdrücklich gemeinsam verworfen oder nachweislich umgesetzt wurden. Zurückgestellt
heißt nicht verworfen und nicht zur sofortigen Umsetzung freigegeben.

Vor Entscheidungen an betroffenen Systemen passende Ideen erneut ansprechen,
insbesondere wenn die Entscheidung ihre spätere Umsetzung erschwert. Den konkreten
Zusammenhang und die anstehende Entscheidung nennen. Assistentenvorschläge getrennt
von Nutzerentscheidungen führen; keinen Vorschlag stillschweigend zum Beschluss machen.
Zurückgestellte Ideen nicht bei jeder Zusammenfassung erneut aufzählen. Sie nur am
jeweils festgehaltenen Entscheidungspunkt oder auf Nachfrage ausdrücklich ansprechen.

Zuletzt freigegebener Spielstand: v12 und v12.1 sind umgesetzt. Folgepatches richten
sich nach dem jeweils vereinbarten Umfang. Geräuschmechanik und Ausdauer bleiben
nach aktueller Vorgabe unverändert; Exekutionen werden ohne neue Vereinbarung nicht
zu einem neuen Fähigkeitensystem ausgebaut.

Bereits erteilte Aufträge nicht durch zusätzliche Freigaberunden ersetzen.

Maßstab vom 15.10.2026: Player 1,80 m; weiblicher Player 1,68 m. DIN-Türblatt und konkretes Kühlgerät
dienen als Größenanker, keine millimetergenaue Bauteilsimulation. Weibliche und
männliche Zombies haben überlappende Größenbereiche und ID-stabile Körperhöhen.
Der Maßstabsvergleich ist veröffentlicht. Am 15.10.2026 ebenfalls freigegeben:
Echtzeit-3D-Zombies mit Original-Skelettanimationen, weichen Übergängen und einem
gemeinsamen metrischen Tempo-/Schritt-Abgleich für Player und Zombies. Qualität
hat Vorrang; keine künstliche Reduktion auf wenige Animationsbilder. Die
Rennen-Animation bleibt ungenutzt. Vollständiger 3D-Weltport
bleibt zurückgestellt. Späteres Setting umfasst Deutschland, mehrere Städte und
Bundesländer; detaillierte Räume und Etagen bleiben als Ausbauziel erhalten.

Gebäudemaßstab vom 15.10.2026: Baugeometrie ist vom 2-m-Terrainraster getrennt.
Wände, Türrahmen/-stürze und Gebäudegrundrisse folgen dem Figurenmaßstab;
Darstellung, Körperkollision, Wegsuche und Sicht verwenden dieselben Fußabdrücke.
Innenböden haben ein 50-cm-Fugenraster. Realistische Bodentexturen bleiben vorgemerkt.
Nachjustierung: Grundrisse etwas großzügiger, metrische Wand- und Türmaße bleiben.
Getötete Zombies behalten Modellvariante, Größe und Ausrichtung als liegende Körper.
Freigabe vom 16.10.2026: kostenlose Quaternius Ultimate Modular Men/Women und
Ultimate House Interior einbauen. Spieler behalten getrennte Kopf-, Oberkörper-,
Bein- und Fußteile für spätere Kleidungsanpassungen. Türen und Kühlschränke an die
bestehenden Metermaße anpassen; Darstellung und Kollision teilen die Assetmaße.

Freigabe vom 16.10.2026: Kamera näher, Zoom zunächst nur per +/−; keine neuen
Zwei-Finger-Gesten. Echte Schleichanimationen statt berechneter Duckpose. Gebäude
mit dem vorhandenen Möbelpack vollständiger einrichten. Container erst unmittelbar
am tatsächlichen Rand öffnen; Auswahl, Herangehen und Benutzung teilen die Prüfung.
Nutzerziel für später: Zomboid-artig nahezu alles lootbar machen. Passende Icons
und einzelne Ingame-Gegenstandsmodelle werden zeitnah separat organisiert; die
Einrichtung bleibt dafür in einzeln adressierbare Objekte aufgeteilt.

Build und technische Modulauslagerung vom 02.10.2026 sind reine Infrastrukturarbeit.
Die bestehenden Spielregeln bleiben maßgeblich. Nutzerklarstellung vom 15.10.2026:
Tests beginnen mit neuen Spielständen. Abwärtskompatibilität, Übernahme und
Migration alter Spielstände sind keine Anforderung für Folgepatches.

Testzugang vom 17.10.2026: Jede implementierte Waffe muss bei einem neuen
Spielstand in der frei zugänglichen Waffen-Testkiste direkt neben dem Startpunkt
im Unterschlupf liegen, samt allen kompatiblen eingeführten Mods, passenden
Magazinen und Munition. `weapon-test-crate.js` leitet den Inhalt aus `ITEMS` ab;
neue Waffen und Teile dort mit vollständiger Kompatibilität definieren.

AK-Basis vom 17.10.2026: Nutzer-Variante 2 = `AssaultRifle_3`, schaftlos;
7,62×39, Semi/Fullauto, eigener Magazinplatz. Fester Schaft, Duster-Rahmen,
3×-ACOG und Dämpfer sind wechselbare Gegenstände und sichtbare Modellteile.
Der Dämpfer senkt weder Schaden noch Durchschlag. Neue AK-Gewichte folgen
50-g-Schritten; Magazine inklusive Inhalt haben zwei Stufen (30er: 0–14 / 15–30,
Differenz 50 g). Befüllen und Wechseln bleiben getrennte Aktionen. Farbe allein
definiert keine neue Waffe; AWP und Bullpups bleiben ausgeschlossen.

Freigabe vom 20.10.2026: TastyTonys kostenlose Vector ergänzen. `vector_9mm`
nutzt eigene 33er-Wechselmagazine mit der vorhandenen 9-mm-Munition und Semi/Auto.
Schaft, Leuchtpunktvisier, Vordergriff und Dämpfer sind sichtbare, abnehmbare Mods.
Die ursprüngliche Geometrie bleibt in sieben getrennten Modulen; Handauflagen und
Menüanschlüsse sind modellabhängig. CC BY 4.0 erfordert TastyTony-Credit,
Quellen-/Lizenzlink und Änderungshinweis; im Pausenmenü und Asset-README erhalten.

Tragehaltung vom 20.10.2026: Rechten Ellenbogen in der lockeren Haltung weiter
nach vorn nehmen. Dieselbe lockere Waffen-/Armhaltung gilt beim Sprinten, da
dabei nicht geschossen wird; die Original-Beinanimation des Sprints weiter nutzen.
Nutzerpräzisierung: vor Brust/Bauch statt seitlich vom Oberkörper weg.
Weiteres Ellenbogen-Feintuning bleibt zurückgestellt; AK und Vector gefallen.

M4 vom 20.10.2026: Nutzer-Variante 1 = `AssaultRifle2_1` als Grundausführung;
Variante 2 (`AssaultRifle2_2`) als wechselbares komplettes Lauf-/Vorderschaft-Oberteil.
Eine gemeinsame 5,56×45-Sturmgewehrwaffe, eigene 30er-Magazine, Semi/Auto.
Standardlauf und Originalschaft sind ab Werk montierte, abnehmbare Gegenstände;
ohne Laufmodul kein Schuss. Duster-Rahmen und 3×-ACOG sind mit AK gemeinsam
nutzbar; eigener M4-Dämpfer folgt dem gewählten Lauf ohne Schaden-/Durchschlagsabzug.
Variante 4 bleibt ausdrücklich als spätere, modular nutzbare MP vorgemerkt.
Variante 3: kein Schaft, anderes Magazin inklusive Aufnahme; endgültige Einordnung
offen. Assistentenvorschlag: Varianten 3/4 als Konfigurationen derselben MP-Familie
prüfen. Nutzerziel: ausreichend
Sturmgewehrvariationen statt zu vieler MPs. Lauf-/Schaftwechsel allein ergibt
keine neue Waffenart. AWP/Bullpups bleiben ausgeschlossen.

Optische Spieltests übernimmt der Nutzer selbst. Für Waffenpatches technische
Build-/Systemprüfungen ausführen und die veröffentlichte Spielseite bereitstellen;
keine zeitaufwendigen automatisierten Browser-Sichttests ansetzen.

Revolver vom 21.10.2026: R1/R2/R4 aus der Übersicht bilden eine modulare Familie;
R3/R5 ausgeschlossen. Bildnummern sind nicht Dateinummern: R1=`Revolver_4`,
R2=`Revolver_2`, R4=`Revolver_3`. Drei Laufmodule und zwei Griffe; R2/R4 haben
identische Griffe. R4 kombiniert kräftigeres Laufprofil, Schiene und angepasste
Visierung. Nur dieses Modul ermöglicht Rotpunkt/Waffenlampe; beim Laufwechsel
werden davon abhängige Aufsätze ohne Verlust in den Rucksack zurückgegeben.
Nutzer verlangt sechs Schuss, großes starkes Kaliber, starken Rückstoß und keine
Schalldämpfer. Umsetzung als `revolver_44` mit `.44 Magnum` statt altem .38-
Platzhalter; vorläufige Balance: 92 Schaden, 0,9 s Schussabstand, Rückstoß 1,
Erholung 0,7/s, sechs Patronen direkt in die Trommel. R1-Lauf/Kompaktgriff montiert.
Die Waffenlampe ist nach Montage an und im Zubehördialog schaltbar; nur die aktive
Handwaffe leuchtet, Wände/geschlossene Türen blockieren den Kegel. Keine Batterien-
oder zusätzliche Entdeckungsmechanik. Lampe und Rotpunkt haben getrennte Positionen.
Waffenkörper/Lampe Quaternius CC0; Rotpunktgeometrie aus der bereits kreditierten
TastyTony-Vector (CC BY 4.0). Lizenznachweise und Änderungshinweise erhalten.

Haltungskorrektur vom 21.10.2026: Entspanntes Tragen im Stand, beim normalen
Gehen/Schleichen automatisch anlegen und beim Sprint wieder absenken. Die Lampe
folgt ihrer tatsächlichen Linse und der vollständigen Waffenausrichtung inklusive
Neigung; abgesenkte Waffen leuchten entsprechend auf den nahen Boden. Revolver-
Tragearm aus der neutralen Originalpose, Reload ohne verdrehte Unterarme oder
Handgelenke; Magnum-Rückstoß als deutlich sichtbarer, kurz gehaltener Hochschlag.

Revolver-Schleichstillstand vom 22.10.2026: einhändige Tragehaltung vor dem
Oberkörper, ähnlich der abgesenkten Langwaffenhaltung; der Lauf zeigt nach vorn
unten. Die neutrale stehende Armstellung wird beim Ducken nicht unverändert
übernommen. Linke Hand frei; Anlegen bei Bewegung/aktivem Zielen bleibt erhalten.

Beauftragte Patches bis zum überprüften Abschluss führen. Fortschrittsmeldungen
beenden die Arbeit nicht. Bei beauftragter Veröffentlichung gehören Commit,
Zusammenführung, erfolgreiches Deployment und Prüfung des normalen Spieleinstiegs
zum Abschluss. Abschließend Änderungen, Prüfergebnis und Live-Link nennen;
bei einem tatsächlichen Hindernis den konkreten Blocker und offenen Schritt nennen.

Kleidung vom 21.10.2026: Neue Überlebende starten ausschließlich in Unterwäsche,
barfuß und ohne Rucksack. Die bisherigen Startkleider sind einzelne auffindbare
Gegenstände inklusive Schuhe und Kopfbedeckungen; Gesicht/Haare bleiben unabhängig.
Leere Slots zeigen den Grundkörper. Kleiderloot auch in Kommode/Waschmaschine.

Kleidungsicons vom 22.10.2026: Aus den jeweiligen Original-Modellteilen rendern,
mit passenden Materialfarben und ohne sichtbare Haut-/Körperteile. Inventar,
Behälter und Ausrüstung verwenden dieselben Modellzuordnungen. Die ehemalige
„Arbeitsjacke“/„Jacke“ (`work_jacket`) heißt korrekt „Warnweste“; Item-ID erhalten.

Platzhalterbereinigung vom 22.10.2026: Nur Waffen und Ausrüstung bereinigen;
Nahrung, Medizin, Werkzeuge und Missions-/Schlüsselgegenstände bleiben erhalten.
Keine einfachen Ersatzgeometrien oder unpassenden Kleidungsmodelle mehr anbieten.
Alte Flinte/Jagdgewehr, primitive Nahkampfwaffen, nur dazu passende Munition/Mods
und generische Kleidungsduplikate sind entfernt. Die Original-Pistole aus dem
SWAT-Modell und das Originalmesser bleiben; die Pistole hat keine modelllosen Mods.
Bereits platzierte Leichen (Polizist, Apothekerin, Zivilperson) verwenden passende modulare
Charaktere in der Original-Todespose, mit Bodenkontakt und Modell-Antippmaßen.
Getötete Infizierte behalten weiterhin ihre eigenen Zombie-Modelle.

Pistolen-/Hülsenpatch vom 22.10.2026: G17, USP, SIG Emperor Scorpion und Desert Eagle
von TastyTony. Walther Q5 ausgeschlossen. G17/USP 9 mm, SIG .45 ACP, Desert Eagle
.50 AE als vorläufige Spielprofile. Die Desert Eagle bleibt ohne Aufsätze.
Die übrigen Pistolen erlauben Lampen/Dämpfer und Rotpunkt auf eigener Montage.
Mechanische Schussanimation, letzter Schuss offen, echte kaliberbezogene Hülsen
mit Weltflug, Bodenkontakt, gedämpftem Nachspringen, leisem materialabhängigem
Klang und kleinen lokalen Geräuschkreisen sind beauftragt. Kein Möbel-/Wandkontakt
der Hülsen; gedeckelte Anzahl und Lebensdauer für iPhone. Revolver behält Hülsen
bis zum Entladen. Gemeinsamer Körperdurchschuss für alle Kaliber, kumulativer
Schadensverlust; Materialdurchschlag bleibt später. Originale behalten und kreditieren.

Pistolenhaltung vom 22.10.2026: G17/USP/SIG/Desert Eagle erhalten eigene,
modellbezogene Handkontakte und eine vom Figurenmaßstab unabhängige Größe.
Angelegt: weitgehend gestreckter Waffenarm, begrenzte Handgelenk-/Unterarmdrehung,
Schulter-/Brustkorbanpassung und Auge auf der Visierlinie. Haltungswechsel,
Schleichstillstand, Rückstoß und Magazinwechsel einschließlich Abbruch auf beiden
Rigs prüfen. Keine Änderung der bereits abgestimmten Revolver-/Langwaffenhaltungen.

Pistolenübergänge vom 22.10.2026: Handbahnen vor dem Brustkorb und erreichbare
Armziele verwenden; keine gespeicherten langen Gelenkdrehwege. Direkte Wechsel
aus dem Anlegen, Schleich-/Sprintwechsel und schnelle Unterbrechungen auf beiden
Rigs auf Armkreis, Ellenbogenhöhe, Hautverdrehung und erneuten Griffkontakt prüfen.
Unterwäschekörper: gefaltete Kleidersäume am Bauch geometrisch ersetzen und den
BH mit einem geschlossenen Stoffband einschließlich Seiten unter den Armen ergänzen.

## Effizient entwickeln

- Modell, Denkstufe und Geschwindigkeit nach der aktuellen Nutzerwahl verwenden.
- Pro Patch einen zusammenhängenden Schwerpunkt mit überprüfbarem Ergebnis wählen.
- Zuerst die zuständigen Module und direkten Aufrufer bestimmen. Mit `rg` und
  Ausschnitten arbeiten; Dateien nur vollständig lesen, wenn es die Aufgabe erfordert.
- Bereits geprüfte, unveränderte Inhalte nicht erneut abrufen. Werkzeugausgaben auf
  relevante Treffer, Änderungen und Fehler begrenzen.
- Modulgrenzen nach Zuständigkeit ziehen. Beim nächsten passenden Feature höchstens
  den betroffenen zusammenhängenden Bereich aus einer großen Datei herauslösen;
  keine vollständige Neuarchitektur allein zur Kontingentreduktion.
- Refactoring und neue Spielregeln getrennt nachvollziehbar halten. Verhalten,
  Spielstände und Touchbedienung bei einer reinen Auslagerung erhalten.
- Gezielt betroffene Regeln prüfen. Die vorhandenen kurzen Systemtests vor einem
  Spielrelease einmal ausführen; zusätzliche Browserprüfungen nur für konkrete
  Integrations- oder Darstellungsrisiken. Nach ausreichender Prüfung abschließen.
- Diese Modulkarte bei Änderungen an Zuständigkeiten kurz aktualisieren. Das
  Designarchiv nicht als wiederholte vollständige Zusammenfassung kopieren.
- Quellen bearbeiten: `docs/src/`, `docs/style.css`, `web/index.html` und
  `web/service-worker.js`. `docs/index.html`, `docs/sw.js` und `docs/build/` werden
  durch `npm run build` erzeugt; keine Versionszusätze in Modulimports einführen.
- Vor Spielreleases `npm run build`, `npm test` und `npm run build:check` ausführen.
  Nur geänderte Quellen und daraus erzeugte Ausgaben committen. Neue Module oder
  Assets benötigen keine manuell gepflegte Cacheliste.
