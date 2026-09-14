import { strongestNoise, visionExposure } from "./perception.js?v=8";
import { VIEW } from "./config.js?v=8";
import { clamp, distance, uid } from "./util.js?v=8";

const INITIAL_POSITIONS = [
  [14, 18], [9, 21], [24, 20], [36, 20], [43, 18], [31, 9],
  [31, 39], [10, 29], [14, 40], [27, 29], [42, 29], [8, 15],
  [20, 16], [40, 15], [26, 42], [46, 42], [5, 26], [22, 27],
];

export function createZombie(x, y, index = 0, id = null) {
  const maxHp = 62 + (index % 4) * 6;
  return {
    id: id || uid("zombie"),
    name: "INFIZIERTER",
    x,
    y,
    spawnX: x,
    spawnY: y,
    hp: maxHp,
    maxHp,
    state: "idle",
    stateTime: Math.random() * 2,
    stateTimer: 0,
    awareness: 0,
    lastSeen: null,
    lastNoiseId: null,
    target: null,
    wanderTarget: null,
    path: [],
    repathTimer: 0,
    facingX: 0,
    facingY: 1,
    desiredFacingX: 0,
    desiredFacingY: 1,
    stimulus: null,
    moving: false,
    attackCooldown: 0,
    attackWindup: 0,
    hurtFlash: 0,
    hitKick: 0,
    phase: Math.random() * 6,
    variant: index % 5,
    removed: false,
  };
}

export function createInitialZombies() {
  return INITIAL_POSITIONS.map(([x, y], index) => createZombie(x, y, index, `zombie-${index + 1}`));
}

export class ZombieSystem {
  constructor(navigator) {
    this.navigator = navigator;
  }

  update(game, delta) {
    let nearbyUndetected = false;
    for (const zombie of game.zombies) {
      if (zombie.removed) continue;
      zombie.hurtFlash = Math.max(0, (zombie.hurtFlash || 0) - delta);
      zombie.hitKick = Math.max(0, (zombie.hitKick || 0) - delta * 7.5);
      zombie.attackCooldown = Math.max(0, (zombie.attackCooldown || 0) - delta);
      zombie.stateTime = (zombie.stateTime || 0) + delta;
      zombie.stateTimer = Math.max(0, (zombie.stateTimer || 0) - delta);
      zombie.repathTimer = Math.max(0, (zombie.repathTimer || 0) - delta);
      this.updateFacing(zombie, delta);
      const playerDistance = distance(zombie, game.player);
      const exposure = game.player.dead ? 0 : visionExposure(zombie, game.player, game.world, game.minutes);

      this.updateHearing(zombie, game);
      this.updateAwareness(zombie, game, delta, exposure);
      this.updateState(zombie, game, exposure);
      this.updateMovement(zombie, game, delta);
      this.updateAttack(zombie, game, delta, playerDistance, exposure);

      if (playerDistance < 5.5 && exposure > 0 && zombie.state !== "chase" && zombie.awareness < 0.7) {
        nearbyUndetected = true;
      }
    }
    return { nearbyUndetected };
  }

  updateAwareness(zombie, game, delta, exposure) {
    if (exposure > 0) {
      zombie.stimulus = "vision";
      zombie.awareness = clamp((zombie.awareness || 0) + delta * (0.22 + exposure * 0.96), 0, 1);
      zombie.lastSeen = { x: game.player.x, y: game.player.y };
      if (zombie.awareness >= 1) {
        this.setState(zombie, "chase", 0);
        zombie.target = { ...zombie.lastSeen };
      } else if (zombie.awareness >= 0.18 && zombie.state === "idle") {
        this.setState(zombie, "suspicious", 2.4);
        zombie.target = null;
      }
    } else {
      const decay = zombie.state === "suspicious" ? 0.075 : 0.035;
      zombie.awareness = clamp((zombie.awareness || 0) - delta * decay, 0, 1);
    }
  }

  updateHearing(zombie, game) {
    const heard = strongestNoise(zombie, game.world.noises);
    if (!heard || heard.noise.id === zombie.lastNoiseId || zombie.state === "chase") return;
    zombie.lastNoiseId = heard.noise.id;
    zombie.stimulus = "sound";
    zombie.lastSeen = { x: heard.noise.x, y: heard.noise.y };
    zombie.target = { ...zombie.lastSeen };
    zombie.awareness = Math.max(zombie.awareness || 0, clamp(heard.score * 0.55, 0.16, 0.72));
    this.setState(zombie, "investigate", 5 + heard.score * 4);
  }

