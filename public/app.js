/* AndEight — audio clock scheduler. Samples bundled under /samples. */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const SR = 48000;
const PRE_SHA = "d58301e4a494555f411a2afbc448b724136eee76";
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SAMPLE_NOTES = {
  piano: ["C2", "E2", "G2", "A2", "Bb2", "C3", "Db3", "E3", "Gb3", "G3", "Ab3", "A3", "Bb3", "C4", "Db4", "E4", "Gb4", "G4", "A4", "Bb4", "C5", "E5", "G5", "C6"],
  bass: ["E1", "G1", "A1", "Bb1", "C2", "E2", "G2", "A2", "Bb2", "C3", "E3", "G3", "A3"]
};

const state = {
  bpm: 92,
  key: "C",
  chordsText: "Am F C G",
  bars: 8,
  recipe: "stack",
  mutes: { piano: false, bass: false, kit: false }
};

const buffers = { piano: {}, bass: {}, kit: {} };
const raw = { piano: {}, bass: {}, kit: {} };
let ctx = null;
let master = null;
let chairGain = {};
let timerId = null;
let nextStepTime = 0;
let step = 0;
let playing = false;
const active = new Set();
let rafId = 0;
let loaded = false;
let missing = [];

const $ = (id) => document.getElementById(id);

function noteToMidi(name) {
  const m = name.match(/^([A-G])([b#]?)(-?\d)$/);
  if (!m) return 60;
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}
function midiToName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return NAMES[pc] + oct;
}
function pcOf(token) {
  const map = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  return map[token];
}
function parseChord(symbol) {
  const m = String(symbol).trim().match(/^([A-G](?:#|b)?)(.*)$/);
  if (!m || pcOf(m[1]) == null) return null;
  const root = pcOf(m[1]);
  const q = m[2].toLowerCase();
  let iv = [0, 4, 7];
  if (q.includes("dim")) iv = [0, 3, 6];
  else if (q.includes("aug")) iv = [0, 4, 8];
  else if (q.includes("sus2")) iv = [0, 2, 7];
  else if (q.includes("sus")) iv = [0, 5, 7];
  else if (q.startsWith("m") || q.includes("min")) iv = [0, 3, 7];
  return { root, iv, name: symbol.trim() };
}
function chords() {
  const parts = state.chordsText.split(/\s+/).filter(Boolean).slice(0, 4);
  const parsed = parts.map(parseChord).filter(Boolean);
  return parsed.length ? parsed : [parseChord("Am"), parseChord("F"), parseChord("C"), parseChord("G")];
}
function keyShift() {
  return pcOf(state.key) || 0;
}
function clampMidi(midi, lo, hi) {
  while (midi < lo) midi += 12;
  while (midi > hi) midi -= 12;
  return midi;
}

function bassLine(recipe) {
  const list = chords();
  const shift = keyShift();
  const bars = state.bars;
  const per = Math.max(1, Math.floor(bars / list.length));
  const notes = [];
  for (let bar = 0; bar < bars; bar++) {
    const ci = Math.min(list.length - 1, Math.floor(bar / per));
    const chord = list[ci];
    const next = list[Math.min(list.length - 1, Math.floor((bar + 1) / per) % list.length)];
    const nextRoot = clampMidi(40 + ((next.root + shift) % 12), 40, 52);
    for (let beat = 0; beat < 4; beat++) {
      const stepInChord = (bar % per) * 4 + beat;
      const root = clampMidi(40 + ((chord.root + shift) % 12), 40, 52);
      const third = clampMidi(root + chord.iv[1], 40, 55);
      const fifth = clampMidi(root + chord.iv[2], 40, 55);
      let midi = null;
      let dur = 0.9;
      if (recipe === "stack") {
        if (beat === 0 || beat === 2) { midi = root; dur = 0.45; }
      } else {
        if (beat === 0 || beat === 2) { midi = fifth; dur = 0.4; }
      }
      notes.push(midi == null ? null : { midi, dur });
    }
  }
  return notes;
}

function pianoVoicing(chord) {
  const shift = keyShift();
  const root = 60 + ((chord.root + shift) % 12);
  return chord.iv.map((iv) => clampMidi(root + iv, 52, 76));
}

function pick(voice, midi) {
  const table = SAMPLE_NOTES[voice];
  let best = table[0];
  let bestDist = 99;
  for (const name of table) {
    const dist = Math.abs(noteToMidi(name) - midi);
    if (dist < bestDist) { best = name; bestDist = dist; }
  }
  const sampleMidi = noteToMidi(best);
  const semis = Math.max(-4, Math.min(4, midi - sampleMidi));
  return { name: best, rate: Math.pow(2, semis / 12), midi: sampleMidi + semis };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("andeight") || "{}");
    Object.assign(state, saved);
    state.mutes = Object.assign({ piano: false, bass: false, kit: false }, saved.mutes || {});
  } catch (e) { /* keep defaults */ }
}
function saveState() {
  localStorage.setItem("andeight", JSON.stringify(state));
}

async function preload() {
  const jobs = [];
  for (const n of SAMPLE_NOTES.piano) jobs.push(["piano", n, "samples/piano/" + n + ".mp3", "acoustic grand piano"]);
  for (const n of SAMPLE_NOTES.bass) jobs.push(["bass", n, "samples/bass/" + n + ".mp3", "upright bass"]);
  jobs.push(["kit", "kick", "samples/drums/kick.mp3", "kick"]);
  jobs.push(["kit", "snare", "samples/drums/snare.mp3", "snare"]);
  jobs.push(["kit", "hat", "samples/drums/hihat.mp3", "hi-hat"]);
  missing = [];
  let done = 0;
  $("status").textContent = "Loading 0 / " + jobs.length;
  const ac = new AudioContext({ sampleRate: SR });
  await Promise.all(jobs.map(async (job) => {
    try {
      const res = await fetch(job[2]);
      if (!res.ok) throw new Error("http");
      const arr = await res.arrayBuffer();
      raw[job[0]][job[1]] = arr;
      buffers[job[0]][job[1]] = await ac.decodeAudioData(arr.slice(0));
    } catch (e) {
      missing.push(job[3] + " (" + job[1] + ")");
    }
    done += 1;
    $("status").textContent = "Loading " + done + " / " + jobs.length;
  }));
  await ac.close();
  loaded = missing.length === 0;
  $("missing").textContent = missing.length ? "Missing instruments: " + missing.join(", ") : "";
  $("status").textContent = loaded ? "Chairs seated · FluidR3 from PreEight " + PRE_SHA.slice(0, 7) : "Cannot play — sample holes";
}

function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: SR });
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -8;
    master.knee.value = 6;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.12;
    master.connect(ctx.destination);
    chairGain = {};
    ["piano", "bass", "kit"].forEach((id) => {
      const g = ctx.createGain();
      g.gain.value = id === "kit" ? 0.72 : id === "bass" ? 0.85 : 0.55;
      g.connect(master);
      chairGain[id] = g;
    });
  }
  return ctx;
}

