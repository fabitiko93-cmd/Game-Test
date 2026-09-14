export const SKILLS = {
  stealth: { name: "Schleichen", description: "Leisere Bewegung und geringere Sichtbarkeit." },
  perception: { name: "Wahrnehmung", description: "Gefahren und Geräuschrichtungen früher erkennen." },
  blades: { name: "Klingenwaffen", description: "Sicherer Umgang mit Messern und Äxten." },
  blunt: { name: "Schlagwaffen", description: "Kontrollierte, kraftsparende stumpfe Treffer." },
  firearms: { name: "Schusswaffen", description: "Schneller und stabiler auf ein Ziel einrichten." },
  search: { name: "Durchsuchen", description: "Behälter schneller und leiser ausräumen." },
  firstAid: { name: "Erste Hilfe", description: "Wunden früher erkennen und besser versorgen." },
  burglary: { name: "Einbruch", description: "Schlösser leiser und zuverlässiger überwinden." },
};

export const BACKGROUNDS = {
  citizen: {
    name: "Durchschnittsbürger",
    short: "Keine besondere Vorbereitung. Dafür ohne ausgeprägte Schwäche.",
    carryBonus: 0,
    skills: { stealth: 9, perception: 10, blades: 7, blunt: 7, firearms: 5, search: 12, firstAid: 7, burglary: 5 },
  },
  paramedic: {
    name: "Sanitäter",
    short: "Erkennt Verletzungen früh und verschwendet weniger Verbandsmaterial.",
    carryBonus: -0.5,
    skills: { stealth: 7, perception: 16, blades: 5, blunt: 6, firearms: 4, search: 10, firstAid: 34, burglary: 4 },
  },
  handyman: {
    name: "Handwerker",
    short: "Kräftig, werkzeugkundig und geübt im Öffnen widerspenstiger Zugänge.",
    carryBonus: 1.5,
    skills: { stealth: 6, perception: 10, blades: 12, blunt: 29, firearms: 5, search: 13, firstAid: 8, burglary: 20 },
  },
  hunter: {
    name: "Jäger",
    short: "Ruhige Hand, gutes Auge und Erfahrung außerhalb befestigter Wege.",
    carryBonus: 0.5,
    skills: { stealth: 19, perception: 29, blades: 13, blunt: 8, firearms: 31, search: 9, firstAid: 8, burglary: 5 },
  },
  burglar: {
    name: "Einbrecher",
    short: "Bewegt sich leise und kommt durch Türen, die geschlossen bleiben sollten.",
    carryBonus: -0.5,
    skills: { stealth: 33, perception: 17, blades: 9, blunt: 8, firearms: 7, search: 21, firstAid: 5, burglary: 34 },
  },
};

export const EQUIPMENT_SLOTS = {
  mainHand: "HAND",
  offHand: "NEBENHAND",
  head: "KOPF",
  torso: "OBERKÖRPER",
  legs: "BEINE",
  back: "RÜCKEN",
};

const melee = (name, short, skill, damage, range, cooldown, accuracy, noise, weight, hands, description, options = {}) => ({
  name, short, type: "weapon", icon: "weapon", weaponKind: "melee", skill,
  damage, range, cooldown, accuracy, noise, weight, hands, stack: 1, condition: 100, description, ...options,
});

const firearm = (name, short, options) => ({
  name, short, type: "weapon", icon: "firearm", weaponKind: "firearm", skill: "firearms",
  stack: 1, condition: 100, ...options,
});

