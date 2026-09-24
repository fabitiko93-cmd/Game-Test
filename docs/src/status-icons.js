import { distance } from "./util.js?v=12";
import { STEALTH_RULES } from "./stealth.js?v=12";

// One symbol vocabulary for world-space buffs and the accessible menu legend.
export const STATUS_ICONS = Object.freeze({
  hide: { label: "Verborgen", path: "M3 10L7 4H17L21 10V18L12 22L3 18Z M7 11L10 13 M17 11L14 13" },
  eye: { label: "Sichtbar / Schleichen", path: "M2 12Q12 1 22 12Q12 23 2 12Z M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12" },
  sound: { label: "Geräuschpegel", path: "M3 10H7L12 5V19L7 14H3Z M16 8Q21 12 16 16 M19 4Q27 12 19 20" },
  wound: { label: "Verletzung", path: "M4 9L9 4L20 15L15 20Z M9 10L10 9 M12 13L13 12 M15 16L16 15" },
  blood: { label: "Blutung", path: "M12 2C10 7 5 12 5 16A7 7 0 0 0 19 16C19 12 14 7 12 2Z" },
  hunger: { label: "Kritischer Hunger", path: "M4 2V8Q7 13 10 8V2 M7 2V22 M18 2Q13 6 16 13H19V22 M19 2V13" },
  thirst: { label: "Kritischer Durst", path: "M5 4H19L17 21H7Z M7 12Q10 9 13 12Q16 15 18 12" },
  illness: { label: "Krankheit / Symptome", path: "M9 4A3 3 0 0 1 15 4V14A5 5 0 1 1 9 14Z M12 8V18 M17 6H21 M17 10H20" },
  search: { label: "Zombie sucht", path: "M16 10A6 6 0 1 1 4 10A6 6 0 1 1 16 10 M15 15L22 22" },
  alert: { label: "Entdeckt / Verfolgung", path: "M12 3V14 M12 19V21" },
  question: { label: "Verdacht", path: "M7 7C7 0 20 1 17 9L12 14V16 M12 20V21" },
  execute: { label: "Exekutionsreichweite", path: "M18 12A6 6 0 1 1 6 12A6 6 0 1 1 18 12 M12 1V7 M12 17V23 M1 12H7 M17 12H23" },
});

export function playerStatusIcons(game) {
  const p = game.player, state = p.stealthState || {};
  const spotted = game.zombies.some(z => !z.removed && z.state === "chase" && z.sightMemory?.visible);
  const recognition = Math.max(0, ...game.zombies.filter(z => !z.removed).map(z => z.sightMemory?.recognition || 0));
  const hidden = state.hidden && !spotted;
  const noise = Math.max(p.noisePulse || 0, Math.min(1, (p.noiseRadius || 0) / 7));
  const icons = [
    { slot: 0, id: hidden ? "hide" : "eye", color: spotted ? "#ee8472" : hidden ? "#b3d29b" : p.stance === "sneak" ? "#d7bc79" : "#a9b1a6",
      progress: state.source === "openfield" ? state.openfieldRemaining / STEALTH_RULES.openfieldDuration : recognition || null },
    { slot: 1, id: "sound", color: noise > .68 ? "#ee8472" : noise > .3 ? "#d7bc79" : "#8bafb7", progress: noise },
  ];
  if (p.bleeding > .01 || p.wounds?.length) icons.push({ slot: 2, id: p.bleeding > .01 ? "blood" : "wound", color: p.bleeding > .01 ? "#ee8472" : "#d7bc79" });
  if (p.hunger < 18) icons.push({ slot: 3, id: "hunger", color: "#ee8472" });
  if (p.thirst < 18) icons.push({ slot: 4, id: "thirst", color: "#ee8472" });
  if (p.infectionStage > 0 || p.wounds?.some(w => w.normalInfected && !w.disinfected)) icons.push({ slot: 5, id: "illness", color: "#c7afdf" });
  return icons;
}

export function zombieStatusIcons(zombie, game) {
  const icons = [];
  if (zombie.state !== "idle") icons.push({ slot: 0,
    id: zombie.state === "chase" ? "alert" : zombie.state === "suspicious" ? "question" : "search",
    color: zombie.state === "chase" ? "#ee8472" : "#d7bc79",
    progress: zombie.sightMemory?.recognition || null,
  });
  if (distance(zombie, game.player) <= STEALTH_RULES.executionRange) icons.push({ slot: 1, id: "execute",
    color: game.stealth.isExecutionReady(game, zombie) ? "#b3e994" : "#858b86" });
  return icons;
}

export function iconSVG(id) {
  const icon = STATUS_ICONS[id];
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${icon.path}"/></svg>`;
}