function track(src) {
  active.add(src);
  src.onended = () => active.delete(src);
}

function playSample(ac, dest, when, buffer, rate, gain, dur, loop) {
  if (!buffer) return;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  if (loop && buffer.duration > 0.35) {
    src.loop = true;
    src.loopStart = Math.min(0.08, buffer.duration * 0.2);
    src.loopEnd = Math.min(buffer.duration - 0.03, src.loopStart + 0.28);
  }
  const g = ac.createGain();
  const rel = Math.max(0.012, Math.min(0.04, dur * 0.08));
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  g.gain.setValueAtTime(gain, when + Math.max(0.012, dur - rel));
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  src.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
  track(src);
}

function scheduleStep(stepIndex, when, ac, dests) {
  const beats = bassLine(state.recipe);
  const s = stepIndex % (state.bars * 16);
  const sixteenth = s % 16;
  const beat = Math.floor(s / 4);
  const bar = Math.floor(s / 16);
  const stepDur = 60 / state.bpm / 4;
  const list = chords();
  const per = Math.max(1, Math.floor(state.bars / list.length));
  const chord = list[Math.min(list.length - 1, Math.floor(bar / per))];
  if (!state.mutes.kit && dests.kit) {
    if (sixteenth === 0 || sixteenth === 8) playSample(ac, dests.kit, when, buffers.kit.kick, 1, sixteenth === 0 ? 0.7 : 0.5, 0.22, false);
    if (sixteenth === 4 || sixteenth === 12) playSample(ac, dests.kit, when, buffers.kit.snare, 1, 0.42, 0.2, false);
    if (sixteenth % 2 === 0) playSample(ac, dests.kit, when, buffers.kit.hat, 1, sixteenth % 4 === 0 ? 0.22 : 0.14, 0.08, false);
  }
  if (!state.mutes.piano && dests.piano && sixteenth === 0) {
    pianoVoicing(chord).forEach((midi, i) => {
      const p = pick("piano", midi);
      const buf = buffers.piano[p.name];
      playSample(ac, dests.piano, when, buf, p.rate, 0.28 - i * 0.03, stepDur * 4 * 0.96, true);
    });
  }
  if (!state.mutes.bass && dests.bass && (state.recipe === "stack" ? sixteenth % 8 === 0 : sixteenth % 8 === 2)) {
    const hit = beats[beat];
    if (hit) {
      const p = pick("bass", hit.midi);
      playSample(ac, dests.bass, when, buffers.bass[p.name], p.rate, 0.8, stepDur * 4 * hit.dur, true);
    }
  }
}

