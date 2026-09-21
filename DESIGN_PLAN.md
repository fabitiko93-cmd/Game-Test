# SPERRKREIS 98 – Patchplanung und Ideenregister

Stand: 21.09.2026. Grundlage: Abstimmung mit Fabian im Projektchat.
Geprüfter Code: `85ed3324ed78123aa5969443b76fefe24f97d1de`.
Dieses Dokument beschreibt geplante Änderungen, nicht einen bereits veröffentlichten Patch.

## Arbeitsweise und Status

- Nutzerideen bleiben erhalten, solange sie nicht ausdrücklich gemeinsam verworfen wurden.
- Vor jedem betroffenen Systementwurf die Wiedervorlagen unten prüfen. Eine Idee vor
  einer Festlegung ansprechen, die ihre spätere Integration wesentlich verteuert.
- Die Wiedervorlage ist ein Gespräch über die anstehende Entscheidung, kein automatischer
  Auftrag, das zukünftige Feature jetzt einzubauen.
- Status unterscheiden: beschlossen, Nutzeridee für später, Assistentenvorschlag,
  offen, umgesetzt oder ausdrücklich verworfen/ersetzt. Den Anlass einer Statusänderung festhalten.
- Aktuelle Phase: Patchnotes abstimmen; noch keine Umsetzung des Spielpatches.
- Bezug ist ausschließlich das bestehende iPhone-Browsergame. Vor dem Neustart verworfene
  Repo-Prototypen und das separate Godot-/Bodycam-Projekt sind keine Anforderungen hierfür.

## Feste Grenzen dieses Patches

1. Keine neue Geräuschmechanik. Bestehende Geräuschquellen, Auslöser, Stärke, Reichweite
   und Frequenz sowie bestehende Modifikatoren unverändert lassen. Keine neuen Geräusche
   für Looten, Türen, Versorgung, Nachladen oder andere Aktionen hinzufügen.
2. Bestehende Geräuschverarbeitung als Grundlage erhalten; keine neue Ausbreitung,
   Dämpfung oder Hörbalance als Nebenprojekt einführen. Die neue Sicht-/Deckungssuche
   muss mit den vorhandenen Geräuschereignissen zusammenarbeiten.
3. Ausdauermechanik und Ausdauerbalance unverändert lassen.
4. Bestehende Exekution von hinten erhalten. Jetzt kein neues Exekutions-Skillset,
   keine frontalen oder über Deckung ausgeführten Varianten und keine große Neubalance.
   Nur notwendige Verträglichkeit mit der vereinbarten Hide-Umstellung berücksichtigen.
5. Bestehendes Spiel modular erweitern, nicht neu schreiben. Bestehende Klicksteuerung
   beibehalten: Tippen geht, Doppeltippen auf Boden sprintet, Halten lenkt im Gehtempo,
   zwei Finger bewegen die Kamera.

## Vereinbarte Richtung: Ducken, Hide und Zombie-Wissen

### Bedienung und Schutz

- Alle Figuren haben den Schleichen-/Ducken-Button.
- Ducken in nutzbarer Deckung beziehungsweise geducktes Betreten nutzbarer Deckung
  wirkt unmittelbar. Keine Kanalisierung, kein zusätzlicher Hide-Tastendruck, kein Chatbefehl.
- Geduckte Bewegung im geeigneten Deckungsbereich ist möglich. Das bisherige begrenzte
  Budget versteckter Schritte soll entfallen.
- Normale Figuren benötigen Deckung für Hide. Die besondere Fähigkeit im offenen Gelände
  ist davon getrennt und nur für Figuren mit dem entsprechenden Perk vorgesehen.
- Wirksame Deckung beendet die aktuelle Beobachtung. Eine bloße Überschneidung mit dem
  geometrischen Sichtkegel darf keine laufenden Positionsupdates durch die Deckung liefern.
- Nahe, uninformierte Zombies sollen einen gedeckten Player nicht allein aufgrund ihres
  Sichtkegels automatisch aufdecken. Gezielte Nahsuche bleibt eine Entdeckungsmöglichkeit.

