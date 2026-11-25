/* Game Maker music: tiny step sequencer (lead, bass, drums) with 8 built-in songs and your own 16-step songs.
   MakerMusic.play(spec) / stop() / preview(spec) ; spec = { bpm, scale, root, wave, lead:[16], leadB?:[16], bass:[16], drums:[16] }
   lead/bass values: -1 = rest, 0..9 = step of the scale (7 = one octave up). drums: bitmask 1 kick, 2 snare, 4 hi-hat. */
(() => {
'use strict';
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], penta: [0, 2, 4, 7, 9, 12, 14],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], blues: [0, 3, 5, 6, 7, 10, 12],
};
const SCALE_NAMES = { major: 'Happy (major)', minor: 'Sad (minor)', harmonic: 'Spooky', penta: 'Easy (pentatonic)', dorian: 'Mysterious', phrygian: 'Dark', lydian: 'Dreamy', blues: 'Blues' };
const _ = -1;
const PRESETS = [
  { name: 'Adventure', bpm: 124, scale: 'major', root: 60, wave: 'square',
    lead: [0, _, 2, _, 4, _, 2, 4, 5, _, 4, _, 2, _, _, _], leadB: [4, _, 5, _, 7, _, 5, 4, 2, _, 4, _, 0, _, _, _],
    bass: [0, _, 0, _, 3, _, 3, _, 4, _, 4, _, 3, _, 1, _], drums: [5, 4, 6, 4, 5, 4, 6, 4, 5, 4, 6, 4, 5, 5, 6, 4] },
  { name: 'Spooky', bpm: 84, scale: 'harmonic', root: 57, wave: 'triangle',
    lead: [7, _, _, 6, _, _, 4, _, 5, _, _, 4, _, _, 2, _], leadB: [0, _, _, 1, _, _, 4, _, 6, _, _, 5, _, 4, _, _],
    bass: [0, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _], drums: [1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 2, 4] },
  { name: 'Chill', bpm: 92, scale: 'penta', root: 62, wave: 'sine',
    lead: [4, _, 3, _, 2, _, _, 1, 2, _, _, _, 0, _, _, _], leadB: [2, _, 3, _, 4, _, 5, _, 4, _, 3, _, 2, _, _, _],
    bass: [0, _, _, _, 2, _, _, _, 3, _, _, _, 1, _, _, _], drums: [1, 0, 4, 0, 2, 0, 4, 0, 1, 1, 4, 0, 2, 0, 4, 4] },
  { name: 'Boss fight', bpm: 152, scale: 'phrygian', root: 52, wave: 'sawtooth',
    lead: [0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 4, 3, 1, 0, 1, 3], leadB: [7, 7, 6, 4, 6, 4, 3, 1, 0, 0, 1, 3, 4, 3, 1, 0],
    bass: [0, 0, _, 0, 0, _, 1, _, 0, 0, _, 0, 3, _, 1, _], drums: [5, 4, 6, 4, 5, 5, 6, 4, 5, 4, 6, 4, 5, 5, 6, 6] },
  { name: 'Space', bpm: 108, scale: 'lydian', root: 60, wave: 'triangle',
    lead: [0, 2, 4, 7, 4, 2, 0, 2, 3, 5, 7, 9, 7, 5, 3, 5], leadB: [1, 3, 5, 8, 5, 3, 1, 3, 0, 2, 4, 7, 4, 2, 0, _],
    bass: [0, _, _, _, _, _, _, _, 3, _, _, _, _, _, _, _], drums: [1, 0, 4, 0, 0, 0, 4, 0, 1, 0, 4, 0, 0, 2, 4, 0] },
  { name: 'Castle', bpm: 112, scale: 'minor', root: 57, wave: 'square',
    lead: [0, _, 0, 2, 3, _, 2, 0, 4, _, 4, 3, 2, _, _, _], leadB: [5, _, 4, 3, 2, _, 3, 4, 2, _, 1, 2, 0, _, _, _],
    bass: [0, _, _, 0, 5, _, _, 5, 3, _, _, 3, 4, _, 4, _], drums: [1, 0, 4, 1, 2, 0, 4, 0, 1, 0, 4, 1, 2, 0, 6, 0] },
  { name: 'Race', bpm: 164, scale: 'major', root: 62, wave: 'square',
    lead: [7, 4, 2, 4, 7, 4, 2, 4, 8, 5, 3, 5, 8, 5, 3, 5], leadB: [9, 7, 4, 7, 9, 7, 4, 7, 8, 7, 5, 4, 2, 4, 5, 7],
    bass: [0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3], drums: [5, 4, 6, 4, 5, 4, 6, 4, 5, 4, 6, 4, 5, 4, 6, 6] },
  { name: 'Mystery', bpm: 90, scale: 'dorian', root: 59, wave: 'triangle',
    lead: [0, _, 2, _, 3, _, _, 5, 4, _, _, 3, 2, _, _, _], leadB: [3, _, 4, _, 6, _, _, 5, 4, _, 2, _, 0, _, _, _],
    bass: [0, _, _, _, 0, _, _, _, 3, _, _, _, 2, _, _, _], drums: [1, 0, 0, 4, 0, 0, 2, 0, 1, 0, 0, 4, 0, 0, 2, 4] },
];
let ac = null, timer = null, master = null, cur = null, step = 0, nextT = 0, noiseBuf = null;
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
    const len = ac.sampleRate * 0.4; noiseBuf = ac.createBuffer(1, len, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
const freq = (spec, deg, oct = 0) => { const sc = SCALES[spec.scale] || SCALES.major, n = sc.length, o = Math.floor(deg / n), k = ((deg % n) + n) % n; return 440 * Math.pow(2, ((spec.root || 60) + sc[k] + 12 * (o + oct) - 69) / 12); };
function note(t, f, dur, wave, vol) { const o = ac.createOscillator(), g = ac.createGain(); o.type = wave; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); }
function drum(t, kind) {
  if (kind === 1) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.18); return; }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = kind === 2 ? 1200 : 6000;
  const d = kind === 2 ? 0.14 : 0.04; g.gain.setValueAtTime(kind === 2 ? 0.45 : 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + d + 0.02);
}
function tick() {
  if (!cur || !ac) return;
  const spb = 60 / (cur.bpm || 120) / 4;
  while (nextT < ac.currentTime + 0.12) {
    const i = step % 16, bar = Math.floor(step / 16) % 2, lead = bar && cur.leadB ? cur.leadB : cur.lead;
    if (lead && lead[i] >= 0) note(nextT, freq(cur, lead[i]), spb * 1.7, cur.wave || 'square', cur.wave === 'sine' ? 0.32 : cur.wave === 'triangle' ? 0.3 : 0.12);
    if (cur.bass && cur.bass[i] >= 0) note(nextT, freq(cur, cur.bass[i], -2), spb * 1.9, 'triangle', 0.34);
    const dm = cur.drums ? cur.drums[i] : 0; if (dm & 1) drum(nextT, 1); if (dm & 2) drum(nextT, 2); if (dm & 4) drum(nextT, 4);
    if (cur.onStep) try { cur.onStep(i); } catch {}
    nextT += spb; step++;
  }
}
function play(spec) {
  stop(); if (!spec) return; if (!ctx()) return;
  cur = spec; step = 0; nextT = ac.currentTime + 0.06; master.gain.value = spec.vol == null ? 0.22 : spec.vol; timer = setInterval(tick, 25); tick();
}
function stop() { if (timer) clearInterval(timer); timer = null; cur = null; }
/** what a game's settings ask for: 0 none, 1..8 a built-in song, 'custom' the game's own song */
function specFor(game) { const m = game && game.settings && game.settings.music; if (m === 'custom' && game.music) return game.music; const n = +m; return n > 0 && PRESETS[n - 1] ? PRESETS[n - 1] : null; }
function blank() { return { name: 'My song', bpm: 120, scale: 'major', root: 60, wave: 'square', lead: Array(16).fill(-1), bass: Array(16).fill(-1), drums: Array(16).fill(0) }; }
function clean(m) {
  if (!m || typeof m !== 'object') return null; const arr = (a, lo, hi, d) => Array.from({ length: 16 }, (_, i) => { const v = Array.isArray(a) ? Math.round(+a[i]) : d; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; });
  return { name: String(m.name || 'My song').slice(0, 40), bpm: Math.max(50, Math.min(200, +m.bpm || 120)), scale: SCALES[m.scale] ? m.scale : 'major', root: Math.max(45, Math.min(72, +m.root || 60)), wave: ['square', 'triangle', 'sine', 'sawtooth'].includes(m.wave) ? m.wave : 'square', lead: arr(m.lead, -1, 9, -1), bass: arr(m.bass, -1, 6, -1), drums: arr(m.drums, 0, 7, 0) };
}
window.MakerMusic = { PRESETS, SCALES, SCALE_NAMES, play, stop, specFor, blank, clean, get playing() { return !!cur; } };
})();
