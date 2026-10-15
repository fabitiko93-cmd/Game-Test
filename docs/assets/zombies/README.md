# Polyart Zombies

Original: **Polyart Zombies with Animations Free Pack** by **Denys Almaral**.

- [Original model](https://sketchfab.com/3d-models/polyart-zombies-with-animations-free-pack-d9bcfdd88f5348549bc947226af7c314)
- [Creator and animation list](https://denysalmaral.com/post/free-zombie-animations-for-your-games/)
- Supplied GLB SHA-256: `17b40fbdc717423184872f6bbfe3bdc92ca2390f6d32947e7ee433a67e278e73`

Ten characters (five female, five male). The GLB's single `Take 001` contains
different actions on different rigs. The preparation script matches bones by
ancestry and sibling order, preserves each target's proportions/accessories,
removes horizontal root motion and renders eight isometric views. The extra
unskinned display logo is excluded. The original file's embedded author/source
metadata is retained in `atlas.json`; the original license metadata says
`SKETCHFAB Standard`.

| Game situation | Atlas clip | Original action |
|---|---|---|
| Idle, stationary | rest | idle / idle3, alternating appearances |
| Suspicious; active but stationary | alert | idle2_alert |
| Ambient shuffle; searching on foot | shuffle | slowWalk / Walk2_limp |
| Investigating or chasing on foot | walk | Walk |
| Attack with recovery | attack_left / attack_right | attack_left / attack_right |

Running is not an implemented zombie behavior; its source clip is intentionally
unused and no running sheets are shipped. The aggressive walk is also unused
in favor of the ordinary gait. Alternating strikes use a 1.4-second visual
cycle. The inactive source lead-in is skipped: source 0.62–0.9 s plays at 1x
speed over the existing 0.28-second windup, followed by a calmer recovery.
Damage, cooldown, movement and perception remain in the existing simulation.
No death animation is present in the source. Infected corpses now retain their
original model identity, physical size and heading in a static prone rest pose.
`corpses.json` supplies ten small, hashed sheets with eight matching views at
the current 30-degree camera elevation. Human/player corpses remain separate.

Gaits advance with simulation time at 0.5x (ambient), 0.65x (search), 0.75x
(investigation) or 0.8x (chase) of the authored clip. Movement speed cannot
fast-forward the animation. Pause freezes it. Initial zombie IDs provide ten
appearances for old Save-v4 worlds as well. Facing uses eight octants with a
small overlap to avoid flapping at boundaries. Feet share a fixed anchor.

`directionRows` maps world-heading octants to camera rows. `viewForwards`
records the actual projected anatomical +Z direction of each camera view,
checked against the same 2:1 projection as sight cones. Gait source directions
are calibrated from both foot-to-toe axes over the full cycle; their differing
base headings are removed before rendering. Poses retained during loading
still follow the current heading.

Each PNG contains frames in columns and directions in rows. A cell is 80×88 px,
drawn at 1/1.5 size in the game. The atlas contains 8,960 rendered poses in 60
sheets. Only required state sheets are decoded. An LRU retains up to
14 sheets plus any extra sheets needed by currently visible figures; loaded
poses remain visible while a new state sheet decodes. The service worker caches
every PNG automatically as part of a complete offline release. Filenames
include the PNG SHA-256 prefix; atlas metadata is imported into the hashed JS
bundle. A still-active older worker therefore cannot mix old heading/timing
metadata or revised image content into a new release.

Regenerate using Python 3, numpy and Pillow:

```sh
python scripts/prepare-zombies.py /path/to/original.glb
python scripts/prepare-zombie-corpses.py /path/to/original.glb
```

`--preview --output /path/to/qa` produces a contact sheet without replacing game
assets. The GLB is an external source input; generated PNGs and metadata are
committed, so building/testing/playing does not require Python or the GLB.