### Kontaminierte Deckung: feste Erinnerung statt beweglichem Spielerziel

- Wissen wird pro Zombie geführt; kein gemeinsames Wissen aller Zombies.
- Bei bestätigter direkter Sicht kann das Ziel an der Figur hängen.
- Beim beobachteten Verschwinden in Deckung wird die letzte sichtbare Position festgehalten:
  die vom Nutzer beschriebene unbewegliche Silhouette.
- Die gesamte betroffene Deckung wird für diesen Zombie zum bekannten Suchbereich.
  Kontaminiert bedeutet: Hier sucht er. Es bedeutet nicht, dass er deine aktuelle Position kennt.
- Er untersucht zuerst den letzten Sichtpunkt, anschließend den zugehörigen Deckungsbereich.
- Verdeckte Bewegung der Figur verändert weder den gespeicherten Sichtpunkt noch heimlich
  das Navigationsziel. Der Zombie muss die Figur tatsächlich wiederfinden.
- Die einfachen Zombies weiten die Suche nicht aus eigener Schlussfolgerung auf benachbarte
  Deckungen aus. Neue tatsächlich wahrgenommene Hinweise können ein neues Suchziel liefern.
- Die Untersuchungszeit beginnt erst mit dem Eintritt des Zombies in den betroffenen
  Deckungs-/Suchbereich. Sein Anmarsch verbraucht diese Zeit nicht.

### Wechsel zwischen Deckungen

- Entscheidend ist die Abschirmung während des Wechsels aus Sicht des jeweiligen Zombies,
  nicht allein der Objekttyp Baum/Busch/Mauer oder eine neue Objekt-ID.
- Durchgehend gedeckter, geduckter Wechsel von bekannter Deckung A zu unbekannter Deckung B
  ermöglicht Hide in B; die Suche bleibt an A gebunden.
- Zusammenstehende Büsche können solche Übergänge bieten. Sichtbare Lücken zwischen
  auseinanderstehenden Deckungen erlauben die Wahrnehmung des Wechsels.
- Bei einem kurz sichtbar werdenden geduckten Wechsel ist eine Erkennungsfrist vorgesehen.
  0,6 Sekunden waren ein Assistentenvorschlag als Testwert, keine endgültige Balanceentscheidung.
- Aufrechter beobachteter Wechsel macht die neue Ankunftsdeckung sofort bekannt.
- Sichtbares Sprinten führt unmittelbar zur Verfolgung der Figur. Nach tatsächlichem
  Sichtverlust bleibt der letzte wahrgenommene Ort beziehungsweise die bekannte Deckung.
- Genaues Verhalten der Erkennungsfrist bei mehreren sehr kurzen Sichtunterbrechungen ist
  noch zu definieren. Kein pauschaler Erkennungsreset durch jeden kleinen ID-Wechsel.

### Suchende und Naherkennung: Auftrag und noch offene Kalibrierung

- Nutzerauftrag: zuerst etablierte Mechaniken einfacher Zombies als Testgrundlage verwenden;
  keine unnötig ausgefeilte neue Suchintelligenz erfinden.
- Bei der Untersuchung beginnt der Timer am Eintritt in die Deckung. Der Suchbereich bleibt
  die konkrete kontaminierte Deckung. Benachbarte Deckungen gehören nicht zur Suchausweitung.
- Gezielte Naherkennung soll durch tatsächliche Wahrnehmung beim Absuchen möglich sein;
  keine Entdeckung durch eine dazwischenliegende undurchsichtige Wand.
- Konkrete Dauer und Nähegrenze sind noch nicht als Referenzwerte abgesichert. Vor Umsetzung
  begründete Startwerte wählen und als Spieltestwerte kennzeichnen; nicht als Branchenstandard ausgeben.
- Ebenfalls noch festzulegen: Ende der Kontamination nach erfolgloser Suche und Umgang mit
  einem tatsächlich unerreichbaren Suchbereich. Hieraus keine Suche in beliebigen Nachbarbereichen ableiten.

### Geprüfter Iststand – kein Beschluss für neue Balance

