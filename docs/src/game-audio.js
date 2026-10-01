
export function initAudio(game) {
  if (game.audio) return;
  try {
    game.audio = new AudioContext();
  } catch (_) {
    try {
      game.audio = new webkitAudioContext();
    } catch (_) {
      game.audio = null;
    }
  }
}

export function sound(game, kind) {
  if (!game.audio) return;
  const presets = {
    pickup: [660, 0.06, "sine"],
    equip: [240, 0.05, "square"],
    hide: [180, 0.08, "triangle"],
    consume: [420, 0.08, "sine"],
    door: [105, 0.12, "triangle"],
    unlock: [510, 0.05, "square"],
    lock: [180, 0.08, "square"],
    breach: [68, 0.2, "sawtooth"],
    swing: [180, 0.05, "sawtooth"],
    gunshot: [52, 0.2, "square"],
    reload: [320, 0.07, "square"],
    hit: [72, 0.1, "square"],
    execution: [110, 0.16, "triangle"],
    hurt: [55, 0.16, "sawtooth"],
    alert: [145, 0.13, "triangle"],
    objective: [520, 0.16, "sine"],
    success: [720, 0.25, "sine"],
    radio: [90, 0.3, "sawtooth"],
    death: [46, 0.6, "sawtooth"],
  };
  const preset = presets[kind];
  if (!preset) return;
  try {
    const oscillator = game.audio.createOscillator();
    const gain = game.audio.createGain();
    oscillator.type = preset[2];
    oscillator.frequency.setValueAtTime(preset[0], game.audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, preset[0] * 0.55), game.audio.currentTime + preset[1]);
    gain.gain.setValueAtTime(kind === "gunshot" ? 0.07 : 0.035, game.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, game.audio.currentTime + preset[1]);
    oscillator.connect(gain).connect(game.audio.destination);
    oscillator.start();
    oscillator.stop(game.audio.currentTime + preset[1]);
  } catch (_) {
    // Audio is non-critical and can be disabled by iOS.
  }
}
