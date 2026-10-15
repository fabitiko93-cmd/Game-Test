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
| Investigating on foot | walk | Walk / Walk_Agressive |
| Chasing on foot | run | running |
| Attack with recovery | attack_left / attack_right | attack_left / attack_right |

All ten source actions are used. Alternating strikes reach the source's forward
extension around 0.28 seconds of the 0.73-second visual cycle, matching the
existing attack windup. Damage, cooldown, movement and perception remain in the
existing simulation. No death animation is present in the source; existing
death/removal behavior is retained.

Gaits advance with actual world distance. Ambient motion uses simulation time,
so pause freezes animation. Initial zombie IDs provide ten appearances for old
Save-v4 worlds as well. Facing uses eight octants with a small overlap to avoid
flapping at boundaries. Feet share a fixed anchor across frames/actions.

Each PNG contains frames in columns and directions in rows. A cell is 80×88 px,
drawn at 1/1.5 size in the game. The atlas contains 9,600 rendered poses, about
6.2 MB encoded. Only required state sheets are decoded. An LRU retains up to
14 sheets plus any extra sheets needed by currently visible figures; loaded
poses remain visible while a new state sheet decodes. The service worker caches
every PNG automatically as part of a complete offline release.

Regenerate using Python 3, numpy and Pillow:

```sh
python scripts/prepare-zombies.py /path/to/original.glb
```

`--preview --output /path/to/qa` produces a contact sheet without replacing game
assets. The GLB is an external source input; generated PNGs and metadata are
committed, so building/testing/playing does not require Python or the GLB.
