# Echtzeit-Polyart-Zombies

Original: **Polyart Zombies with Animations Free Pack**, **Denys Almaral**.

- [Originalmodell](https://sketchfab.com/3d-models/polyart-zombies-with-animations-free-pack-d9bcfdd88f5348549bc947226af7c314)
- [Autor und Animationen](https://denysalmaral.com/post/free-zombie-animations-for-your-games/)
- Original-GLB SHA-256: `17b40fbdc717423184872f6bbfe3bdc92ca2390f6d32947e7ee433a67e278e73`
- Die Lizenzangabe im gelieferten Original lautet `SKETCHFAB Standard`.

Die zehn selbstständigen GLBs erhalten die ursprünglichen Meshes, UVs, Textur,
Gewichte, Accessoires und Skelettproportionen. Anstelle gerasterter Einzelbilder
interpoliert Three.js die Skelettschlüssel bei jedem gerenderten Bild.
Der GLB-Transport ist verlustfrei gzip-komprimiert; das Spiel entpackt die
ursprünglichen Bytes vor dem GLTFLoader. Kein Verlust an Geometrie oder Animation.
Konstante Tracks teilen Datenspeicher; bewegte Tracks behalten die originalen
Schlüsselzeiten. Es gibt keine Reduktion auf die bisherigen 16/20 Sprite-Posen.

Der einzelne Original-Take enthält verschiedene Aktionen auf verschiedenen Rigs.
Der Generator ordnet Bones anhand ihrer Hierarchie zu, berücksichtigt Beinlängen
und Hip-Verhältnisse, entfernt horizontale Root-Bewegung und korrigiert die
anatomische Blickrichtung der Gehclips. Die Figuren werden einheitlich an ihrer
kanonischen Idle-Referenz skaliert; keine Größenänderung je Pose.

`models.json` dokumentiert Quelle, Inhaltsdateinamen, Referenzhöhe, Clips und den
gemessenen rückwärtigen Fußweg. Der gewöhnliche Walk-Take enthält zwei komplette
Gehzyklen. Die Gehphase folgt tatsächlich zurückgelegten Metern geteilt durch den
gesamten gemessenen Fußweg einschließlich individueller Körpergröße. Eine
blockierte Figur tritt nicht weiter auf der Stelle. Nur ambient wird geschlurft;
Suche, Untersuchung und Verfolgung nutzen Walk. Der Running-Take wird nicht exportiert.

Angriffe behalten 0,28 s Windup und den vorhandenen 1,42-s-Schadenscooldown.
Die Originalbewegung ab 0,62 s erreicht ihren Kontaktpunkt nach 0,28 s; die
Erholung läuft bis 1,4 s ruhig aus. Ein-/Ausblenden geschieht durch Skelett-Blends,
nicht durch übereinandergelegte halbtransparente Bilder. Jeder WebGL-Pass löscht
Farbe und Tiefe; es gibt keinen zeitlichen Unschärfe-/Nachzieheffekt.

Die Orthokamera hat dieselbe 30°-Elevation und denselben Metermaßstab wie die
2:1-Welt. Native Displayauflösung bis DPR 3 ersetzt die bisherige DPR-1,5-Grenze.
Die bestehende Tiefensortierung und die nachgelagerten Dächer-/Licht-/Nebel-Pässe
bleiben auch für die Echtzeit-Modelle wirksam. Pro Figur werden nur Skelett und
Mixer geklont; unveränderliche Textur und Mesh-Geometrie werden gemeinsam genutzt.
Bei fehlendem WebGL oder Modell-Ladefehlern bleibt der vorhandene Sprite-Ersatz.

Getötete Zombies behalten Original-ID, Variante, metrische Körpergröße und
Blickrichtung in `corpse.zombieAppearance`, auch nach erneutem Laden. Mangels
Death-Take wird die echte Rest-Skelettpose unbewegt auf den Rücken gelegt,
anhand ihrer tatsächlichen verformten Mesh-Grenzen auf den Boden gesetzt und
um ihren auswählbaren Weltpunkt zentriert. Keine generische Ersatzfigur und
keine weiterlaufende Geh-/Ruheanimation; Loot und Interaktion bleiben bestehen.
Der Sprite-Ersatz verwendet zehn passende, aus dem Originalmodell gerenderte
Leichenansichten in `docs/assets/zombies/corpses.json`.

Regenerieren (Python 3, numpy, Pillow):

```sh
python scripts/prepare-zombies-3d.py /path/to/original.glb
```

Spielen/Build benötigen nur die eingecheckten GLBs und das Manifest. Three.js
0.186.1 wird mit dem Spiel gebündelt; zur Laufzeit ist kein CDN erforderlich.