export const ITEMS = {
  kitchen_knife: melee("Küchenmesser", "Messer", "blades", 20, 1.13, 0.95, 0.84, 1.8, 0.35, 1, "Schnell und leise, aber ohne große Reichweite.", { execution: true }),
  hammer: melee("Schlosserhammer", "Hammer", "blunt", 27, 1.04, 1.28, 0.8, 3.4, 0.75, 1, "Kurze Reichweite, kräftiger Taumelschlag."),
  baseball_bat: melee("Baseballschläger", "Schläger", "blunt", 25, 1.55, 1.42, 0.85, 4.1, 1.15, 2, "Reichweite und Kontrolle gegen einzelne Infizierte."),
  axe: melee("Spaltaxt", "Axt", "blades", 42, 1.34, 1.75, 0.78, 5.2, 1.65, 2, "Langsam und anstrengend, dafür verheerend."),

  pistol_9mm: firearm("9-mm-Pistole", "Pistole", {
    weight: 0.86, hands: 1, damage: 44, range: 9.2, aimTime: 1.35, recovery: 0.48,
    accuracy: 0.72, headshot: 0.2, noise: 18, feed: "magazine",
    magazineTypes: ["mag_9mm_12", "mag_9mm_18"], modSlots: ["optic", "muzzle", "utility"],
    description: "Handlich und schnell im Anschlag. Benötigt ein geladenes Magazin.",
  }),
  revolver_38: firearm(".38-Revolver", "Revolver", {
    weight: 1.02, hands: 1, damage: 53, range: 8.4, aimTime: 1.55, recovery: 0.62,
    accuracy: 0.69, headshot: 0.24, noise: 21, feed: "internal", capacity: 6, ammoType: "ammo_38",
    modSlots: ["optic", "utility"], description: "Zuverlässig, kräftig und langsam nachzuladen.",
  }),
  shotgun_12g: firearm("Doppelläufige Flinte", "Flinte", {
    weight: 3.05, hands: 2, damage: 82, range: 7.1, aimTime: 1.7, recovery: 1.08,
    accuracy: 0.88, headshot: 0.12, noise: 29, feed: "internal", capacity: 2, ammoType: "shell_12g",
    spread: 1.25, modSlots: ["optic", "muzzle", "stock", "utility"],
    description: "Auf kurze Distanz brutal. Der Schuss ist im ganzen Viertel zu hören.",
  }),
  hunting_rifle: firearm("Jagdgewehr", "Gewehr", {
    weight: 3.55, hands: 2, damage: 72, range: 14, aimTime: 2.35, recovery: 1.18,
    accuracy: 0.83, headshot: 0.34, noise: 32, feed: "internal", capacity: 4, ammoType: "ammo_rifle",
    modSlots: ["optic", "muzzle", "stock", "utility"],
    description: "Präzise und durchschlagskräftig, in Gebäuden jedoch sperrig.",
  }),

  ammo_9mm: { name: "9-mm-Patronen", short: "9 mm", type: "ammo", icon: "ammo", ammoType: "ammo_9mm", weight: 0.012, stack: 30, description: "Lose Pistolenmunition." },
  ammo_38: { name: ".38-Patronen", short: ".38", type: "ammo", icon: "ammo", ammoType: "ammo_38", weight: 0.014, stack: 24, description: "Munition für den Revolver." },
  shell_12g: { name: "Kaliber-12-Schrot", short: "12/70", type: "ammo", icon: "ammo", ammoType: "shell_12g", weight: 0.044, stack: 16, description: "Schrotpatronen für die Flinte." },
  ammo_rifle: { name: "Jagdpatronen", short: "Jagdpatr.", type: "ammo", icon: "ammo", ammoType: "ammo_rifle", weight: 0.026, stack: 20, description: "Büchsenmunition für das Jagdgewehr." },
  mag_9mm_12: { name: "9-mm-Magazin", short: "Magazin", type: "magazine", icon: "magazine", ammoType: "ammo_9mm", capacity: 12, compatible: ["pistol_9mm"], weight: 0.11, stack: 1, description: "Standardmagazin mit zwölf Patronen." },
  mag_9mm_18: { name: "Verlängertes 9-mm-Magazin", short: "18er-Mag.", type: "magazine", icon: "magazine", ammoType: "ammo_9mm", capacity: 18, compatible: ["pistol_9mm"], weight: 0.16, stack: 1, description: "Mehr Patronen, aber spürbar schwerer." },

  reflex_sight: { name: "Leuchtpunktvisier", short: "Leuchtpunkt", type: "mod", icon: "mod", modSlot: "optic", compatible: ["pistol_9mm", "shotgun_12g"], effects: { aimTimeMul: 0.78 }, weight: 0.14, stack: 1, description: "Beschleunigt die Zielerfassung auf kurze Distanz." },
  hunting_scope: { name: "Jagdzielfernrohr", short: "Zielfernrohr", type: "mod", icon: "mod", modSlot: "optic", compatible: ["hunting_rifle"], effects: { aimTimeMul: 0.82, rangeAdd: 4, closePenalty: 0.16 }, weight: 0.42, stack: 1, description: "Große Reichweite, aber unhandlich auf engstem Raum." },
  pistol_suppressor: { name: "Pistolenschalldämpfer", short: "Dämpfer", type: "mod", icon: "mod", modSlot: "muzzle", compatible: ["pistol_9mm"], effects: { noiseMul: 0.44, aimTimeMul: 1.08 }, weight: 0.27, stack: 1, description: "Reduziert den Knall deutlich, macht ihn jedoch nicht lautlos." },
  shotgun_choke: { name: "Flinten-Choke", short: "Choke", type: "mod", icon: "mod", modSlot: "muzzle", compatible: ["shotgun_12g"], effects: { rangeAdd: 2.2, spreadMul: 0.66 }, weight: 0.09, stack: 1, description: "Bündelt die Streuung auf mittlere Entfernung." },
  recoil_pad: { name: "Rückstoßpolster", short: "Polster", type: "mod", icon: "mod", modSlot: "stock", compatible: ["shotgun_12g", "hunting_rifle"], effects: { recoveryMul: 0.76, aimTimeMul: 1.04 }, weight: 0.18, stack: 1, description: "Schnellere Stabilisierung nach dem Schuss." },
  short_stock: { name: "Verkürzter Schaft", short: "Kurzschaft", type: "mod", icon: "mod", modSlot: "stock", compatible: ["shotgun_12g"], effects: { aimTimeMul: 0.72, rangeMul: 0.74, noiseMul: 1.06 }, weight: 0.22, stack: 1, permanent: true, description: "Schnell in Räumen, schwach auf Entfernung." },
  weapon_sling: { name: "Gewehrriemen", short: "Riemen", type: "mod", icon: "mod", modSlot: "utility", compatible: ["shotgun_12g", "hunting_rifle"], effects: { carriedWeightMul: 0.72 }, weight: 0.13, stack: 1, description: "Verringert die Belastung einer getragenen Langwaffe." },
  shell_holder: { name: "Schaft-Patronenhalter", short: "Patronenhalt.", type: "mod", icon: "mod", modSlot: "utility", compatible: ["shotgun_12g"], effects: { reloadMul: 0.68 }, weight: 0.16, stack: 1, description: "Beschleunigt das Nachladen der Flinte." },

  bandage: { name: "Verbandspäckchen", short: "Verband", type: "medical", icon: "medical", medical: "bandage", weight: 0.12, stack: 3, description: "Stoppt die stärkste unversorgte Blutung." },
  disinfectant: { name: "Wunddesinfektion", short: "Desinfektion", type: "medical", icon: "medical", medical: "disinfect", weight: 0.18, stack: 2, description: "Senkt das Risiko einer gewöhnlichen Wundinfektion." },
  painkillers: { name: "Schmerztabletten", short: "Tabletten", type: "medical", icon: "medical", medical: "painkiller", weight: 0.08, stack: 4, description: "Dämpft Schmerzen und stabilisiert kurzzeitig die Ausdauer." },
  antibiotics: { name: "Antibiotika", short: "Antibiotika", type: "medical", icon: "medical", medical: "antibiotic", weight: 0.1, stack: 2, description: "Wirkt gegen gewöhnliche Wundinfektionen, nicht gegen den Erreger." },
  sealed_antibiotics: { name: "Versiegeltes Antibiotikum", short: "Medikament", type: "quest", icon: "medical", quest: true, weight: 0.15, stack: 1, description: "Die versiegelte Packung aus dem Funkspruch." },

  water: { name: "Wasserflasche", short: "Wasser", type: "drink", icon: "drink", weight: 0.65, stack: 2, effect: { thirst: 42 }, description: "Lauwarm, aber sauber." },
  soda: { name: "Cola-Dose", short: "Cola", type: "drink", icon: "drink", weight: 0.33, stack: 3, effect: { thirst: 22, stamina: 8 }, description: "Zucker und ein Rest Kohlensäure." },
  apple: { name: "Runzliger Apfel", short: "Apfel", type: "food", icon: "food", weight: 0.18, stack: 3, effect: { hunger: 20, thirst: 4 }, description: "Hat bessere Tage gesehen." },
  bread: { name: "Halbes Graubrot", short: "Graubrot", type: "food", icon: "food", weight: 0.4, stack: 2, effect: { hunger: 32 }, description: "Trocken, aber ohne sichtbaren Schimmel." },
  canned_beans: { name: "Bohnendose", short: "Bohnen", type: "food", icon: "food", weight: 0.48, stack: 3, effect: { hunger: 45, thirst: 3 }, needs: "can_opener", description: "Nahrhaft, falls du sie aufbekommst." },

  work_jacket: { name: "Arbeitsjacke", short: "Jacke", type: "clothing", icon: "clothing", equipSlot: "torso", protection: 0.12, weight: 1.05, stack: 1, condition: 80, description: "Robuster Stoff mit begrenztem Bissschutz." },
  leather_jacket: { name: "Lederjacke", short: "Lederjacke", type: "clothing", icon: "clothing", equipSlot: "torso", protection: 0.28, weight: 1.65, stack: 1, condition: 90, description: "Schwer, aber deutlich widerstandsfähiger." },
  jeans: { name: "Jeans", short: "Jeans", type: "clothing", icon: "clothing", equipSlot: "legs", protection: 0.1, weight: 0.72, stack: 1, condition: 85, description: "Alltäglicher Schutz für die Beine." },
  motorcycle_helmet: { name: "Motorradhelm", short: "Helm", type: "clothing", icon: "clothing", equipSlot: "head", protection: 0.42, weight: 1.45, stack: 1, condition: 88, description: "Starker Kopfschutz auf Kosten des Gewichts." },
  canvas_bag: { name: "Stoffrucksack", short: "Rucksack", type: "bag", icon: "bag", equipSlot: "back", capacityBonus: 6, weight: 0.55, stack: 1, condition: 75, description: "Ein einfacher Rucksack mit begrenztem Volumen." },
  hiking_pack: { name: "Wanderrucksack", short: "Wanderrucksack", type: "bag", icon: "bag", equipSlot: "back", capacityBonus: 12, weight: 1.25, stack: 1, condition: 90, description: "Geräumig, robust und entsprechend begehrt." },

  can_opener: { name: "Dosenöffner", short: "Öffner", type: "tool", icon: "tool", weight: 0.12, stack: 1, description: "Unscheinbar, bis man ihn braucht." },
  lockpick: { name: "Dietrichsatz", short: "Dietriche", type: "tool", icon: "tool", weight: 0.1, stack: 1, uses: 8, description: "Öffnet Schlösser leise, wenn die Hände ruhig bleiben." },
  crowbar: { name: "Brecheisen", short: "Brecheisen", type: "weapon", icon: "weapon", weaponKind: "melee", skill: "blunt", damage: 29, range: 1.3, cooldown: 1.42, accuracy: 0.81, noise: 4.6, weight: 1.8, hands: 2, stack: 1, condition: 100, tool: "breach", description: "Waffe und lauter Universalschlüssel." },
  pharmacy_key: { name: "Apothekenschlüssel", short: "APO-Schlüssel", type: "key", icon: "key", keyId: "pharmacy", weight: 0.08, stack: 1, description: "Mit verblasstem Etikett: APOTHEKE." },
  police_key: { name: "Dienstschlüssel", short: "Dienstschl.", type: "key", icon: "key", keyId: "police", weight: 0.09, stack: 1, description: "Kleiner Schlüssel für gesicherte Polizeischränke." },
  batteries: { name: "Mignon-Batterien", short: "Batterien", type: "misc", icon: "misc", weight: 0.1, stack: 4, description: "Zwei Stück, teilweise angelaufen." },
  cloth: { name: "Sauberer Stoff", short: "Stoff", type: "misc", icon: "misc", weight: 0.08, stack: 4, description: "Lässt sich notfalls als Verband verwenden." },
};

