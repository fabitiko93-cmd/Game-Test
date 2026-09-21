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
- Nutzerpräzisierung: zurückgestellte Ideen nicht ständig aufzählen. Die explizite
  Ansprache erfolgt am vermerkten Entscheidungspunkt oder auf Nachfrage.
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
6. Bestehende Verfolgungs- und Suchzeiten sowie die allgemeine Verfolgungslogik beibehalten.
   Nutzerentscheidung nach dem UO-Abgleich: keine neue globale Verfolgungsobergrenze,
   keine Übernahme fremder Zeitwerte und keine vorsorgliche Neubalance. Erst konkrete
   Auffälligkeiten in seinen Spieltests sind Anlass für Anpassungen. Die vereinbarte
   deckungsbezogene Suche einschließlich Timerbeginn beim Eintritt bleibt Patchumfang.

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
  Nutzerziel: ein aufmerksamer, aber einfacher/dummer Zombie. Aktueller Assistentenvorschlag
  als Testwert: 1,0 Sekunde tatsächliche Sicht beim geduckten Wechsel; ersetzt den früheren
  Vorschlag von 0,6 Sekunden, noch keine ausdrücklich bestätigte Nutzerentscheidung.
  Nur tatsächliche Sicht zählt; Zeit hinter wirksamer Deckung zählt nicht weiter.
  Erreicht die Beobachtung die Frist, kann der Zombie den Wechsel erkennen und die neue
  Deckung als Suchbereich übernehmen. Ohne erneute Sicht keine Verfolgung versteckter Koordinaten.
- Aufrechter beobachteter Wechsel macht die neue Ankunftsdeckung sofort bekannt.
- Sichtbares Sprinten führt unmittelbar zur Verfolgung der Figur. Nach tatsächlichem
  Sichtverlust bleibt der letzte wahrgenommene Ort beziehungsweise die bekannte Deckung.
- Genaues Verhalten der Erkennungsfrist bei mehreren sehr kurzen Sichtunterbrechungen ist
  noch zu definieren. Kein pauschaler Erkennungsreset durch jeden kleinen ID-Wechsel.
- Die Frist gilt für den beobachtbaren geduckten Deckungswechsel ohne aktives Openfield-Hide.
  Sie verkürzt weder die zugesagte Perk-Dauer noch verändert sie allgemeine Chase-/Suchzeiten.

### Referenzprüfung zur Erkennungsfrist