  updateState(zombie, game, exposure) {
    if (zombie.state === "chase") {
      if (exposure > 0) {
        zombie.target = { x: game.player.x, y: game.player.y };
        zombie.stateTimer = 1.1;
      } else if (zombie.stateTimer <= 0) {
        zombie.target = zombie.lastSeen ? { ...zombie.lastSeen } : null;
        this.setState(zombie, "search", 6.5);
      }
      return;
    }

    if (zombie.state === "suspicious") {
      if (zombie.lastSeen) this.face(zombie, zombie.lastSeen);
      if (zombie.awareness < 0.08 && zombie.stateTimer <= 0) this.setState(zombie, "idle", 0);
      return;
    }

    if (zombie.state === "investigate") {
      if (!zombie.target || distance(zombie, zombie.target) < 0.55 || zombie.stateTimer <= 0) {
        zombie.target = zombie.lastSeen ? {
          x: clamp(zombie.lastSeen.x + (game.random() - 0.5) * 3.5, 1, VIEW.worldW - 2),
          y: clamp(zombie.lastSeen.y + (game.random() - 0.5) * 3.5, 1, VIEW.worldH - 2),
        } : null;
        this.setState(zombie, "search", 5.5);
      }
      return;
    }

    if (zombie.state === "search") {
      if (zombie.stateTimer <= 0) {
        zombie.target = null;
        zombie.lastSeen = null;
        zombie.stimulus = null;
        zombie.awareness = Math.min(zombie.awareness, 0.08);
        this.setState(zombie, "idle", 0);
      } else if (!zombie.target || distance(zombie, zombie.target) < 0.45) {
        const center = zombie.lastSeen || zombie;
        zombie.target = {
          x: clamp(center.x + (game.random() - 0.5) * 4.5, 1, VIEW.worldW - 2),
          y: clamp(center.y + (game.random() - 0.5) * 4.5, 1, VIEW.worldH - 2),
        };
        zombie.repathTimer = 0;
      }
      return;
    }

    if (zombie.state === "idle" && zombie.stateTime > 2.8 + zombie.variant * 0.35) {
      zombie.stateTime = 0;
      zombie.wanderTarget = {
        x: clamp(zombie.spawnX + (game.random() - 0.5) * 7, 1, VIEW.worldW - 2),
        y: clamp(zombie.spawnY + (game.random() - 0.5) * 7, 1, VIEW.worldH - 2),
      };
      zombie.target = zombie.wanderTarget;
    }
  }

  updateMovement(zombie, game, delta) {
    if (zombie.state === "suspicious") {
      zombie.moving = false;
      return;
    }
    const target = zombie.target;
    if (!target) {
      zombie.moving = false;
      return;
    }
    if (zombie.repathTimer <= 0 || !zombie.path?.length) {
      zombie.path = this.navigator.findPath(game.world, zombie, target, { allowDoors: false, maxNodes: 1500 });
      zombie.repathTimer = zombie.state === "chase" ? 0.55 : 1.4;
    }
    const node = zombie.path?.[0];
    if (!node) {
      zombie.moving = false;
      return;
    }
    const dx = node.x - zombie.x;
    const dy = node.y - zombie.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.16) {
      zombie.path.shift();
      zombie.moving = false;
      return;
    }
    const nx = dx / length;
    const ny = dy / length;
    zombie.desiredFacingX = nx;
    zombie.desiredFacingY = ny;
    const speed = zombie.state === "chase" ? 1.1 : zombie.state === "investigate" ? 0.82 : zombie.state === "search" ? 0.58 : 0.36;
    zombie.moving = game.moveEntity(zombie, nx * speed * delta, ny * speed * delta, 0.25);
    if (!zombie.moving) zombie.repathTimer = 0;
  }

  updateAttack(zombie, game, delta, playerDistance, exposure) {
    if (zombie.attackWindup > 0) {
      zombie.attackWindup -= delta;
      if (zombie.attackWindup <= 0 && !game.player.dead && distance(zombie, game.player) < 1.02) {
        game.onZombieAttack(zombie);
      }
      return;
    }
    if (zombie.state !== "chase" || playerDistance >= 0.82 || exposure <= 0 || zombie.attackCooldown > 0) return;
    zombie.moving = false;
    zombie.attackCooldown = 1.42;
    zombie.attackWindup = 0.28;
    this.face(zombie, game.player);
  }

  face(zombie, target) {
    const dx = target.x - zombie.x;
    const dy = target.y - zombie.y;
    const length = Math.hypot(dx, dy) || 1;
    zombie.desiredFacingX = dx / length;
    zombie.desiredFacingY = dy / length;
  }

  updateFacing(zombie, delta) {
    const current = Math.atan2(zombie.facingY || 1, zombie.facingX || 0);
    const desired = Math.atan2(zombie.desiredFacingY ?? zombie.facingY ?? 1, zombie.desiredFacingX ?? zombie.facingX ?? 0);
    const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    const turnRate = zombie.state === "chase" ? 5.2 : 3.6;
    const next = current + clamp(difference, -turnRate * delta, turnRate * delta);
    zombie.facingX = Math.cos(next);
    zombie.facingY = Math.sin(next);
  }

  setState(zombie, state, timer = 0) {
    const changed = zombie.state !== state;
    zombie.state = state;
    zombie.stateTime = changed ? 0 : zombie.stateTime;
    zombie.stateTimer = timer;
    if (changed) zombie.repathTimer = 0;
  }

  spawnMigrant(game) {
    const edges = ["north", "east", "south", "west"];
    for (let attempt = 0; attempt < 30; attempt++) {
      const edge = edges[Math.floor(game.random() * edges.length)];
      let x = 1 + Math.floor(game.random() * (VIEW.worldW - 3));
      let y = 1 + Math.floor(game.random() * (VIEW.worldH - 3));
      if (edge === "north") y = 1;
      if (edge === "south") y = VIEW.worldH - 2;
      if (edge === "west") x = 1;
      if (edge === "east") x = VIEW.worldW - 2;
      if (!game.world.isPathCellWalkable(x, y, { allowDoors: false })) continue;
      const zombie = createZombie(x, y, game.zombies.length + 1);
      zombie.state = "investigate";
      zombie.target = { x: 31, y: 20 };
      zombie.stateTimer = 12;
      game.zombies.push(zombie);
      return zombie;
    }
    return null;
  }
}
