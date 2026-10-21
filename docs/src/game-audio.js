
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
    magnum: [74, 0.32, "sawtooth"],
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
    gain.gain.setValueAtTime(kind === "magnum" ? 0.1 : kind === "gunshot" ? 0.07 : 0.035, game.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, game.audio.currentTime + preset[1]);
    oscillator.connect(gain).connect(game.audio.destination);
    oscillator.start();
    oscillator.stop(game.audio.currentTime + preset[1]);
    if(kind === "magnum") {
      const buffer=game.audio.createBuffer(1,Math.floor(game.audio.sampleRate*.16),game.audio.sampleRate),samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
      const noise=game.audio.createBufferSource(),filter=game.audio.createBiquadFilter(),crack=game.audio.createGain();
      noise.buffer=buffer;filter.type='lowpass';filter.frequency.value=3500;
      crack.gain.setValueAtTime(.11,game.audio.currentTime);crack.gain.exponentialRampToValueAtTime(.001,game.audio.currentTime+.16);
      noise.connect(filter).connect(crack).connect(game.audio.destination);noise.start();noise.stop(game.audio.currentTime+.16);
    }
  } catch (_) {
    // Audio is non-critical and can be disabled by iOS.
  }
}
