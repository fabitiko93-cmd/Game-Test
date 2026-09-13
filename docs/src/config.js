export const VIEW = {
  tileW: 64,
  tileH: 32,
  worldW: 36,
  worldH: 36,
  pixelRatioMax: 2,
};

export const COLORS = {
  grass: ["#475747", "#4c5d4b", "#435243", "#526050"],
  dirt: ["#625945", "#695f49", "#5c5442"],
  road: ["#3f4240", "#444644", "#3a3d3b"],
  sidewalk: ["#77786e", "#707269"],
  floor: ["#776d58", "#81765f", "#6d6554"],
  pharmacyFloor: ["#8d9487", "#858c81"],
  water: ["#314c50", "#365257"],
};

export const ITEMS = {
  kitchen_knife: {
    name: "Küchenmesser", short: "Messer", type: "weapon", weight: 0.35, stack: 1,
    damage: 24, range: 1.15, cooldown: 0.95, accuracy: .9, noise: 2.2, condition: 45,
    description: "Kurz, schnell und besser als leere Hände."
  },
  hammer: {
    name: "Schlosserhammer", short: "Hammer", type: "weapon", weight: 0.75, stack: 1,
    damage: 31, range: 1.05, cooldown: 1.35, accuracy: .82, noise: 3.8, condition: 70,
    description: "Schwerer Kopf. Macht Lärm."
  },
  baseball_bat: {
    name: "Baseballschläger", short: "Schläger", type: "weapon", weight: 1.1, stack: 1,
    damage: 27, range: 1.55, cooldown: 1.5, accuracy: .86, noise: 4.5, condition: 85,
    description: "Gute Reichweite, aber kaum zu überhören."
  },
  axe: {
    name: "Spaltaxt", short: "Axt", type: "weapon", weight: 1.6, stack: 1,
    damage: 44, range: 1.35, cooldown: 1.82, accuracy: .78, noise: 5.5, condition: 90,
    description: "Langsam, laut und endgültig."
  },
  bandage: {
    name: "Verbandspäckchen", short: "Verband", type: "medical", weight: 0.12, stack: 3,
    effect: { hp: 28 }, description: "Stoppt Blutungen und versorgt kleinere Wunden."
  },
  painkillers: {
    name: "Schmerztabletten", short: "Tabletten", type: "medical", weight: 0.08, stack: 4,
    effect: { hp: 12, stamina: 18 }, description: "Die Welt wird für kurze Zeit erträglicher."
  },
  antibiotics: {
    name: "Antibiotikum", short: "Antibiotikum", type: "medical", weight: 0.15, stack: 1,
    quest: true, description: "Noch versiegelt. Genau deswegen bist du hier."
  },
  water: {
    name: "Wasserflasche", short: "Wasser", type: "drink", weight: 0.65, stack: 2,
    effect: { thirst: 42 }, description: "Lauwarm, aber sauber."
  },
  soda: {
    name: "Cola-Dose", short: "Cola", type: "drink", weight: 0.33, stack: 3,
    effect: { thirst: 22, stamina: 8 }, description: "Zucker und ein Rest Kohlensäure."
  },
  apple: {
    name: "Runzliger Apfel", short: "Apfel", type: "food", weight: 0.18, stack: 3,
    effect: { hunger: 20, thirst: 4 }, description: "Hat bessere Tage gesehen."
  },
  bread: {
    name: "Halbes Graubrot", short: "Graubrot", type: "food", weight: 0.4, stack: 2,
    effect: { hunger: 32 }, description: "Trocken, aber ohne sichtbaren Schimmel."
  },
  canned_beans: {
    name: "Bohnendose", short: "Bohnen", type: "food", weight: 0.48, stack: 3,
    effect: { hunger: 45, thirst: 3 }, needsOpener: true, description: "Nahrhaft, falls du sie aufbekommst."
  },
  can_opener: {
    name: "Dosenöffner", short: "Öffner", type: "misc", weight: 0.12, stack: 1,
    description: "Unscheinbar, bis man ihn braucht."
  },
  batteries: {
    name: "Mignon-Batterien", short: "Batterien", type: "misc", weight: 0.1, stack: 4,
    description: "Zwei Stück, teilweise angelaufen."
  },
  cloth: {
    name: "Sauberer Stoff", short: "Stoff", type: "misc", weight: 0.08, stack: 4,
    description: "Könnte als notdürftiger Verband dienen."
  },
  keys: {
    name: "Schlüsselbund", short: "Schlüssel", type: "key", weight: 0.1, stack: 1,
    description: "Drei Schlüssel. Einer ist mit APOTHEKE beschriftet."
  }
};

export const LOOT_TABLES = {
  kitchen: [
    ["water", 0.75, 1, 1], ["bread", 0.55, 1, 1], ["apple", 0.48, 1, 2],
    ["canned_beans", 0.64, 1, 2], ["can_opener", 0.36, 1, 1], ["kitchen_knife", 0.35, 1, 1]
  ],
  fridge: [
    ["water", 0.82, 1, 2], ["soda", 0.68, 1, 2], ["apple", 0.68, 1, 2], ["bread", 0.4, 1, 1]
  ],
  tools: [
    ["hammer", 0.48, 1, 1], ["axe", 0.23, 1, 1], ["batteries", 0.62, 1, 2],
    ["cloth", 0.42, 1, 2], ["baseball_bat", 0.28, 1, 1]
  ],
  pharmacy: [
    ["bandage", 0.82, 1, 2], ["painkillers", 0.72, 1, 2], ["cloth", 0.42, 1, 2]
  ],
  grocery: [
    ["water", 0.76, 1, 2], ["soda", 0.66, 1, 3], ["canned_beans", 0.7, 1, 2],
    ["bread", 0.44, 1, 1], ["apple", 0.52, 1, 2], ["can_opener", 0.24, 1, 1]
  ],
  corpse: [
    ["bandage", 0.22, 1, 1], ["painkillers", 0.16, 1, 1], ["keys", 0.1, 1, 1],
    ["batteries", 0.2, 1, 1], ["cloth", 0.42, 1, 1]
  ]
};

export const OBJECT_LABELS = {
  cabinet: "Schrank durchsuchen",
  fridge: "Kühlschrank öffnen",
  shelf: "Regal durchsuchen",
  toolbox: "Werkzeugkiste öffnen",
  door: "Tür öffnen",
  corpse: "Leiche durchsuchen",
  radio: "Radio einschalten",
};
