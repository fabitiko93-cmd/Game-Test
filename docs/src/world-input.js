
export function tapWorld(game, x, y) {
  if (!game.canAct()) return;
  const hit = game.renderer.pick(x, y);
  if (hit?.kind === "zombie") {
    game.combat.selectTarget(game, hit.ref);
    game.ui.showMessage(game.player.combat.enabled ? "Ziel erfasst" : "Ziel gewählt · Kampfmodus aktivieren", 1.4);
    return;
  }
  if (hit?.kind === "object") {
    if (game.renderer.selectedId === hit.id) {
      game.queueInteraction(hit.ref);
      return;
    }
    game.renderer.selectedId = hit.id;
    game.player.combat.targetId = null;
    game.ui.showMessage(hit.ref.name || "Objekt gewählt", 1.1);
    return;
  }
  game.renderer.selectedId = null;
  if (!game.player.combat.enabled) game.player.combat.targetId = null;
  game.setDestination(game.renderer.screenToWorld(x, y), { source: "manual" });
}

export function doubleTapWorld(game, x, y) {
  if (!game.canAct()) return;
  const hit = game.renderer.pick(x, y);
  if (hit?.kind === "object") {
    game.queueInteraction(hit.ref);
    return;
  }
  if (hit?.kind === "zombie") {
    game.combat.selectTarget(game, hit.ref);
    if (!game.player.combat.enabled) game.combat.toggle(game);
    return;
  }
  game.renderer.selectedId = null;
  game.setDestination(game.renderer.screenToWorld(x, y), { source: "manual", run: true });
}

export function startGuidedMovement(game, x, y, options = {}) {
  if (!game.canAct()) return;
  const hit = game.renderer.pick(x, y);
  game.holdBlocked = Boolean(hit);
  if (hit) {
    if (hit.kind === "zombie") game.combat.selectTarget(game, hit.ref);
    else game.renderer.selectedId = hit.id;
    return;
  }
  game.updateGuidedMovement(x, y, options);
}

export function updateGuidedMovement(game, x, y, options = {}) {
  if (game.holdBlocked || !game.canAct()) return;
  game.setDestination(game.renderer.screenToWorld(x, y), {
    source: "manual",
    guided: true,
    run: Boolean(options.run) && game.player.stance !== "sneak",
  });
}

export function endGuidedMovement(game) {
  if (!game.holdBlocked && game.player.navigation.guided) game.clearNavigation();
  game.holdBlocked = false;
}

export function startCameraPan(game) {
  if (!game.canAct()) return;
  if (game.player.navigation.guided) game.clearNavigation();
  game.renderer.beginPan();
}

export function panCamera(game, dx, dy) {
  if (!game.canAct()) return;
  game.renderer.panBy(dx, dy);
}

export function endCameraPan(game) {
  game.renderer.endPan();
}

export function recenterCamera(game) {
  if (!game.started) return;
  game.renderer.recenter(game.player);
  game.ui.showToast("KAMERA ZENTRIERT", 1.1);
}
