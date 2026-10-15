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

Maßstab vom 15.10.2026: Player 1,80 m; weiblicher Player 1,68 m für später
vorgemerkt, jetzt kein neues Player-Modell. DIN-Türblatt und konkretes Kühlgerät
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
Ein echtes Player-Modell ist als nächster separater Schritt vom Nutzer angekündigt;
hier noch keine Modellwahl oder Implementierung vorwegnehmen.

Build und technische Modulauslagerung vom 02.10.2026 sind reine Infrastrukturarbeit.
Die bestehenden Spielregeln bleiben maßgeblich. Nutzerklarstellung vom 15.10.2026:
Tests beginnen mit neuen Spielständen. Abwärtskompatibilität, Übernahme und
Migration alter Spielstände sind keine Anforderung für Folgepatches.

Beauftragte Patches bis zum überprüften Abschluss führen. Fortschrittsmeldungen
beenden die Arbeit nicht. Bei beauftragter Veröffentlichung gehören Commit,
Zusammenführung, erfolgreiches Deployment und Prüfung des normalen Spieleinstiegs
zum Abschluss. Abschließend Änderungen, Prüfergebnis und Live-Link nennen;
bei einem tatsächlichen Hindernis den konkreten Blocker und offenen Schritt nennen.

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
