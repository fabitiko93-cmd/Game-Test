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
for example the older generic Warnweste and the named worker outfit, or the two
backpack items currently using the same Adventurer backpack mesh. The old
motorcycle-helmet item now uses the available SWAT helmet as its visible stand-in,
so its picture and equipped appearance agree. Stats and item identity are retained.

`item-icons.js` selects the symbol from the same clothing-model mapping as the
world renderer, including generic outfit items with `modelStyle`. Pictures are
shared by inventory, container and equipment views. The normal release build
fingerprints and precaches the atlas automatically.