- Die Projekt-Dokumentation von [The Dark Mod: Visual scan](https://wiki.thedarkmod.com/index.php?title=Visual_scan)
  beschreibt eine von Helligkeit, Entfernung und visueller Wahrnehmungsfähigkeit abhängige
  Wahrscheinlichkeit. Ihr Bezug auf ein halbes Sekundenintervall ist eine
  Wahrscheinlichkeitsnormalisierung, keine garantierte Erkennungsfrist von 0,5 Sekunden.
- [The Dark Mod: AI stats](https://wiki.thedarkmod.com/index.php?title=AI_stats) beschreibt
  gestufte Aufmerksamkeit und Grace-Zeiten. Die dort angegebenen 2–3 Sekunden dürfen nicht
  als direkte Frist für einen sichtbaren Deckungswechsel übernommen werden: der geprüfte
  [AI-Quellcode](https://svn.thedarkmod.com/publicsvn/darkmod_src/trunk/game/ai/AI.cpp) nimmt
  Spieler-Sichterkennung von dieser Grace-Prüfung aus (`m_AlertGraceTime && !AI_VISALERT`).
- Schluss für unser Design: verzögerte Erkennung ist als Referenzprinzip nachvollziehbar;
  1,0 Sekunde ist unser vorgeschlagener, transparenter Spieltestwert für kurze geduckte
  Übergänge auf dem iPhone, kein belegter übernommener Standard anderer Stealth-Spiele.

### Openfield-Stealth: festgelegte erste Perk-Version

- Eigener Button nur bei vorhandenem Perk, zunächst beim Einbrecher. Aktivierung bewusst
  per Button; keine automatische Verwendung beim Verlassen der Deckung.
- Nutzerentscheidung: sofortiger Hide für vorerst 10 Sekunden, ohne Kanalisierung.
- Nutzerentscheidung: Cooldown vorerst 30 Sekunden; ersetzt die früheren Vorschläge von
  8 Sekunden Dauer und 25 Sekunden Cooldown.
- Nutzerentscheidung: zunächst nur geduckt nutzbar. Geduckte Bewegung ist möglich;
  aufrechtes Gehen und Sprinten sind durch diese erste Perk-Stufe nicht abgedeckt.
- Nutzerentscheidung: im aktiven Kampf nicht aktivierbar. Diese Beschränkung betrifft
  den Openfield-Perk, nicht die vereinbarte Sichtunterbrechung durch tatsächliche Deckung.
  Den aktiven Kampfzustand nicht allein aus dem eingeschalteten Kampfmodus-Button ableiten.
- Normales Deckungshide bleibt vom Perk-Cooldown unabhängig.
- Assistentenvorschlag zur noch nicht ausdrücklich festgelegten Zeitrechnung: Cooldown
  ab erfolgreicher Aktivierung, also bei ununterbrochener Nutzung 10 Sekunden Wirkung
  und danach noch 20 Sekunden bis zur erneuten Verfügbarkeit.
- Der Perk soll später skillbar sein. Als Nutzeridee mit Wiedervorlage erhalten;
  noch keine Stufen, Fortschrittswerte oder neuen Fähigkeiten in diesem Patch bauen.

### Suchende und Naherkennung: bestehende Grundlage im neuen Deckungsbezug

- Nutzerentscheidung nach dem UO-Abgleich: Verfolgungs- und Suchzeiten des vorhandenen
  Spiels verwenden. Keine zusätzliche allgemeine Verfolgungs-/Gedächtnisregel einführen;
  erst auf unpassende Mechaniken in den Spieltests reagieren.
- Bei der Untersuchung beginnt der Timer am Eintritt in die Deckung. Der Suchbereich bleibt
  die konkrete kontaminierte Deckung. Benachbarte Deckungen gehören nicht zur Suchausweitung.
- Dabei bleibt die vorhandene Suchdauer des jeweiligen Auslösers die Grundlage. Der spätere
  Beginn der deckungsbezogenen Untersuchung ist die bereits vereinbarte Verhaltensänderung,
  keine neue Auswahl oder Verlängerung der Dauer. Ohne Deckungsbezug bleibt der Ablauf bestehen.
- Gezielte Naherkennung soll durch tatsächliche Wahrnehmung beim Absuchen möglich sein;
  keine Entdeckung durch eine dazwischenliegende undurchsichtige Wand.
- Bestehende Naherkennungsgrundlage mit diesen Deckungsregeln vereinbar machen; keine
  unbelegten Fremdspielwerte als neue Balance festlegen. Der vorhandene Nahbereich ist
  dabei kein pauschaler automatischer Entdeckungsradius für versteckte Figuren.
- Die Kontamination gehört zum Suchversuch des jeweiligen Zombies und darf nach dessen
  Ende keine weitere Suche erzwingen. Unerreichbare Suchbereiche dürfen keinen dauerhaft
  aktiven Anmarsch verursachen. Daraus weder eine neue allgemeine Chase-Regel noch eine
  Suche in beliebigen Nachbarbereichen ableiten.

### Geprüfter Iststand – vorhandene Zeitwerte bleiben Grundlage

- `ai.js`: Nach Sichtverlust Wechsel in `search` mit 6,5 Sekunden, nach `investigate`
  mit 5,5 Sekunden. `stateTimer` läuft derzeit bereits während der Annäherung herunter.
- `perception.js`: `nearRadius` beträgt 0,68 Welteinheiten. Der Nahbereich verändert
  Sichtwinkel/Exposition; das ist kein eigenständiger garantierter Hide-Entdeckungsradius.
- `ai.js`: Schon kleine positive Exposition erhöht die Wahrnehmung mit einer festen
  Grundrate und aktualisiert `lastSeen` auf die Spielerposition. Das muss bei wirksamer
  Deckung mit der vereinbarten festen Erinnerung vereinbar werden.
- Diese Zahlen sind belegte Werte unseres Codes. Nach der neuesten Nutzerentscheidung
  werden die vorhandenen Zeitwerte beibehalten und erst bei auffälligen Spieltests angepasst.
  Sie sind damit nicht als bewährte Fremdspielwerte oder unveränderliche Endbalance festgelegt.
- Abgleich am 21.09.2026: Die offizielle [PZwiki-Dokumentation zu Zombie Lore](https://pzwiki.net/wiki/Custom_Sandbox#Zombie_Lore)
  beschreibt unterschiedliche Gedächtnis- und Sichtstufen, belegt dort jedoch keine feste
  Sekunden-/Nahdistanzkombination für unser Deckungsmodell. Die eingesehene Seite bezieht
  sich auf Build 41.78.16. Daraus keine exakten aktuellen Zomboid-Werte ableiten.

## Weitere vorgemerkte Patchbereiche

| Bereich | Stand und Grenze |
| --- | --- |
| Openfield-Stealth | Nutzerentscheidung: eigener Button nur mit Perk, zunächst Einbrecher; sofortiger Hide für 10 Sekunden, 30 Sekunden Cooldown, zunächst ausschließlich geduckt und im aktiven Kampf nicht aktivierbar. Normales Deckungshide unabhängig vom Cooldown. |
| Zeitrechnung des Perks | Dauer und Cooldown sind als vorläufige Nutzerwerte festgelegt. Cooldown ab Aktivierung ist ein Assistentenvorschlag; alte Werte von 8/25 Sekunden sind ersetzt. |
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
| I-10 | Openfield-Stealth-Perk soll skillbar werden; Nutzer, 21.09.2026 | Nutzeridee für später; erste Version bleibt 10 Sekunden Hide / 30 Sekunden Cooldown und nur geduckt | … Perk-/Skillfortschritt, Speicherung von Fähigkeiten oder deren Stufen dauerhaft festgelegt werden. Erst dann konkrete Fortschrittswirkungen besprechen; nicht in jeder Patchnote wiederholen. |

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
- Die früher vorgeschlagenen 8 Sekunden Openfield-Hide und 25 Sekunden Cooldown sind
  durch die Nutzerwerte 10 Sekunden Hide und 30 Sekunden Cooldown vorerst ersetzt.
- 1,5 Sekunden pauschaler Hide-Nachlauf nach Verlassen einer Deckung war nur ein früherer
  Assistentenvorschlag. Nicht als beschlossen behandeln; Verhältnis zur später vorgeschlagenen
  Erkennungsfrist ungeklärt.
- Eine neue allgemeine Verfolgungsobergrenze und die Übernahme von UO-/Fremdspiel-Zeitwerten
  sind nach dem UO-Abgleich ausdrücklich aus dem aktuellen Patch genommen. Bestehende
  Verfolgungs-/Suchzeiten und allgemeine Verfolgungslogik bleiben Grundlage bis zu Spieltestbefunden.

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
- Bestehende Verfolgungs-/Suchzeiten bleiben erhalten; außerhalb der Deckungsänderungen
  bleibt der allgemeine Ablauf bestehen. Kein zusätzlicher globaler Verfolgungs-Countdown.
- Bestehende Exekution von hinten funktioniert mit der neuen Hide-Grundlage;
  neue Exekutionsvarianten gehören nicht zu dieser Abnahme.

## Änderungsnotiz 21.09.2026

Letzte Nutzervorgaben aufgenommen: keine Geräuschänderungen; Untersuchungszeit erst beim
Eintritt in den Deckungsbereich; etablierte Such-/Naherkennungsmechaniken zunächst testen;
offene Nutzerideen mit frühzeitiger Wiedervorlage erhalten; Exekutions-Skillset einschließlich
Frontal- und Über-Deckung-Varianten ausdrücklich für später vormerken.

Ergänzung nach dem UO-Abgleich: Die Abschweifung zu neuen allgemeinen Verfolgungsgrenzen
und fremden Zeitwerten ist beendet. Der Nutzer möchte den bestehenden Ablauf und dessen
Zeitwerte zunächst testen und nur bei konkreten Auffälligkeiten anpassen. Der aktuelle
Patch bleibt bei den vereinbarten Deckungs-/Hide-Änderungen und den weiteren vorgemerkten
Bereichen; die Untersuchungszeit beginnt weiterhin erst beim Eintritt in den Deckungsbereich.

Ergänzung zum Openfield-Perk: Nutzer legt 10 Sekunden sofortigen Hide und 30 Sekunden
Cooldown fest, zunächst nur geduckt und im aktiven Kampf nicht aktivierbar. Skillbarkeit
als spätere Idee aufgenommen. Zurückgestellte Ideen nur am relevanten Entscheidungspunkt
wieder ansprechen. Für den geduckten Deckungswechsel nach Referenzprüfung 1,0 Sekunde
Erkennungszeit als eigenen Assistenten-Testvorschlag dokumentiert; kein Fremdspielstandard.
