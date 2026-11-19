// Contact is a fraction of the rendered attack's duration.
const attacks = {
  unarmed: [{ clip: 'Punch_OneTwo', contact: .18 / 1.2 }],
  kitchen_knife: [
    { clip: 'Knife_Stab', contact: .35 },
    { clip: 'Knife_Cut', contact: .33 },
  ],
  claw_hammer: [{ clip: 'Hammer_Slash', contact: .50 / 1.08 }],
};

export function meleeAttack(type, sequence) {
  const choices = attacks[type];
  return choices?.[(sequence - 1) % choices.length];
}
