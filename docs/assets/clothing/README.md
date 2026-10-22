# Clothing inventory pictures

Generated from the shipped Quaternius Ultimate Modular Men / Women CC0 models.
See `../quaternius/README.md` for upstream sources and licence notices.

Run `node scripts/prepare-clothing-icons.mjs` to rebuild, or append `--check` to
verify reproducibility. The generator loads the actual skinned meshes, evaluates
their original neutral animation, isolates each garment and projects its visible
triangles orthographically. Skin is excluded; hats contain only the same headwear
materials used in the game. Colours come from the original materials with fixed
lighting. Shoes show both feet; backpacks are viewed from behind. The SVG has a
transparent background, a 96 × 96 view box per symbol and a content-hashed filename.
No raster dependency, generated concept art or traced substitute silhouettes.

`icons.json` records the source model, source file hash, slot, material names and
visible triangle count for every symbol. Identical rendered parts share a symbol:
for example the retained Warnweste and the named worker outfit. The hiking pack
uses the original Adventurer backpack. The former generic clothing items with
borrowed substitutes (including the leather jacket and motorcycle helmet) have
been removed; the actual separately named garments and headwear remain.

`item-icons.js` selects the symbol from the same clothing-model mapping as the
world renderer. Pictures are
shared by inventory, container and equipment views. The normal release build
fingerprints and precaches the atlas automatically.