- `ai.js`: Nach Sichtverlust Wechsel in `search` mit 6,5 Sekunden, nach `investigate`
  mit 5,5 Sekunden. `stateTimer` läuft derzeit bereits während der Annäherung herunter.
- `perception.js`: `nearRadius` beträgt 0,68 Welteinheiten. Der Nahbereich verändert
  Sichtwinkel/Exposition; das ist kein eigenständiger garantierter Hide-Entdeckungsradius.
- `ai.js`: Schon kleine positive Exposition erhöht die Wahrnehmung mit einer festen
  Grundrate und aktualisiert `lastSeen` auf die Spielerposition. Das muss bei wirksamer
  Deckung mit der vereinbarten festen Erinnerung vereinbar werden.
- Diese Zahlen sind belegte Werte unseres Codes. Sie sind weder als bewährte Fremdspielwerte
  belegt noch durch den Nutzer als endgültige neue Parameter festgelegt.
- Abgleich am 21.09.2026: Die offizielle [PZwiki-Dokumentation zu Zombie Lore](https://pzwiki.net/wiki/Custom_Sandbox#Zombie_Lore)
  beschreibt unterschiedliche Gedächtnis- und Sichtstufen, belegt dort jedoch keine feste
  Sekunden-/Nahdistanzkombination für unser Deckungsmodell. Die eingesehene Seite bezieht
  sich auf Build 41.78.16. Daraus keine exakten aktuellen Zomboid-Werte ableiten.

## Weitere vorgemerkte Patchbereiche

| Bereich | Stand und Grenze |
| --- | --- |
| Openfield-Stealth | Nutzerentscheidung: eigener Button nur mit Perk, zunächst Einbrecher; bewusste Aktivierung, keine Kanalisierung. Normales Deckungshide unabhängig vom Cooldown. Dauer, Bewegung und Einsatz unter Beobachtung noch abzustimmen. |
| Testwerte des Perks | 8 Sekunden Dauer waren ein Assistentenvorschlag. 25 Sekunden Cooldown sind für den Nutzer höchstens ein Mechanik-Testwert, keine akzeptierte endgültige Balance. |
| HUD | Tarnung/Deckung/Geräusch und akute Verletzungen unmittelbar lesbar; Bedürfnisse und Missionen in Menüs. Aktuelle Verdeckung und bekannte/durchsuchte Deckung müssen unterscheidbar sein. |
| Fahrzeuge | Klar erkennbare stehende, lootbare Fahrzeuge. Grafik, Kollision und Deckung sollen zusammenpassen. Keine Fahrmechanik im Autofix. |
| Behälter | Unplausible frei aufgestellte Spinde und andere Außenbehälter prüfen; nur tatsächlich problematische Platzierungen durch passende Lootquellen ersetzen. |
| Exekution aktuell | Vorhandene Exekution von hinten erhalten und die Verträglichkeit mit neuem Hide prüfen. Vorherige größere Umbauvorschläge sind durch die aktuelle Beschränkung zurückgestellt. |
| Leistung | Erweiterungen an Wahrnehmung/Deckung müssen auf iPhone tragfähig bleiben; keine unabhängig vom aktuellen Problem erfundenen Optimierungsprojekte. |

## Ideenregister und Wiedervorlage

Die folgenden Wiedervorlagen werden vor der jeweils betroffenen Entscheidung aktiv angesprochen.
Zurückgestellt ist kein vergebener Implementierungsauftrag.

| ID | Idee und Herkunft | Status | Wieder ansprechen, bevor … |
| --- | --- | --- | --- |
| I-01 | Exekutionen als Skillset mit verschiedenen Fähigkeiten; Nutzer, 21.09.2026 | Für später ausdrücklich erhalten | … Fähigkeiten/Perks und Exekutionsvoraussetzungen dauerhaft festgelegt werden. |
| I-02 | Exekution von vorne aus Deckung; Nutzer, 21.09.2026 | Für später ausdrücklich erhalten | … jede Exekution pauschal an eine Rückenposition gebunden oder Interaktionsausrichtung vereinheitlicht wird. |
| I-03 | Exekution über Deckungen/Hindernisse; Nutzer, 21.09.2026 | Für später ausdrücklich erhalten | … Deckungsformen, Reichweiten, Höhen und die Trennung zwischen Bewegungskollision und Aktionsreichweite festgelegt werden. Bereits bei diesem Deckungspatch als spätere Anforderung beachten, ohne die Fähigkeit zu bauen. |
| I-04 | Geruch/Körpergeruch und Hygiene als spätere Wahrnehmungseinflüsse; Nutzer im Stealthgespräch | Nutzeridee für später | … Wahrnehmung nur noch Sicht/Geräusch zulässt oder Status-/Versorgungssysteme erweitert werden. Keine Geruchsmechanik in diesem Patch. |
| I-05 | Erkältung als späterer Einfluss auf Tarnung/Wahrnehmung; Nutzer im Stealthgespräch | Nutzeridee für später; genaue Wirkung offen | … Krankheitszustände, deren Handlungen oder Geräuschereignisse erweitert werden. Jetzt keine neue Husten-/Geräuschmechanik. |
| I-06 | Größeres, umfangreicheres Spiel auf modularer Basis; Nutzer | Langfristiges Ziel | … Kartenformat, Weltpersistenz, räumliche Abfragen und Wegfindung enger festgelegt werden. Kein ungefragter Kartenneubau im aktuellen Patch. |
| I-07 | Organische Karte mit Umwegen/Fluchtmöglichkeiten und lootbaren, nicht fahrbereiten Autos statt Gebäude gleichmäßig zu verkleinern; Nutzer | Teilweise im vorhandenen Stand angelegt, Wirkung weiter zu prüfen | … neue Gebäude, Engstellen, Deckungsketten oder zusätzliche Lootquellen platziert werden. |
| I-08 | Crafting und Barrikadenbau; früher als spätere Ausbaustufe vom Assistenten genannt | Assistentenvorschlag, keine bestätigte Nutzerentscheidung | … Interaktionen, Itemrezepte oder veränderbare Weltobjekte erweitert werden; dann erst Interesse und Umfang klären. |
| I-09 | Fahrbare Fahrzeuge; frühere allgemeine spätere Fahrzeugperspektive | Keine belegte Nutzerentscheidung für Fahrbarkeit; aktueller Wunsch sind nicht fahrbereite Lootfahrzeuge | … Fahrzeugdaten irreversibel auf reine Behälter zugeschnitten werden; Option kurz ansprechen, nicht als beschlossenen Ausbau behandeln. |

### Wiedervorlage, die schon die anstehende Planung betrifft

Exekutionen über Hindernisse und von vorne sind jetzt als künftiger Bedarf relevant:
Eine Deckung kann die Bewegung oder Sicht blockieren und später trotzdem eine besondere
Aktion über das Hindernis erlauben. Die aktuelle Deckungsdefinition sollte solche
verschiedenen Prüfungen nicht untrennbar miteinander verbinden. Ebenso darf die bestehende
Rückenanforderung eine Regel der heutigen Exekution bleiben, ohne jede zukünftige Fähigkeit
auf diese Bedingung festzulegen. Das ist eine Entwurfsanforderung, kein Auftrag, vorsorglich
ein umfangreiches Skill- oder Animationssystem einzubauen.

## Vorhandene Anliegen im Blick behalten

Die folgenden Punkte sind keine neue Implementierungsliste. Sie verhindern, dass frühere
Wünsche bei Erweiterungen verloren gehen; Dokumentationsbehauptungen ersetzen keinen Spieltest.

| Anliegen | Dokumentierter/geprüfter Stand | Wiedervorlage |
| --- | --- | --- |
| Singleplayer-Sandbox, Charaktererstellung, Waffenmods und Schusswaffen | In der bestehenden Projektbasis beschrieben | Vor Änderungen an Fortschritt, Kampf oder Weltablauf. |
| Permanente Welt nach Charaktertod, Autosave | Bestehende Basis laut README | Vor Änderungen am Saveformat oder an Karte/Objekt-IDs. |
| Klicksteuerung, Doppeltippen zum Sprinten, Kamerabewegung | In der bestehenden Basis beschrieben | Bei jeder HUD-, Touch- oder Interaktionsänderung. |
| Vollbild-/Homescreen-Nutzung und versehentlicher Doppeltipp-Zoom | Früherer Nutzerwunsch; iPhone-Abnahme hier nicht erneut erfolgt | Vor Änderungen an Touchgesten, Viewport oder App-Installation. |
| Nutzbare Türen, Gegenstände, Ausrüstung und Werkzeughinweise | In der Basis beschrieben; frühere Probleme | Bei Änderungen an Aktionspriorität, Auswahl oder Inventar. |
| Verständliche Versorgung, kein Spielerflackern und kein globales Kampfwackeln | Frühere Anliegen; README nennt lokale Trefferreaktionen | Bei Änderungen an Wunden, Statusanzeigen oder Kampfdarstellung. |
| Nachvollziehbare Schwierigkeit und keine Zombies in Wänden | Frühere Nutzerprobleme | Vor Änderungen an Hindernissen, Spawnpunkten oder Wegfindung. |

## Ausdrücklich ersetzte oder begrenzte Vorschläge

- Hide durch Chatbefehl oder zusätzlichen Aktionsknopf: ersetzt durch Ducken plus Deckung.
- Kanalisierung oder künstliche Wartezeit beim Verstecken: vom Nutzer verworfen.
- Verstecktes Schrittbudget innerhalb geeigneter Deckung: soll durch räumliche Deckung ersetzt werden.
- Sofort sichere Tarnung allein durch jede Sichtunterbrechung/neue Deckungs-ID: ersetzt
  durch die feste Erinnerung und Kontamination der beobachteten Deckung pro Zombie.
- Neue Geräuschregeln für weitere Handlungen: aktuell ausdrücklich ausgeschlossen.
- Großes Exekutions-Skillset im aktuellen Patch: ausdrücklich auf später verschoben, nicht verworfen.
- 25 Sekunden Cooldown als endgültige Feld-Hide-Balance: vom Nutzer nicht akzeptiert;
  lediglich als möglicher Testwert einordnen.
- 1,5 Sekunden pauschaler Hide-Nachlauf nach Verlassen einer Deckung war nur ein früherer
  Assistentenvorschlag. Nicht als beschlossen behandeln; Verhältnis zur später vorgeschlagenen
  Erkennungsfrist ungeklärt.

## Beispiele für die spätere Prüfung des vereinbarten Verhaltens

- Beobachtetes Ducken hinter einem Auto: feste letzte Position, gesamtes Auto als Suche;
  verdeckte Bewegung verändert das Ziel nicht.
- Suchzeit bleibt auf dem Anmarsch unberührt und beginnt beim Eintritt in den Bereich.
- Unbeobachteter Wechsel in durchgehender Deckung: Zombie bleibt beim alten Suchbereich.
- Sichtbarer Wechsel: Haltung und Erkennungsfrist bestimmen die Reaktion; keine dauernde
  Erneuerung des Wissens hinter wirksamer Deckung.
- Erfolglose Suche breitet sich nicht automatisch auf die benachbarte Deckung aus.
- Zwei Zombies können unterschiedliche bekannte Suchbereiche haben.
- Suchender Zombie kann bei tatsächlichem nahen Wiederfinden aufdecken; reine Nähe
  hinter einer undurchsichtigen Wand liefert keine Sicht.
- Bestehende Geräuschereignisse und Ausdauerwerte bleiben erhalten.
- Bestehende Exekution von hinten funktioniert mit der neuen Hide-Grundlage;
  neue Exekutionsvarianten gehören nicht zu dieser Abnahme.

## Änderungsnotiz 21.09.2026

Letzte Nutzervorgaben aufgenommen: keine Geräuschänderungen; Untersuchungszeit erst beim
Eintritt in den Deckungsbereich; etablierte Such-/Naherkennungsmechaniken zunächst testen;
offene Nutzerideen mit frühzeitiger Wiedervorlage erhalten; Exekutions-Skillset einschließlich
Frontal- und Über-Deckung-Varianten ausdrücklich für später vormerken.
