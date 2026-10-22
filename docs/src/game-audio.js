
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

// Short inharmonic resonances give a tiny metal object a distinct impact,
// independent of weapon/reload sounds. Attenuation and pan use the impact point.
export function casingImpactSound(game,position,strength=1,surface='hard'){
  const audio=game.audio;if(!audio)return;
  const distance=Math.hypot(position.x-game.player.x,position.y-game.player.y);
  const volume=.013*strength/Math.max(1,1+distance*1.8);if(volume<.0004)return;
  try{
    const bus=audio.createGain();bus.gain.value=volume;
    const pan=audio.createStereoPanner?.();
    if(pan){pan.pan.value=Math.max(-.85,Math.min(.85,((position.x-game.player.x)-(position.y-game.player.y))*.28));bus.connect(pan).connect(audio.destination);}else bus.connect(audio.destination);
    const now=audio.currentTime;
    for(const [hz,level,life]of [[3300,1,.055],[5700,.40,.035],[8200,.20,.022]]){
      const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=hz*(surface==='gravel'?.82:1);
      gain.gain.setValueAtTime(level,now);gain.gain.exponentialRampToValueAtTime(.001,now+life);
      oscillator.connect(gain).connect(bus);oscillator.start(now);oscillator.stop(now+life);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
    // Web Audio nodes disconnect only after their scheduled envelope finishes.
    setTimeout(()=>{bus.disconnect();pan?.disconnect();},150);
  }catch(_){/* iOS can suspend or disable audio without affecting simulation. */}
}
