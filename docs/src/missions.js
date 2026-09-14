export const MISSIONS = [
  {
    title: "ERSTE VORRÄTE",
    objective: "Durchsuche den Küchenschrank",
    description: "Im Unterschlupf sollten noch Wasser, Verbände und eine brauchbare Waffe liegen.",
  },
  {
    title: "VERSIEGELTE MEDIZIN",
    objective: "Finde das versiegelte Medikament",
    description: "Der Funkspruch verweist auf die Apotheke im Südosten des Sperrkreises.",
  },
  {
    title: "RÜCKWEG",
    objective: "Kehre zum Unterschlupf zurück",
    description: "Bringe das Medikament lebend in den Unterschlupf am Waldrand.",
  },
  {
    title: "FREIES ÜBERLEBEN",
    objective: "Überlebe · deine Entscheidungen bleiben",
    description: "Der Sperrkreis ist offen. Plündere, verbessere deine Fähigkeiten und wähle deine Risiken selbst.",
  },
];

export function missionAt(index = 0) {
  const safeIndex = Math.max(0, Math.min(MISSIONS.length - 1, Number(index) || 0));
  return { ...MISSIONS[safeIndex], index: safeIndex };
}

export function missionSteps(index = 0) {
  const active = missionAt(index).index;
  return MISSIONS.map((mission, step) => ({
    ...mission,
    step,
    state: step < active ? "completed" : step === active ? "active" : "pending",
  }));
}