function scheduler() {
  if (!playing || !ctx) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextStepTime, ctx, chairGain);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars * 16);
  }
}

function stopAll() {
  playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  active.forEach((src) => { try { src.stop(); } catch (e) { /* already ended */ } });
  active.clear();
  $("play").textContent = "Play";
}

function start() {
  if (!loaded) return;
  const ac = ensureCtx();
  if (ac.state !== "running") ac.resume();
  stopAll();
  playing = true;
  nextStepTime = ac.currentTime + 0.1;
  step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  $("play").textContent = "Playing";
  $("tap").hidden = true;
}

function paint() {
  if (ctx && playing) {
    const origin = nextStepTime - (step * (60 / state.bpm / 4));
    const elapsed = ctx.currentTime - (origin - 0.1);
    const stepDur = 60 / state.bpm / 4;
    const pos = Math.floor(elapsed / stepDur) % (state.bars * 16);
    document.querySelectorAll(".cell").forEach((el) => {
      el.classList.toggle("now", Number(el.dataset.step) === ((pos % 16) + 16) % 16 && Number(el.dataset.bar) === Math.floor(pos / 16) % 2);
    });
  }
  rafId = requestAnimationFrame(paint);
}

function drawGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  const beats = bassLine(state.recipe);
  ["kit", "piano", "bass"].forEach((lane) => {
    const lab = document.createElement("div");
    lab.className = "lab";
    lab.textContent = lane;
    grid.appendChild(lab);
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement("div");
      cell.className = "cell " + lane;
      cell.dataset.step = String(i);
      cell.dataset.bar = "0";
      const beat = Math.floor(i / 4);
      if (lane === "kit" && (i === 0 || i === 4 || i === 8 || i === 12 || i % 2 === 0)) cell.classList.add("hit");
      if (lane === "piano" && i === 0) cell.classList.add("hit");
      if (lane === "bass" && ((state.recipe === "stack" && i % 8 === 0) || (state.recipe === "ands" && i % 8 === 2)) && beats[Math.floor(i / 4)]) cell.classList.add("hit");
      grid.appendChild(cell);
    }
  });
}

function collectHits(recipe) {
  const hits = [];
  const bars = state.bars;
  const total = bars * 16;
  const saved = state.recipe;
  state.recipe = recipe;
  const beats = bassLine(recipe);
  state.recipe = saved;
  const list = chords();
  const per = Math.max(1, Math.floor(bars / list.length));
  for (let s = 0; s < total; s++) {
    const when = s * (60 / state.bpm / 4);
    const sixteenth = s % 16;
    const beat = Math.floor(s / 4);
    const bar = Math.floor(s / 16);
    const chord = list[Math.min(list.length - 1, Math.floor(bar / per))];
    const stepDur = 60 / state.bpm / 4;
    if (!state.mutes.kit) {
      if (sixteenth === 0 || sixteenth === 8) hits.push({ when, chair: "kit", drum: "kick", gain: sixteenth === 0 ? 0.7 : 0.5, dur: 0.22 });
      if (sixteenth === 4 || sixteenth === 12) hits.push({ when, chair: "kit", drum: "snare", gain: 0.42, dur: 0.2 });
      if (sixteenth % 2 === 0) hits.push({ when, chair: "kit", drum: "hat", gain: sixteenth % 4 === 0 ? 0.22 : 0.14, dur: 0.08 });
    }
    if (!state.mutes.piano && sixteenth === 0) {
      pianoVoicing(chord).forEach((midi, i) => hits.push({ when, chair: "piano", midi, gain: 0.28 - i * 0.03, dur: stepDur * 4 * 0.96 }));
    }
    if (!state.mutes.bass && ((recipe === "stack" && sixteenth % 8 === 0) || (recipe === "ands" && sixteenth % 8 === 2)) && beats[beat]) {
      hits.push({ when, chair: "bass", midi: beats[beat].midi, gain: 0.8, dur: stepDur * 4 * beats[beat].dur });
    }
  }
  return hits;
}

