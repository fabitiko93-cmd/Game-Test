# Waffenhaltungen aus vorhandenen Kits

Alle modellierten Schusswaffen verwenden jetzt importierte Kit-Grundhaltungen
im gemeinsamen Spiel-/Werkstattcontroller. Die übermäßigen eigenen Schulter-,
Augen- und Schaftsockelkorrekturen sind aus diesem Pfad entfernt. Die finalisierten
Finger und modellbezogenen Handgriffe bleiben erhalten. Bauchglättung und
weibliche Taille stammen weiterhin aus der bereits eingebauten Körpergeometrie.

![Bisherige Haltung links, aktive Kit-Haltung rechts](review/stance-kit-comparison.png)

## Zuordnung

| Waffen | Grundhaltung |
|---|---|
| G17, USP, SIG Emperor Scorpion, Desert Eagle | Quaternius UAL: `Pistol_Idle_Loop`, `Pistol_Aim_Down`, `Pistol_Aim_Neutral` |
| Revolver .44 | Quaternius `Idle_Neutral` beim Tragen, ZenXChaos `RevolverAimIdle` beim Anlegen |
| AK, M4, Vector, Ithaca Mag-10, Benelli M4, Mossberg 590 | KayKit FREE 1.1: `Ranged_2H_Aiming`; abgesenktes Tragen aus derselben Armform |
| Kurze Ithaca | Quaternius `Idle_Gun` / `Idle_Gun_Pointing`, einhändig mit freiem linken Arm |

## Vergleich der ersten Prüfreferenz

| Waffe | Ellenbogen männlich, vorher → Kit | Weiblich, vorher → Kit |
|---|---:|---:|
| G17 | 27,8° → 14,3° | 27,8° → 14,3° |
| Ithaca kurz | 53,2° → 24,7° | 68,7° → 25,9° |

Der Winkel zwischen Unterarm und Mittelhand der kurzen Ithaca sinkt von
34,1°/44,1° auf 7,1°/7,5°. Die Armform ist damit deutlich weniger geknickt.
Das sind geometrische Diagnosen, keine anatomischen Messungen.
Vollständige Werte: [stance-kit-measurements.json](review/stance-kit-measurements.json).

Der Vergleich exportiert tatsächlich verformte Spieloberflächen aus dem
gemeinsamen Controller mit identischer Kamera und Beleuchtung. Finger aus
`g17-grasp.json` und `ithaca-one-hand.json` werden nicht aus dem Kit importiert.

## Laufzeit und technische Abdeckung

`kit-stance.js` überträgt Oberkörper und Arme. Der separate Wirbelsäulenursprung
`Hips` gleicht die alte `Body`-Drehung des Bewegungsclips aus; beide Beinketten
behalten ihre Originalbewegung. Ein starrer Schwenk richtet den Waffenarm auf
die Spielzielrichtung aus. Die Achsennormalisierung erhält dabei die importierten
Ellenbogen-/Handpunkte und verhindert Verdrehungen aus unterschiedlichen Rigachsen.

`kit-stance-controller.js` verbindet die Grundhaltungen mit dem zuletzt tatsächlich
erreichten Nachladebild. Kontaktfits halten die Stützhand am realen Griff und
begrenzen gleichzeitig Rollbewegungen. Wiederholte IK-Auswertungen normalisieren
Quaternionen, damit Rundungsfehler die Armlängen nicht verändern. Rückstoß dreht
die Waffe am Handgelenk. Im weiblichen Schleich-Nachladen liegt der Haltepunkt
moderner langer Flinten etwas höher, damit Ladeöffnung und Knie frei bleiben.

Bestehende Nachlade-, Pump-, Auswurf- und Munitionsabläufe bleiben zuständig.
Es gibt keine neue Absäge-, Akimbo-, Mod- oder Balancemechanik.

Die technischen Prüfungen umfassen beide Rigs, originale Beinweltpunkte und
Armlängen, freigegebene skinned Hände, echte Lauf-/Griffkontakte, Rückstoß,
Haltungswechsel und schnelle Unterbrechungen bei 15/30/60 Hz. Die Flintenprüfung
verfolgt vollständige Ladeschleifen, Patronenhalter und den tatsächlichen
Einsetzpunkt. Kollisionsprüfungen verwenden die verformten Körperdreiecke.
Werkstatt und Spiel verwenden denselben Controller; den optischen Spieltest
übernimmt wie vereinbart der Nutzer.

## Quellen und Reproduktion

- Quaternius / Gonzalo Furnier, Universal Animation Library Standard, CC0:
  https://quaternius.itch.io/universal-animation-library.
- Quaternius Ultimate Modular Characters, Originalclips, CC0:
  https://quaternius.com/packs/ultimatemodularcharacters.html.
- Kay Lousberg / KayKit Character Animations FREE 1.1, CC0:
  https://kaylousberg.itch.io/kaykit-character-animations.
- ZenXChaos, ThirdPersonShooter-AnimationSets, Unlicense:
  https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets.

Originaldatei-Hashes, Clipnamen und getrennte Quellen stehen in
`assets/quaternius/stance-kit.json`; die Lizenztexte liegen daneben.
Der FBX-Sampleordner enthält `RevolverAimIdle.fbx` und dessen Sampler-JSON.

```sh
node scripts/prepare-stance-kit.mjs /path/to/UAL1_Standard.glb /path/to/revolver-samples /path/to/Rig_Medium_CombatRanged.glb
node scripts/preview-stance-kit.mjs /tmp/sperrkreis-kit-review
node --test tests/stance-kit.test.mjs
npm run build
npm test
npm run build:check
```
