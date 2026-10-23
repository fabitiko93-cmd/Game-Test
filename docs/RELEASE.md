# Veröffentlichen ohne unbestimmte Warteschleifen

Der bestehende Pages-Pfad bleibt `main` → `/docs`. Nach dem Merge veröffentlicht
GitHub Pages selbstständig. Die Spielregeln und der Build bleiben unverändert.

Der Workflow `Verify game` hat zwei getrennte Zuständigkeiten:

1. `verify` prüft Syntax, Systemtests und den reproduzierbaren Build.
2. `Confirm live release` läuft nur nach erfolgreichem `verify` auf `main`.
   Er beobachtet den Pages-Lauf desselben vollständigen Merge-Commits und
   vergleicht anschließend den normalen Spieleinstieg, das Manifest, den Worker,
   das Einstiegsskript und das Stylesheet bytegenau mit der geprüften Ausgabe.

Ein grüner Pull Request bedeutet „zusammenführbar“. Erst ein grüner vollständiger
Main-Workflow einschließlich `Confirm live release` bedeutet „veröffentlicht und
live geprüft“. Pages veröffentlicht weiterhin unabhängig vom Main-Prüfjob;
deshalb nur erfolgreich geprüfte PR-Stände zusammenführen. Dies ist keine
Umstellung der Hostingquelle auf einen eigenen Actions-Deployment-Workflow.

## Status gezielt abfragen

Im passenden Checkout mit der vollständigen **Merge-Commit-ID**:

```sh
npm run release:status -- --repo fabitiko93-cmd/Game-Test --commit MERGE_SHA
```

Standardmäßig erfolgt genau eine Abfrage. Exit-Code 0 = live bestätigt,
2 = noch ausstehend, 1 = Fehler. Ein ausstehender Zustand ist keine Aufforderung,
Build, Tests, Upload oder Merge erneut auszuführen.

Für begrenztes Warten mit gespeichertem Zwischenstand:

```sh
npm run release:status -- --repo fabitiko93-cmd/Game-Test --commit MERGE_SHA --wait --timeout 600 --state /tmp/sperrkreis-release-MERGE_SHA.json
```

Bei sitzungsübergreifender Arbeit einen Pfad im Arbeitsverzeichnis statt `/tmp`
verwenden. Die JSON-Datei enthält Commit, Build, Phase, Run-IDs und Fehlergrund.
Sie wird atomar ersetzt. Dieselbe Datei darf nicht für andere Commits, Builds
oder Seiten verwendet werden. Ein erneuter Aufruf prüft den aktuellen Status;
er verändert GitHub nicht und wiederholt keine Veröffentlichung.

Alle HTTP-Aufrufe haben zehn Sekunden Zeitlimit. Warten endet nach spätestens
zehn Minuten zuzüglich höchstens eines laufenden Abfragezyklus. Drei aufeinander-
folgende Abfragefehler brechen ab. Fehlgeschlagene/verhinderte GitHub-Jobs werden
sofort als Fehler gemeldet. Der CI-Job besitzt zusätzlich zwölf Minuten Zeitlimit.
GitHub hält den letzten JSON-Zwischenstand sieben Tage als Workflow-Artefakt vor.

## Für Agenten und Connector-Abfragen

- PR-Head und Merge-Commit sind unterschiedliche IDs. Nach dem Merge dessen
  tatsächliche ID speichern und ausschließlich diese für die Veröffentlichung
  verwenden.
- Workflow-Läufe über `/repos/OWNER/REPO/actions/runs?head_sha=MERGE_SHA` lesen.
  Der Connector `fetch_commit_workflow_runs` filtert auf PR-Ereignisse und ist für
  Main-/Pages-Läufe ungeeignet. Eine leere Antwort bedeutet nicht „weiter warten“.
- Push-Prüfung (`.github/workflows/verify.yml`) und dynamischen Pages-Lauf
  (`dynamic/pages/pages-build-deployment`) anhand Commit, Ereignis und Run-ID
  unterscheiden. Nur die aktuelle Ausführung eines Laufs zählt.
- Der Beobachter prüft den abgeschlossenen **Job `verify`**, nicht den gesamten
  Workflow: Sonst würde `Confirm live release` auf seinen eigenen Abschluss warten.
- Nach erfolgreicher Veröffentlichung und Live-Prüfung abschließen. Bei einem
  Fehler Phase, konkrete Run-ID und offenen Schritt nennen; keine unbeschränkte
  Statusschleife, keine erneute vollständige Testreihe ohne neue Ursache.
