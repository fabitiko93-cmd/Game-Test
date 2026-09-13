import { BACKGROUNDS, ITEMS, SKILLS } from "./data.js";
import { addItem, damageProtection, equipItem, equipmentProtection, createItem } from "./inventory.js";
import { clamp, uid } from "./util.js";

const RANKS = [
  [90, "MEISTERHAFT"],
  [70, "EXPERTE"],
  [50, "GEÜBT"],
  [30, "ERFAHREN"],
  [15, "VERTRAUT"],
  [0, "UNGEÜBT"],
];

export function cleanCharacterName(value) {
  const name = String(value || "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 18);
  return name || "Alex";
}

export function createPlayer({ name, background = "citizen", survivorNumber = 1 } = {}) {
  const origin = BACKGROUNDS[background] || BACKGROUNDS.citizen;
  const player = {
    id: uid("survivor"),
    name: cleanCharacterName(name),
    background,
    survivorNumber,
    x: 8,
    y: 36,
    facingX: 0,
    facingY: -1,
    hp: 100,
    stamina: 100,
    hunger: 84,
    thirst: 80,
    pain: 0,
    painRelief: 0,
    moving: false,
    running: false,
    stance: "walk",
    noisePulse: 0,
    visibilityPulse: 0,
    hurtFlash: 0,
    baseCapacity: 8 + (origin.carryBonus || 0),
    inventory: [],
    equipment: { mainHand: null, offHand: null, head: null, torso: null, legs: null, back: null },
    skills: { ...origin.skills },
    wounds: [],
    infectionStage: 0,
    kills: 0,
    shots: 0,
    combat: {
      enabled: false,
      targetId: null,
      attackCooldown: 0,
      attackTimer: 0,
      pendingAttack: 0,
      pendingTargetId: null,
      aim: 0,
      recoil: 0,
    },
    navigation: {
      path: [],
      destination: null,
      interactionId: null,
      runRequested: false,
      guided: false,
      manualUntil: 0,
    },
    dead: false,
    deathCause: null,
  };

  const jacket = createItem("work_jacket");
  const jeans = createItem("jeans");
  const bag = createItem("canvas_bag");
  addItem(player, jacket);
  addItem(player, jeans);
  addItem(player, bag);
  equipItem(player, jacket.id);
  equipItem(player, jeans.id);
  equipItem(player, bag.id);
  return player;
}

export function skillValue(player, skill) {
  return clamp(player.skills?.[skill] || 0, 0, 100);
}

export function skillRank(value) {
  return RANKS.find(([threshold]) => value >= threshold)?.[1] || "UNGEÜBT";
}

export function gainSkill(player, skill, baseAmount, meaningful = true) {
  if (!meaningful || !SKILLS[skill] || player.dead) return 0;
  const current = skillValue(player, skill);
  const gained = Math.max(0.015, baseAmount * (1 - current / 118));
  player.skills[skill] = clamp(current + gained, 0, 100);
  return gained;
}

export function protectionForAttack(player, zone) {
  return equipmentProtection(player, zone);
}

const WOUND_DATA = {
  scratch: { label: "KRATZER", infection: 0.05, damage: 3, bleed: 0.026 },
  laceration: { label: "RISSWUNDE", infection: 0.2, damage: 7, bleed: 0.065 },
  bite: { label: "BISSWUNDE", infection: 1, damage: 11, bleed: 0.09 },
};

const ZONES = [
  ["torso", "OBERKÖRPER"],
  ["arms", "ARME"],
  ["legs", "BEINE"],
  ["head", "KOPF"],
];

function downgradeWound(type) {
  if (type === "bite") return "laceration";
  if (type === "laceration") return "scratch";
  return null;
}

export function inflictZombieAttack(player, gameMinutes, random = Math.random, danger = 0) {
  const zoneEntry = ZONES[Math.floor(random() * ZONES.length)];
  const zone = zoneEntry[0];
  const protection = protectionForAttack(player, zone);
  const rawDamage = 4 + random() * 5.5;
  player.hp = Math.max(0, player.hp - rawDamage * (1 - protection * 0.45));
  player.hurtFlash = 0.24;

  const woundChance = clamp(0.64 + danger * 0.15 - protection * 0.62, 0.18, 0.85);
  if (random() > woundChance) {
    damageProtection(player, zone, 1.5);
    return { kind: "bruise", zone, label: `TREFFER · ${zoneEntry[1]}`, damage: rawDamage };
  }

  const severity = random();
  let type = severity < 0.11 + danger * 0.08 ? "bite" : severity < 0.43 ? "laceration" : "scratch";
  if (protection > 0 && random() < protection) type = downgradeWound(type);
  damageProtection(player, zone, type === "bite" ? 12 : type === "laceration" ? 7 : 4);
  if (!type) return { kind: "blocked", zone, label: "KLEIDUNG HAT DEN ANGRIFF ABGEFANGEN", damage: rawDamage };

  const definition = WOUND_DATA[type];
  const zombieInfected = random() < definition.infection;
  const normalInfected = !zombieInfected && random() < (type === "scratch" ? 0.08 : 0.16);
  const symptomAt = gameMinutes + 150 + random() * 150;
  const deathAt = gameMinutes + 720 + random() * 720;
  const wound = {
    id: uid("wound"),
    type,
    zone,
    zoneLabel: zoneEntry[1],
    createdAt: gameMinutes,
    ageMinutes: 0,
    bleed: definition.bleed,
    bandaged: false,
    disinfected: false,
    normalInfected,
    zombieInfected,
    symptomAt,
    deathAt,
  };
  player.wounds.push(wound);
  player.hp = Math.max(0, player.hp - definition.damage);
  player.pain = clamp(player.pain + definition.damage * 1.7, 0, 100);
  return {
    kind: type,
    zone,
    wound,
    damage: rawDamage + definition.damage,
    label: `${definition.label} · ${zoneEntry[1]}`,
  };
}

export function updateCharacter(player, realDelta, gameDeltaMinutes, gameMinutes) {
  let bleeding = 0;
  let infectionStage = 0;
  let normalInfection = false;
  for (const wound of player.wounds) {
    wound.ageMinutes += gameDeltaMinutes;
    const bleed = wound.bleed * (wound.bandaged ? 0.08 : 1);
    bleeding += bleed;
    if (wound.normalInfected && !wound.disinfected) normalInfection = true;
    if (wound.zombieInfected && gameMinutes >= wound.symptomAt) {
      const stage = clamp((gameMinutes - wound.symptomAt) / Math.max(1, wound.deathAt - wound.symptomAt), 0, 1);
      infectionStage = Math.max(infectionStage, stage);
      if (gameMinutes >= wound.deathAt) {
        player.hp = 0;
        player.deathCause = "DIE INFEKTION HAT DICH ÜBERWÄLTIGT";
      }
    }
  }
  if (bleeding > 0) player.hp = Math.max(0, player.hp - bleeding * realDelta * 8);
  if (normalInfection) player.hp = Math.max(0, player.hp - 0.014 * realDelta);
  if (infectionStage > 0) {
    player.hp = Math.max(0, player.hp - infectionStage * 0.075 * realDelta);
    player.thirst = Math.max(0, player.thirst - infectionStage * 0.12 * realDelta);
    player.stamina = Math.min(player.stamina, 100 - infectionStage * 55);
  }
  player.infectionStage = infectionStage;
  player.painRelief = Math.max(0, player.painRelief - realDelta);
  const relief = player.painRelief > 0 ? 0.35 : 1;
  player.pain = Math.max(0, player.pain - 0.32 * realDelta / relief);
  return { bleeding, infectionStage, normalInfection, dead: player.hp <= 0 };
}

export function treatWithItem(player, itemType) {
  if (itemType === "bandage" || itemType === "cloth") {
    const wound = [...player.wounds]
      .filter(entry => !entry.bandaged && entry.bleed > 0)
      .sort((a, b) => b.bleed - a.bleed)[0];
    if (!wound) return { used: false, message: "KEINE OFFENE BLUTUNG" };
    wound.bandaged = true;
    if (itemType === "cloth") wound.bleed *= 1.35;
    gainSkill(player, "firstAid", itemType === "bandage" ? 0.7 : 0.45);
    return { used: true, message: `${WOUND_DATA[wound.type].label} VERBUNDEN` };
  }

  if (itemType === "disinfectant") {
    const wound = [...player.wounds]
      .filter(entry => !entry.disinfected)
      .sort((a, b) => b.bleed - a.bleed)[0];
    if (!wound) return { used: false, message: "KEINE UNVERSORGTE WUNDE" };
    wound.disinfected = true;
    wound.normalInfected = false;
    gainSkill(player, "firstAid", 0.45);
    return { used: true, message: "WUNDE DESINFIZIERT" };
  }

  if (itemType === "antibiotics") {
    const infection = player.wounds.find(wound => wound.normalInfected);
    if (!infection) return { used: false, message: "KEINE BEHANDELBARE INFEKTION" };
    infection.normalInfected = false;
    gainSkill(player, "firstAid", 0.35);
    return { used: true, message: "BAKTERIELLE INFEKTION BEHANDELT" };
  }

  if (itemType === "painkillers") {
    player.painRelief = Math.max(player.painRelief, 90);
    player.stamina = clamp(player.stamina + 10, 0, 100);
    return { used: true, message: "SCHMERZEN GEDÄMPFT" };
  }
  return { used: false, message: "DAS HILFT JETZT NICHT" };
}

export function visibleInfectionState(player) {
  if (!player.wounds.some(wound => wound.zombieInfected)) return null;
  const medicalKnowledge = skillValue(player, "firstAid");
  if (player.infectionStage <= 0 && medicalKnowledge < 70) return null;
  if (player.infectionStage < 0.28) return medicalKnowledge >= 45 ? "VERDÄCHTIGE SYMPTOME" : "FIEBRIG";
  if (player.infectionStage < 0.65) return "FORTSCHREITENDE INFEKTION";
  return "TERMINALE INFEKTION";
}

export function woundDisplay(wound, player) {
  const definition = WOUND_DATA[wound.type];
  const details = [definition.label, wound.zoneLabel];
  if (wound.bandaged) details.push("VERBUNDEN");
  if (wound.normalInfected && (wound.ageMinutes > 120 || skillValue(player, "firstAid") >= 30)) details.push("ENTZÜNDET");
  return details.join(" · ");
}

export function backgroundName(player) {
  return BACKGROUNDS[player.background]?.name || BACKGROUNDS.citizen.name;
}

export function itemCanTreat(item) {
  return ["bandage", "cloth", "disinfectant", "antibiotics", "painkillers"].includes(item?.type)
    || Boolean(ITEMS[item?.type]?.medical);
}
