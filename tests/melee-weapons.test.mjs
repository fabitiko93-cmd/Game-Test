import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlayer } from '../docs/src/character.js';
import { addItem, createItem, equipItem, weaponStats } from '../docs/src/inventory.js';
import { CombatSystem } from '../docs/src/combat.js';
import { PlayerModels } from '../docs/src/player-models.js';
import { QuaterniusAssets } from '../docs/src/quaternius-assets.js';
import { MELEE_GRIPS } from '../docs/src/melee-models.js';
import { meleeAttack } from '../docs/src/melee-attacks.js';
import { weaponTestLoadout } from '../docs/src/weapon-test-crate.js';
import { World } from '../docs/src/world.js';
import { Game } from '../docs/src/game.js';

const approved = JSON.parse(await readFile(new URL('./fixtures/melee-approved.json', import.meta.url)));
const library = new QuaterniusAssets({ loadAsset: async url => {
  const file = new URL(url).pathname.split('/').at(-1);
  const bytes = gunzipSync(await readFile(new URL('../docs/assets/quaternius/' + file, import.meta.url)));
  return new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
} });

function fixture(type = 'claw_hammer', sex = 'male') {
  const player = createPlayer({ appearance: { sex } });
  const weapon = createItem(type);
  addItem(player, weapon); equipItem(player, weapon.id);
  const target = { id: 'target', x: player.x, y: player.y + .6, state: 'chase', hp: 1000 };
  Object.assign(player.combat, { enabled: true, targetId: target.id });
  const game = {
    player, zombies: [target], elapsed: 0, random: () => .25,
    world: { emitNoise() {}, hasLineOfSight: () => true, blood: [] },
    renderer: { burst() {} }, ui: { showMessage() {}, setPaused() {}, hasBlockingPanel: () => false }, sound() {},
    input: { cancelPointer() {} }, save() {},
    approachCombatTarget() {},
  };
  game.combat = new CombatSystem();
  return { game, player, target, weapon, combat: game.combat };
}

const position = bone => bone.getWorldPosition(new Vector3());

test('the embedded hammer motion and attachment preserve the approved preview on both rigs', async () => {
  const models = new PlayerModels({}, library);
  await models.ready;
  for (const sex of ['male', 'female']) {
    const { player } = fixture('claw_hammer', sex);
    for (const type of sex === 'male' ? ['tshirt_grey', 'jeans_dark', 'sneakers_red'] : ['tshirt_white', 'trousers_rust', 'casual_shoes_f']) {
      const clothing = createItem(type); addItem(player, clothing); equipItem(player, clothing.id);
    }
    const entity = models.prepare(player, 0), grip = MELEE_GRIPS.claw_hammer[sex];
    assert.equal(entity.clip, 'Hammer_Idle');
    assert.equal(entity.weapon.geometry.attributes.position.count / 3, 348);
    assert.ok(Math.abs(entity.weapon.geometry.boundingBox.getSize(new Vector3()).z - .34) < 1e-6);
    for (const sample of approved[sex]) {
      models.pose(entity, { clip: 'Hammer_Slash', progress: sample.time / 1.08, delta: 1, yaw: 0 });
      for (const [name, expected] of Object.entries(sample.bones)) {
        const actual = position(entity.model.getObjectByName(name));
        assert.ok(actual.distanceTo(new Vector3(...expected)) < .00002, `${sex} ${name} at ${sample.time}`);
      }
      const head = entity.weapon.localToWorld(new Vector3(0, 0, -.29));
      assert.ok(head.distanceTo(new Vector3(...sample.hammerHead)) < .00002, `${sex} hammer attachment`);
      for (const [name, rotation] of Object.entries(grip.fingers)) {
        assert.deepEqual(entity.model.getObjectByName(name).quaternion.toArray(), rotation);
      }
    }
  }
});

