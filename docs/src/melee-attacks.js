import { clamp } from './util.js';

export const CONTACT_EPSILON = 1e-7;
export const RETREAT_SKILL = 30;
export const RETREAT_DISTANCE = .32;

// Contacts refer to the original clip. The timeline retimes the approach to
// each contact together with the corresponding section of the animation.
const attacks = {
  unarmed: [{ clip: 'Punch_OneTwo', contact: .18 / 1.2, followUp: .56 / 1.2 }],
  kitchen_knife: [
    { clip: 'Knife_Stab', contact: .35 },
    { clip: 'Knife_Cut', contact: .33 },
  ],
  claw_hammer: [{ clip: 'Hammer_Slash', contact: .50 / 1.08, interrupts: true }],
};

export function meleeAttack(type, sequence) {
  const choices = attacks[type];
  return choices?.[(sequence - 1) % choices.length];
}

export function meleeTiming(profile, duration, skill) {
  const familiarity = clamp((skill - 7) / 23, 0, 1);
  const mastery = clamp((skill - RETREAT_SKILL) / (100 - RETREAT_SKILL), 0, 1);
  const startupScale = 1 - .20 * familiarity - .05 * mastery;
  const contacts = [profile.contact * duration * startupScale];
  if (profile.followUp) contacts.push(profile.followUp * duration * startupScale);
  const lastContact = contacts.at(-1);
  return {
    contacts,
    duration,
    startupScale,
    lockAt: Math.max(0, contacts[0] - .10),
    releaseAt: Math.min(duration, lastContact + .27 - .15 * familiarity - .04 * mastery),
  };
}

export function meleeProgress(attack, elapsed) {
  const { duration, startupScale, contacts } = attack;
  const last = contacts.at(-1);
  const authored = last / startupScale;
  const age = elapsed <= last ? elapsed / startupScale
    : authored + (duration - authored) * (elapsed - last) / (duration - last);
  return clamp(age / duration, 0, 1);
}

export function meleeMobility(attack, delta) {
  if (!attack) return 1;
  const age = attack.elapsed + delta / 2;
  if (age < attack.lockAt) return .55;
  const last = attack.contacts.at(-1);
  if (age < last) return .30;
  return .55 + .45 * clamp((age - last) / (attack.releaseAt - last), 0, 1);
}

export function inStrikeArc(from, to, direction, reach, arcCosine) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  return distance <= reach + CONTACT_EPSILON && dx * direction.x + dy * direction.y >= distance * arcCosine;
}
