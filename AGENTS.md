# Zusammenarbeit an SPERRKREIS 98

Für Codearbeiten mit der kurzen Modulkarte in `ARCHITECTURE.md` beginnen. Vor
Entscheidungen über Spielregeln die betroffenen Abschnitte in `DESIGN_PLAN.md`
gezielt lesen; dort stehen Beschlüsse, offene Fragen und zurückgestellte Ideen.
Eine ausdrückliche Nutzeranweisung, eine Datei nicht zu lesen, hat Vorrang.

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