test('rendering and damage share the hammer and alternating knife timeline at low frame rates', async () => {
  const models = new PlayerModels({}, library);
  await models.ready;
  for (const sex of ['male', 'female']) for (const type of ['claw_hammer', 'kitchen_knife']) for (const fps of [15, 20, 60]) {
    const { game, player, target, weapon, combat } = fixture(type, sex);
    models.prepare(player, 0);
    const hits = [], clips = [];
    let previousHp = target.hp;
    for (let frame = 1; frame <= Math.floor(weaponStats(weapon).cooldown * 1.9 * fps); frame++) {
      game.elapsed = frame / fps;
      combat.update(game, 1 / fps);
      const entity = models.prepare(player, game.elapsed), attack = player.combat.meleeAttack;
      if (clips.at(-1) !== entity.clip) clips.push(entity.clip);
      if (target.hp !== previousHp) {
        const profile = meleeAttack(type, attack.variant);
        assert.equal(entity.clip, profile.clip);
        assert.ok(entity.poseProgress >= profile.contact - 1e-6);
        assert.ok(entity.poseProgress < profile.contact + 1 / fps / attack.duration + 1e-6);
        hits.push(attack.sequence);
        previousHp = target.hp;
      }
    }
    assert.deepEqual(hits, [1, 2], `${sex} ${type} ${fps} FPS`);
    if (type === 'kitchen_knife') assert.deepEqual(clips.filter(c => c.startsWith('Knife_')), ['Knife_Stab', 'Knife_Cut']);
    const stats = weaponStats(weapon);
    const skill = player.skills[stats.skill] || 0;
    assert.ok(target.hp < 1000 - stats.damage, `${type} causes two hits`);
    assert.ok(player.stamina < 100 && skill > 0);
  }
});

test('a pending melee hit is discarded after interruptions, weapon swaps, or lost contact', () => {
  const scenarios = {
    swap({ player }) { const knife = createItem('kitchen_knife'); addItem(player, knife); equipItem(player, knife.id); },
    unequip({ player }) { player.equipment.mainHand = null; },
    run({ player }) { player.running = true; player.moving = true; },
    manual({ player }) { player.moving = true; player.navigation.source = 'manual'; },
    select({ game, combat, target }) { const next = { ...target, id: 'other' }; game.zombies.push(next); combat.selectTarget(game, next); },
    pause({ game }) { Game.prototype.setPaused.call(game, true); },
    death({ player }) { player.dead = true; },
    menu({ game }) { game.ui.hasBlockingPanel = () => true; },
    stop({ game, combat }) { combat.end(game); },
    distance({ target }) { target.y += 5; },
    wall({ game }) { game.world.hasLineOfSight = () => false; },
  };
  for (const type of ['claw_hammer', 'kitchen_knife']) for (const [name, interrupt] of Object.entries(scenarios)) {
    const state = fixture(type), { game, combat, target } = state;
    combat.update(game, .01);
    assert.ok(game.player.combat.pendingAttack > 0);
    interrupt(state);
    combat.update(game, .6);
    assert.equal(target.hp, 1000, `${type} ${name}`);
    assert.equal(game.world.blood.length, 0, `${type} ${name}`);
  }
});

test('hammer grip survives locomotion, crouching, aborts and a subsequent bare-hand attack', async () => {
  const models = new PlayerModels({}, library);
  await models.ready;
  for (const sex of ['male', 'female']) {
    const { game, player, weapon, combat } = fixture('claw_hammer', sex);
    const entity = models.prepare(player, 0);
    combat.update(game, .01);
    models.prepare(player, .01);
    combat.update(game, .4);
    models.prepare(player, .41);
    const fingers = MELEE_GRIPS.claw_hammer[sex].fingers;
    for (const [stance, moving, running, clip] of [
      ['walk', true, false, 'Walk'], ['walk', true, true, 'Run'],
      ['sneak', false, false, 'Crouch_Idle'], ['sneak', true, false, 'Crouch_Walk'],
      ['walk', false, false, 'Hammer_Idle'],
    ]) {
      Object.assign(player, { stance, moving, running });
      player.navigation.source = 'manual';
      game.elapsed += .1;
      combat.update(game, .1);
      models.prepare(player, game.elapsed);
      assert.equal(entity.clip, clip);
      for (const [name, value] of Object.entries(fingers)) assert.deepEqual(entity.model.getObjectByName(name).quaternion.toArray(), value);
      const wrist = position(entity.model.getObjectByName('WristR'));
      assert.ok(wrist.toArray().every(Number.isFinite));
      assert.ok(entity.weapon.localToWorld(new Vector3(0, 0, -.29)).y > -.02);
    }
    player.equipment.mainHand = null;
    Object.assign(player, { moving: false, running: false, stance: 'walk' });
    player.navigation.source = null;
    player.combat.attackCooldown = 0;
    combat.update(game, .01);
    models.prepare(player, game.elapsed + .01);
    assert.equal(entity.weapon, null);
    assert.equal(entity.clip, 'Punch_OneTwo');
    assert.equal(weapon.type, 'claw_hammer');
  }
});

test('a fresh world exposes the equipped hammer and knife in the test crate', () => {
  const world = new World(17), crate = world.objects.find(object => object.id === 'starter-weapon-test-crate');
  const loadout = weaponTestLoadout();
  for (const type of ['claw_hammer', 'kitchen_knife']) {
    assert.ok(loadout.some(item => item.type === type));
    assert.ok(crate.items.some(item => item.type === type));
  }
});
