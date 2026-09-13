export const VIEW = {
  tileW: 64,
  tileH: 32,
  worldW: 48,
  worldH: 48,
  pixelRatioMax: 2,
};

export const GAME = {
  seed: 981013,
  startMinutes: 6 * 60 + 42,
  timeScale: 2.15,
  autosaveSeconds: 8,
  interactionRange: 1.38,
  migrationSeconds: 78,
  maxZombies: 24,
};

export const SAVE = {
  key: "sperrkreis98-save-v3",
  version: 3,
};

export const STANCES = {
  sneak: { label: "SCHLEICHEN", speed: 1.04, noise: 0.52, visibility: 0.55, stamina: 8.5 },
  walk: { label: "GEHEN", speed: 1.88, noise: 1.45, visibility: 1, stamina: 7 },
  run: { label: "RENNEN", speed: 3.38, noise: 5.4, visibility: 1.32, stamina: -17 },
};

export const COLORS = {
  grass: ["#475747", "#4c5d4b", "#435243", "#526050"],
  dirt: ["#625945", "#695f49", "#5c5442"],
  road: ["#3f4240", "#444644", "#3a3d3b"],
  sidewalk: ["#77786e", "#707269"],
  floor: ["#776d58", "#81765f", "#6d6554"],
  pharmacyFloor: ["#8d9487", "#858c81"],
  policeFloor: ["#747d78", "#69736e"],
  clubFloor: ["#756b57", "#6b604f"],
  water: ["#314c50", "#365257"],
};