function encodeWav24(interleaved, sampleRate) {
  const n = interleaved.length / 2;
  const buffer = new ArrayBuffer(44 + n * 2 * 3);
  const view = new DataView(buffer);
  const write = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + n * 6, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 6, true);
  view.setUint16(32, 6, true);
  view.setUint16(34, 24, true);
  write(36, "data");
  view.setUint32(40, n * 6, true);
  let o = 44;
  for (let i = 0; i < interleaved.length; i++) {
    let v = Math.max(-1, Math.min(1, interleaved[i]));
    let q = Math.round(v * 8388607);
    view.setUint8(o, q & 255);
    view.setUint8(o + 1, (q >> 8) & 255);
    view.setUint8(o + 2, (q >> 16) & 255);
    o += 3;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function renderWav(withTail) {
  const hits = collectHits(state.recipe);
  const length = Math.round(state.bars * 4 * 60 / state.bpm * SR);
  const tail = Math.round(1.4 * SR);
  const off = new OfflineAudioContext(2, length + tail, SR);
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  comp.connect(off.destination);
  const gains = {};
  for (const id of ["piano", "bass", "kit"]) {
    const g = off.createGain();
    g.gain.value = id === "kit" ? 0.72 : id === "bass" ? 0.85 : 0.55;
    g.connect(comp);
    gains[id] = g;
  }
  const decoded = { piano: {}, bass: {}, kit: {} };
  for (const voice of Object.keys(raw)) {
    for (const name of Object.keys(raw[voice])) {
      decoded[voice][name] = await off.decodeAudioData(raw[voice][name].slice(0));
    }
  }
  hits.forEach((h) => {
    let buffer, rate;
    if (h.drum) {
      buffer = decoded.kit[h.drum];
      rate = 1;
    } else {
      const p = pick(h.chair, h.midi);
      buffer = decoded[h.chair][p.name];
      rate = p.rate;
    }
    if (!buffer) return;
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    if (!h.drum && buffer.duration > 0.35) {
      src.loop = true;
      src.loopStart = Math.min(0.08, buffer.duration * 0.2);
      src.loopEnd = Math.min(buffer.duration - 0.03, src.loopStart + 0.28);
    }
    const g = off.createGain();
    const rel = Math.max(0.012, Math.min(0.04, h.dur * 0.08));
    g.gain.setValueAtTime(0.0001, h.when);
    g.gain.linearRampToValueAtTime(h.gain, h.when + 0.008);
    g.gain.setValueAtTime(h.gain, h.when + Math.max(0.01, h.dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, h.when + h.dur);
    src.connect(g);
    g.connect(gains[h.chair]);
    src.start(h.when);
    src.stop(h.when + h.dur + 0.02);
  });
  const rendered = await off.startRendering();
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  let onset = 0;
  for (let i = 0; i < Math.min(left.length, Math.round(0.03 * SR)); i++) {
    if (Math.abs(left[i]) > 0.001 || Math.abs(right[i]) > 0.001) { onset = i; break; }
  }
  const outL = new Float32Array(withTail ? length + tail : length);
  const outR = new Float32Array(outL.length);
  for (let i = 0; i < outL.length; i++) {
    outL[i] = left[i + onset] || 0;
    outR[i] = right[i + onset] || 0;
  }
  if (!withTail) {
    for (let i = 0; i < tail; i++) {
      outL[i] += left[length + onset + i] || 0;
      outR[i] += right[length + onset + i] || 0;
    }
  }
  let peak = 0;
  for (let i = 0; i < outL.length; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
  const target = Math.pow(10, -1 / 20);
  const scale = peak > target ? target / peak : 1;
  const interleaved = new Float32Array(outL.length * 2);
  for (let i = 0; i < outL.length; i++) {
    interleaved[i * 2] = outL[i] * scale;
    interleaved[i * 2 + 1] = outR[i] * scale;
  }
  return { blob: encodeWav24(interleaved, SR), samples: outL.length, peak, onset };
}

function midiBytes(hits) {
  const tracks = { piano: [], bass: [], kit: [] };
  hits.forEach((h) => {
    const midi = h.drum ? (h.drum === "kick" ? 36 : h.drum === "snare" ? 38 : 42) : h.midi;
    const ticks = Math.round(h.when * (state.bpm / 60) * 480);
    const dur = Math.max(1, Math.round(h.dur * (state.bpm / 60) * 480));
    tracks[h.chair].push({ ticks, dur, midi, vel: Math.round(Math.min(1, h.gain) * 110) + 10 });
  });
  function vlq(n) {
    const bytes = [n & 0x7f];
    n >>= 7;
    while (n) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
    return bytes;
  }
  function chunk(events) {
    const flat = [];
    events.forEach((ev) => {
      flat.push({ ticks: ev.ticks, bytes: [0x90, ev.midi & 127, ev.vel] });
      flat.push({ ticks: ev.ticks + ev.dur, bytes: [0x80, ev.midi & 127, 0] });
    });
    flat.sort((a, b) => a.ticks - b.ticks || a.bytes[0] - b.bytes[0]);
    let last = 0;
    const data = [];
    flat.forEach((ev) => {
      vlq(Math.max(0, ev.ticks - last)).forEach((b) => data.push(b));
      last = ev.ticks;
      ev.bytes.forEach((b) => data.push(b));
    });
    data.push(0x00, 0xff, 0x2f, 0x00);
    return data;
  }
  const uspq = Math.round(60000000 / state.bpm);
  const tempo = [0x00, 0xff, 0x51, 0x03, (uspq >> 16) & 255, (uspq >> 8) & 255, uspq & 255, 0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, 0x00, 0xff, 0x2f, 0x00];
  const parts = [tempo, chunk(tracks.piano), chunk(tracks.bass), chunk(tracks.kit)];
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, parts.length, 0x01, 0xe0];
  parts.forEach((data) => {
    out.push(0x4d, 0x54, 0x72, 0x6b, (data.length >> 24) & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255);
    data.forEach((b) => out.push(b));
  });
  return new Uint8Array(out);
}

function fileBase() {
  return "andeight-" + state.recipe + "-" + state.bpm + "bpm-" + state.key;
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function bind() {
  NAMES.forEach((n) => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    $("key").appendChild(o);
  });
  $("bpm").value = state.bpm;
  $("key").value = state.key;
  $("chords").value = state.chordsText;
  $("bars").value = state.bars;
  $("stack").classList.toggle("on", state.recipe === "stack");
  $("ands").classList.toggle("on", state.recipe === "ands");
  document.querySelectorAll("[data-mute]").forEach((btn) => {
    btn.classList.toggle("on", !state.mutes[btn.dataset.mute]);
    btn.textContent = (state.mutes[btn.dataset.mute] ? "Muted " : "") + btn.dataset.mute;
  });
  const pull = () => {
    state.bpm = Math.max(60, Math.min(180, Number($("bpm").value) || 92));
    state.key = $("key").value;
    state.chordsText = $("chords").value;
    state.bars = Math.max(4, Math.min(16, Number($("bars").value) || 8));
    saveState();
    drawGrid();
  };
  ["bpm", "key", "chords", "bars"].forEach((id) => $(id).addEventListener("input", pull));
  $("stack").onclick = () => { state.recipe = "stack"; saveState(); $("stack").classList.add("on"); $("ands").classList.remove("on"); drawGrid(); };
  $("ands").onclick = () => { state.recipe = "ands"; saveState(); $("ands").classList.add("on"); $("stack").classList.remove("on"); drawGrid(); };
  document.querySelectorAll("[data-mute]").forEach((btn) => {
    btn.onclick = () => {
      state.mutes[btn.dataset.mute] = !state.mutes[btn.dataset.mute];
      saveState();
      btn.classList.toggle("on", !state.mutes[btn.dataset.mute]);
      btn.textContent = (state.mutes[btn.dataset.mute] ? "Muted " : "") + btn.dataset.mute;
    };
  });
  $("play").onclick = async () => {
    ensureCtx();
    if (ctx.state !== "running") await ctx.resume();
    $("tap").hidden = true;
    if (!playing) start();
  };
  $("stop").onclick = stopAll;
  $("export").onclick = async () => {
    if (!loaded) return;
    $("status").textContent = "Rendering…";
    const wav = await renderWav(false);
    download(wav.blob, fileBase() + ".wav");
    download(new Blob([midiBytes(collectHits(state.recipe))], { type: "audio/midi" }), fileBase() + ".mid");
    $("status").textContent = "Exported " + wav.samples + " samples @ " + SR + " Hz";
  };
  $("tail").onclick = async () => {
    if (!loaded) return;
    const wav = await renderWav(true);
    download(wav.blob, fileBase() + "-with-tail.wav");
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopAll();
  });
  drawGrid();
  requestAnimationFrame(paint);
}

window.AndEight = { state, renderWav, collectHits, bassLine, SR };
loadState();
bind();
preload();