export const LOOT_TABLES = {
  kitchen: [
    ["water", 0.7, 1, 1], ["bread", 0.5, 1, 1], ["apple", 0.42, 1, 2],
    ["canned_beans", 0.62, 1, 2], ["can_opener", 0.32, 1, 1], ["kitchen_knife", 0.26, 1, 1],
  ],
  fridge: [["water", 0.78, 1, 2], ["soda", 0.62, 1, 2], ["apple", 0.58, 1, 2], ["bread", 0.35, 1, 1]],
  tools: [
    ["hammer", 0.45, 1, 1], ["axe", 0.2, 1, 1], ["crowbar", 0.2, 1, 1],
    ["lockpick", 0.2, 1, 1], ["batteries", 0.55, 1, 2], ["cloth", 0.45, 1, 2],
  ],
  pharmacy: [
    ["bandage", 0.86, 1, 2], ["disinfectant", 0.65, 1, 1], ["painkillers", 0.68, 1, 2],
    ["antibiotics", 0.34, 1, 1], ["cloth", 0.38, 1, 2],
  ],
  grocery: [
    ["water", 0.72, 1, 2], ["soda", 0.62, 1, 3], ["canned_beans", 0.66, 1, 2],
    ["bread", 0.4, 1, 1], ["apple", 0.48, 1, 2], ["can_opener", 0.22, 1, 1],
  ],
  police: [
    ["ammo_9mm", 0.62, 4, 14], ["ammo_38", 0.34, 3, 10], ["mag_9mm_12", 0.38, 1, 1],
    ["bandage", 0.38, 1, 1], ["motorcycle_helmet", 0.18, 1, 1], ["pistol_suppressor", 0.08, 1, 1],
  ],
  hunting: [
    ["shell_12g", 0.62, 2, 7], ["ammo_rifle", 0.5, 2, 7], ["hunting_scope", 0.24, 1, 1],
    ["shotgun_choke", 0.2, 1, 1], ["recoil_pad", 0.24, 1, 1], ["weapon_sling", 0.32, 1, 1],
  ],
  vehicle: [
    ["water", 0.3, 1, 1], ["soda", 0.34, 1, 2], ["canned_beans", 0.24, 1, 1],
    ["bread", 0.18, 1, 1], ["bandage", 0.14, 1, 1], ["painkillers", 0.08, 1, 1],
    ["cloth", 0.22, 1, 2], ["batteries", 0.2, 1, 2], ["can_opener", 0.08, 1, 1],
    ["ammo_9mm", 0.08, 2, 5], ["ammo_38", 0.05, 2, 4], ["lockpick", 0.05, 1, 1],
    ["work_jacket", 0.1, 1, 1], ["crowbar", 0.035, 1, 1], ["pistol_suppressor", 0.025, 1, 1],
  ],
  clothing: [
    ["work_jacket", 0.42, 1, 1], ["leather_jacket", 0.16, 1, 1], ["jeans", 0.42, 1, 1],
    ["canvas_bag", 0.22, 1, 1], ["hiking_pack", 0.08, 1, 1],
  ],
  corpse: [
    ["bandage", 0.2, 1, 1], ["painkillers", 0.14, 1, 1], ["batteries", 0.2, 1, 1],
    ["cloth", 0.38, 1, 1], ["ammo_9mm", 0.12, 2, 5],
  ],
};

export const OBJECT_LABELS = {
  cabinet: "Schrank",
  fridge: "Kühlschrank",
  shelf: "Regal",
  toolbox: "Werkzeugkiste",
  locker: "Spind",
  gunlocker: "Waffenschrank",
  door: "Tür",
  corpse: "Leiche",
  radio: "Kofferradio",
  groundloot: "Abgelegte Sachen",
  car: "Liegengebliebenes Fahrzeug",
  shed: "Schuppen",
  fence: "Zaun",
};
