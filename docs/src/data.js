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
    short: "Leise und schlosskundig. Freifeldtarnung: geduckt 10 Sekunden verborgen, 30 Sekunden Cooldown. Außerhalb aktiver Verfolgung.",
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

  ak_762: firearm("AK · 7,62×39", "AK", {
    icon: "ak", weight: 3, hands: 2, damage: 62, range: 13, aimTime: 1.15, recovery: .24,
    accuracy: .76, headshot: .2, noise: 28, feed: "magazine", ammoType: "ammo_762x39",
    magazineTypes: ["mag_ak_30"], modSlots: ["stock", "optic", "muzzle"],
    fireModes: ["semi", "auto"], fireInterval: .1, recoilPerShot: .36, recoilRecovery: 1.35,
    aimRetention: .42, mobility: 1, penetration: 1, penetrationDamage: .6,
    description: "Schaftloses AK-Grundmodell. Schnell im Anschlag, kräftig im Rückstoß. Semi: tippen. Auto: SCHUSS halten. Magazine separat befüllen und einsetzen.",
  }),
  ammo_762x39: { name: "7,62×39-Patronen", short: "7,62×39", type: "ammo", icon: "ammo", ammoType: "ammo_762x39", weight: .05, roundWeight: .016, weightStep: .05, stack: 30, description: "Lose AK-Munition. Zum Befüllen ein separates 30er-Magazin auswählen. Das Stapelgewicht wird auf 50 g aufgerundet." },
  mag_ak_30: { name: "AK-30er-Magazin", short: "AK-Magazin", type: "magazine", icon: "magazine", ammoType: "ammo_762x39", capacity: 30, compatible: ["ak_762"], weight: .25, stack: 1, description: "Eigenständiges 30er-Magazin: 0–14 Patronen 250 g, ab 15 Patronen 300 g. Befüllen und Einsetzen sind getrennte Aktionen." },
  ak_fixed_stock: { name: "Fester AK-Schaft", short: "Fester Schaft", type: "mod", icon: "mod", modSlot: "stock", compatible: ["ak_762"], weight: .45, stack: 1, effects: { mobilityMul: .94, aimTimeMul: 1.12, recoilPerShotMul: .64, recoilRecoveryAdd: .6, aimRetentionAdd: .2 }, description: "450 g. Deutlich stabilerer Rückstoß; etwas langsamer im Anschlag und weniger beweglich." },
  ak_frame_stock: { name: "Duster-Rahmenschaft", short: "Duster-Schaft", type: "mod", icon: "mod", modSlot: "stock", compatible: ["ak_762", "m4_556"], weight: .35, stack: 1, effects: { mobilityMul: .97, aimTimeMul: 1.06, recoilPerShotMul: .8, recoilRecoveryAdd: .35, aimRetentionAdd: .12 }, description: "350 g. Offener Rahmenschaft: mittlere Stabilität bei weniger Gewicht und besserer Handhabung als der feste Schaft." },
  ak_acog_3x: { name: "Kompaktes ACOG 3×", short: "ACOG 3×", type: "mod", icon: "mod", modSlot: "optic", compatible: ["ak_762", "m4_556"], weight: .3, stack: 1, effects: { rangeAdd: 4, aimTimeMul: 1.1, closePenalty: .12, mobilityMul: .99 }, description: "300 g. Dreifachvisierung für mehr nutzbare Distanz; auf kürzeste Entfernung unhandlicher." },
  ak_suppressor: { name: "AK-Schalldämpfer", short: "AK-Dämpfer", type: "mod", icon: "mod", modSlot: "muzzle", compatible: ["ak_762"], weight: .4, stack: 1, effects: { noiseMul: .48, aimTimeMul: 1.08, mobilityMul: .98 }, description: "400 g. Reduziert den Schussknall, erhöht Länge und Gewicht. Schaden und Durchschlagskraft bleiben unverändert." },

  m4_556: firearm("M4 · 5,56×45", "M4", {
    icon: "m4", weight: 1.65, hands: 2, damage: 54, range: 14, aimTime: 1, recovery: .2,
    accuracy: .79, headshot: .22, noise: 27, feed: "magazine", ammoType: "ammo_556x45",
    magazineTypes: ["mag_m4_30"], modSlots: ["stock", "optic", "barrel", "muzzle"],
    defaultMods: {stock: "m4_stock", barrel: "m4_standard_barrel"}, requiredMods: {barrel: "LAUFMODUL"},
    fireModes: ["semi", "auto"], fireInterval: .085, recoilPerShot: .28, recoilRecovery: 1.5,
    aimRetention: .46, mobility: 1.04, penetration: 1, penetrationDamage: .6,
    description: "Modulares 5,56-Sturmgewehr. Grundausführung mit Schaft und Standardlauf, ohne Magazin. Komplettes Laufmodul austauschbar; beide Ausführungen verwenden dieselben Gewehrmagazine. Semi: tippen. Auto: SCHUSS halten.",
  }),
  ammo_556x45: { name: "5,56×45-Patronen", short: "5,56×45", type: "ammo", icon: "ammo", ammoType: "ammo_556x45", weight: .05, roundWeight: .012, weightStep: .05, stack: 30, description: "Lose M4-Gewehrmunition. Separate 30er-Magazine befüllen und anschließend einsetzen. Stapelgewicht in 50-g-Schritten." },
  mag_m4_30: { name: "M4-30er-Magazin", short: "M4-Magazin", type: "magazine", icon: "magazine", ammoType: "ammo_556x45", capacity: 30, compatible: ["m4_556"], weight: .15, stack: 1, description: "Separates 5,56-Gewehrmagazin. 0–14 Patronen: 150 g; ab 15 Patronen: 200 g. Passt zu beiden M4-Laufmodulen." },
  m4_standard_barrel: { name: "M4-Standardlaufmodul", short: "Standardlauf", type: "mod", icon: "mod", modSlot: "barrel", compatible: ["m4_556"], weight: .8, stack: 1, effects: {}, description: "800 g. Originales Oberteil der Grundausführung mit Lauf, geripptem Vorderschaft und Korn. Kann als Ganzes gewechselt werden; ohne Laufmodul kann die M4 nicht schießen." },
  m4_rail_barrel: { name: "M4-Schienenlaufmodul", short: "Schienenlauf", type: "mod", icon: "mod", modSlot: "barrel", compatible: ["m4_556"], weight: .7, stack: 1, effects: { rangeMul: .93, aimTimeMul: .94, mobilityMul: 1.025 }, description: "700 g. Originales Oberteil der zweiten Ausführung mit kürzerem Lauf und Schienenvorderschaft. Handlicher, etwas weniger Reichweite. Kaliber, Magazin, Schaden und Durchschlag bleiben gleich." },
  m4_stock: { name: "M4-Standardschaft", short: "M4-Schaft", type: "mod", icon: "mod", modSlot: "stock", compatible: ["m4_556"], weight: .35, stack: 1, effects: { recoilPerShotMul: .68, recoilRecoveryAdd: .45, aimRetentionAdd: .14, aimTimeMul: 1.08, mobilityMul: .97 }, description: "350 g. Abnehmbarer Originalschaft der M4. Stabilisiert Feuerstöße und den Anschlag. Alternative: Duster-Rahmenschaft." },
  m4_suppressor: { name: "M4-Schalldämpfer", short: "M4-Dämpfer", type: "mod", icon: "mod", modSlot: "muzzle", compatible: ["m4_556"], weight: .35, stack: 1, effects: { noiseMul: .48, aimTimeMul: 1.07, mobilityMul: .98 }, description: "350 g. Sitzt an der Mündung des jeweils montierten Laufmoduls. Reduziert den Schussknall; Schaden und Durchschlag bleiben unverändert." },

  vector_9mm: firearm("Vector · 9 mm", "Vector", {
    icon: "vector", weight: 2.2, hands: 2, damage: 40, range: 8.8, aimTime: .8, recovery: .16,
    accuracy: .75, headshot: .18, noise: 20, feed: "magazine", ammoType: "ammo_9mm",
    magazineTypes: ["mag_vector_33"], modSlots: ["stock", "optic", "foregrip", "muzzle"],
    fireModes: ["semi", "auto"], fireInterval: .075, recoilPerShot: .22, recoilRecovery: 2,
    aimRetention: .55, mobility: 1, penetration: 0,
    description: "Kompakte 9-mm-MP mit hoher Kadenz und begrenzter Reichweite. Semi: tippen. Auto: SCHUSS halten. Schaft, Leuchtpunktvisier, Vordergriff und Dämpfer sind abnehmbar; 33er-Magazine separat befüllen und einsetzen.",
  }),
  mag_vector_33: { name: "Vector-33er-Magazin", short: "Vector-Mag.", type: "magazine", icon: "magazine", ammoType: "ammo_9mm", capacity: 33, compatible: ["vector_9mm"], weight: .15, stack: 1, description: "Eigenständiges 9-mm-Magazin für die Vector. 0–16 Patronen: 150 g; 17–33 Patronen: 200 g. Befüllen und Wechseln sind getrennte Aktionen." },
  vector_stock: { name: "Vector-Klappschaft", short: "Vector-Schaft", type: "mod", icon: "mod", modSlot: "stock", compatible: ["vector_9mm"], weight: .4, stack: 1, effects: { recoilPerShotMul: .7, recoilRecoveryAdd: .4, aimRetentionAdd: .12, aimTimeMul: 1.08, mobilityMul: .97 }, description: "Abnehmbarer offener Schaft. Stabilisiert Feuerstöße, erhöht Gewicht und Länge und verlangsamt das Anlegen etwas." },
  vector_foregrip: { name: "Vector-Vordergriff", short: "Vordergriff", type: "mod", icon: "mod", modSlot: "foregrip", compatible: ["vector_9mm"], weight: .15, stack: 1, effects: { recoilPerShotMul: .85, recoilRecoveryAdd: .2, aimTimeMul: 1.03 }, description: "Senkrechter Vordergriff. Verbessert die Kontrolle längerer Feuerstöße; die Stützhand greift sichtbar um den montierten Griff." },
  vector_suppressor: { name: "Vector-Schalldämpfer", short: "Vector-Dämpfer", type: "mod", icon: "mod", modSlot: "muzzle", compatible: ["vector_9mm"], weight: .25, stack: 1, effects: { noiseMul: .46, aimTimeMul: 1.06, mobilityMul: .98 }, description: "Reduziert den Schussknall und verlängert die Waffe. Schaden und Durchschlag bleiben unverändert." },

  pistol_9mm: firearm("9-mm-Pistole", "Pistole", {
    weight: 0.86, hands: 1, damage: 44, range: 9.2, aimTime: 1.35, recovery: 0.48,
    accuracy: 0.72, headshot: 0.2, noise: 18, feed: "magazine",
    magazineTypes: ["mag_9mm_12", "mag_9mm_18"], modSlots: ["optic", "muzzle", "utility"],
    description: "Handlich und schnell im Anschlag. Benötigt ein geladenes Magazin.",
  }),
  revolver_44: firearm(".44-Magnum-Revolver", ".44 Magnum", {
    icon: "revolver", weight: .8, hands: 1, damage: 92, range: 8.4, aimTime: 1.5, recovery: .9,
    accuracy: .74, headshot: .24, noise: 32, shotSound: "magnum", feed: "internal", capacity: 6, ammoType: "ammo_44",
    recoilPerShot: 1, recoilRecovery: .7, aimRetention: .12, reload: 5, mobility: 1,
    modSlots: ["barrel", "grip", "optic", "utility"],
    defaultMods: {barrel: "revolver_short_barrel", grip: "revolver_wood_grip"},
    requiredMods: {barrel: "LAUFMODUL", grip: "GRIFF"},
    modRequirements: {optic: {barrel: ["revolver_rail_barrel"]}, utility: {barrel: ["revolver_rail_barrel"]}},
    description: "Sechs Schuss .44 Magnum: hoher Einzelschaden, lauter Knall und starker Rückstoß mit langsamer Erholung. Drei wechselbare Laufmodule und zwei Griffe. Erst der R4-Schienenlauf ermöglicht Rotpunkt und Waffenlampe. Kein Schalldämpfer.",
  }),
  revolver_short_barrel: { name: "Revolver-Kurzlauf · R1", short: "R1-Kurzlauf", type: "mod", icon: "mod", modSlot: "barrel", compatible: ["revolver_44"], weight: .2, stack: 1, effects: {}, description: "200 g. Kompakter Lauf mit offener Visierung. Handlich; keine Montageschiene für Aufsätze." },
  revolver_long_barrel: { name: "Revolver-Langlauf · R2", short: "R2-Langlauf", type: "mod", icon: "mod", modSlot: "barrel", compatible: ["revolver_44"], weight: .35, stack: 1, effects: { rangeAdd: 2.6, aimTimeMul: 1.08, mobilityMul: .96, recoilPerShotMul: .94 }, description: "350 g. Längerer Lauf samt offener Visierung: mehr nutzbare Reichweite, etwas ruhiger und schwerer. Keine Montageschiene." },
  revolver_rail_barrel: { name: "Revolver-Schienenlauf · R4", short: "R4-Schienenlauf", type: "mod", icon: "mod", modSlot: "barrel", compatible: ["revolver_44"], weight: .4, stack: 1, effects: { rangeAdd: 2.6, aimTimeMul: 1.12, mobilityMul: .94, recoilPerShotMul: .92 }, description: "400 g. Kräftiger Lauf mit Schiene und angepasster offener Visierung. Ermöglicht Rotpunkt und Waffenlampe. Beim Ausbau kehren Aufsätze automatisch in den Rucksack zurück." },
  revolver_wood_grip: { name: "Kompakter Revolvergriff", short: "Kompaktgriff", type: "mod", icon: "mod", modSlot: "grip", compatible: ["revolver_44"], weight: .15, stack: 1, effects: {}, description: "150 g. Einfacher kompakter Originalgriff aus R1. Mit allen drei Laufmodulen kombinierbar." },
  revolver_comfort_grip: { name: "Revolvergriff mit Griffschalen", short: "Schalengriff", type: "mod", icon: "mod", modSlot: "grip", compatible: ["revolver_44"], weight: .2, stack: 1, effects: { recoilPerShotMul: .85, recoilRecoveryAdd: .1 }, description: "200 g. Gemeinsamer Griff von R2/R4 samt seitlichen Griffschalen. Verbessert die Kontrolle; der kräftige Magnum-Rückstoß bleibt erhalten." },
  revolver_flashlight: { name: "Revolver-Waffenlampe", short: "Waffenlampe", type: "mod", icon: "mod", modSlot: "utility", compatible: ["revolver_44"], weight: .15, stack: 1, effects: {}, light: {range: 4.5, halfAngle: .32}, description: "150 g. Benötigt den R4-Schienenlauf. Leuchtet in Blickrichtung und wird von Wänden und geschlossenen Türen begrenzt. Im Zubehörmenü ein-/ausschaltbar; beim Montieren eingeschaltet." },
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

  ammo_9mm: { name: "9-mm-Patronen", short: "9 mm", type: "ammo", icon: "ammo", ammoType: "ammo_9mm", weight: 0.012, stack: 30, description: "Lose 9-mm-Munition für Pistole und Vector. Passende Wechselmagazine separat befüllen." },
  ammo_44: { name: ".44-Magnum-Patronen", short: ".44 Magnum", type: "ammo", icon: "ammo", ammoType: "ammo_44", weight: .05, roundWeight: .025, weightStep: .05, stack: 24, description: "Großkalibrige Revolvermunition. Bis zu sechs Patronen direkt in die Trommel nachladen. Lose Stapel werden in 50-g-Schritten gewogen." },
  shell_12g: { name: "Kaliber-12-Schrot", short: "12/70", type: "ammo", icon: "ammo", ammoType: "shell_12g", weight: 0.044, stack: 16, description: "Schrotpatronen für die Flinte." },
  ammo_rifle: { name: "Jagdpatronen", short: "Jagdpatr.", type: "ammo", icon: "ammo", ammoType: "ammo_rifle", weight: 0.026, stack: 20, description: "Büchsenmunition für das Jagdgewehr." },
  mag_9mm_12: { name: "9-mm-Magazin", short: "Magazin", type: "magazine", icon: "magazine", ammoType: "ammo_9mm", capacity: 12, compatible: ["pistol_9mm"], weight: 0.1, stack: 1, description: "Standardmagazin mit zwölf Patronen. Separat befüllen; ab halber Füllung 50 g schwerer." },
  mag_9mm_18: { name: "Verlängertes 9-mm-Magazin", short: "18er-Mag.", type: "magazine", icon: "magazine", ammoType: "ammo_9mm", capacity: 18, compatible: ["pistol_9mm"], weight: 0.15, stack: 1, description: "Separates Magazin mit achtzehn Patronen; ab halber Füllung 50 g schwerer." },

  reflex_sight: { name: "Leuchtpunktvisier", short: "Leuchtpunkt", type: "mod", icon: "mod", modSlot: "optic", compatible: ["pistol_9mm", "shotgun_12g", "vector_9mm", "revolver_44"], effects: { aimTimeMul: 0.78 }, weight: 0.14, stack: 1, description: "Beschleunigt die Zielerfassung auf kurze Distanz. Am Revolver nur mit R4-Schienenlauf montierbar." },
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

  outfit_top: { name: "Oberbekleidung", short: "Oberteil", type: "clothing", icon: "clothing", equipSlot: "torso", protection: 0.12, weight: 1.05, stack: 1, condition: 80, description: "Das bei Spielbeginn gewählte Oberteil. Begrenzter Bissschutz." },
  outfit_trousers: { name: "Hose", short: "Hose", type: "clothing", icon: "clothing", equipSlot: "legs", protection: 0.1, weight: 0.72, stack: 1, condition: 85, description: "Die bei Spielbeginn gewählte Beinkleidung." },
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
    ["revolver_rail_barrel", .05, 1, 1], ["revolver_long_barrel", .07, 1, 1], ["revolver_comfort_grip", .08, 1, 1], ["revolver_flashlight", .05, 1, 1],
    ["m4_556", .055, 1, 1], ["mag_m4_30", .15, 1, 1], ["ammo_556x45", .22, 6, 15],
    ["m4_rail_barrel", .04, 1, 1], ["m4_stock", .04, 1, 1], ["m4_suppressor", .025, 1, 1],
    ["vector_9mm", .035, 1, 1], ["mag_vector_33", .12, 1, 1],
    ["vector_stock", .04, 1, 1], ["vector_foregrip", .035, 1, 1], ["vector_suppressor", .02, 1, 1],
    ["ak_762", 0.08, 1, 1], ["mag_ak_30", 0.18, 1, 1], ["ammo_762x39", 0.26, 6, 15],
    ["ak_fixed_stock", 0.06, 1, 1], ["ak_frame_stock", 0.04, 1, 1], ["ak_acog_3x", 0.03, 1, 1], ["ak_suppressor", 0.025, 1, 1],
    ["ammo_9mm", 0.62, 4, 14], ["ammo_44", 0.34, 3, 10], ["mag_9mm_12", 0.38, 1, 1],
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
    ["ammo_9mm", 0.08, 2, 5], ["ammo_44", 0.05, 2, 4], ["lockpick", 0.05, 1, 1],
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
