// src/main.ts
// PartyLuz — luces de discoteca al ritmo de la música de otra aplicación.

import './styles/industrial.css';
import { getSystemAudioStream, getMicStream } from './captureAudio';
import { createBeatDetector, type BeatEnergies } from './beatDetector';
import { createLightEngine, PALETTES, type LightMode } from './lightEngine';
import { createAutoPilot, type AutoStatus } from './autoPilot';

// ---- Elementos del DOM ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const captureBtn = $<HTMLButtonElement>('captureBtn');
const micBtn = $<HTMLButtonElement>('micBtn');
const stopBtn = $<HTMLButtonElement>('stopBtn');
const fsBtn = $<HTMLButtonElement>('fsBtn');
const sensSlider = $<HTMLInputElement>('sensSlider');
const statusLed = $<HTMLSpanElement>('statusLed');
const statusText = $<HTMLSpanElement>('statusText');
const stage = $<HTMLDivElement>('stage');
const stageWrap = $<HTMLDivElement>('stageWrap');
const modeGrid = $<HTMLDivElement>('modeGrid');
const zoneGrid = $<HTMLDivElement>('zoneGrid');
const paletteGrid = $<HTMLDivElement>('paletteGrid');
const meterEls = {
  sub: $<HTMLDivElement>('mSub'),
  bass: $<HTMLDivElement>('mBass'),
  mid: $<HTMLDivElement>('mMid'),
  tre: $<HTMLDivElement>('mTre'),
};

const autoBtn = $<HTMLButtonElement>('autoBtn');
const autoStatus = $<HTMLDivElement>('autoStatus');
const modeSection = $<HTMLElement>('modeSection');
const paletteSection = $<HTMLElement>('paletteSection');

// ---- Motor de luces ----
const lights = createLightEngine(stage);
lights.setPanelCount(9);

// ---- Técnico de luces automático ----

const MODE_LABELS: Record<LightMode, string> = {
  flash: 'FLASH',
  alterno: 'ALTERNO',
  aleatorio: 'ALEATORIO',
  secuencia: 'SECUENCIA',
  strobe: 'ESTROBO',
};

function highlightMode(m: LightMode) {
  modeGrid.querySelectorAll<HTMLButtonElement>('.opt-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === m);
  });
}

const paletteButtons = new Map<string, HTMLButtonElement>();

function highlightPalette(name: string) {
  paletteButtons.forEach((btn, n) => btn.classList.toggle('active', n === name));
}

const auto = createAutoPilot({
  setMode(m) {
    lights.setMode(m);
    highlightMode(m);
  },
  setPalette(p) {
    lights.setPalette(p);
    highlightPalette(p.name);
  },
});

auto.setOnChange((s: AutoStatus) => {
  const bpmTxt = s.bpm ? ` · ${s.bpm} BPM` : '';
  autoStatus.textContent = `${s.section} · ${MODE_LABELS[s.mode]}${bpmTxt}`;
});

function setAutoUI(on: boolean) {
  autoBtn.textContent = on ? '◈ ON' : '◈ OFF';
  autoBtn.classList.toggle('active', on);
  modeSection.classList.toggle('locked', on);
  paletteSection.classList.toggle('locked', on);
  autoStatus.textContent = on ? 'EN ESPERA' : 'MANUAL';
}

// ---- Estado de audio ----
let audioCtx: AudioContext | null = null;
let stream: MediaStream | null = null;
let detector: ReturnType<typeof createBeatDetector> | null = null;
let rafId = 0;
let lastFrame = performance.now();

function setStatus(state: 'off' | 'live' | 'mic') {
  statusLed.className = 'led ' + (state === 'off' ? 'led-off' : 'led-on');
  statusText.textContent = state === 'off' ? 'OFF' : state === 'mic' ? 'MIC' : 'LIVE';
  captureBtn.disabled = state !== 'off';
  micBtn.disabled = state !== 'off';
  stopBtn.disabled = state === 'off';
}

async function start(source: 'system' | 'mic') {
  try {
    stream = source === 'system' ? await getSystemAudioStream() : await getMicStream();
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // canceló
    alert('No se pudo capturar el audio: ' + (err?.message ?? err));
    return;
  }

  audioCtx = new AudioContext();
  const srcNode = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  srcNode.connect(analyser);
  // No conectamos al destino: la música ya suena en la otra aplicación.

  detector = createBeatDetector(analyser, {
    onKickBeat: (e) => {
      auto.handleKick();
      lights.onKick(e);
    },
    onBassBeat: (e) => lights.onBass(e),
    onMidBeat: (e) => lights.onMid(e),
    onTrebleBeat: (e) => lights.onTreble(e),
    onEnergyPeak: (e) => {
      auto.handlePeak();
      lights.onPeak(e);
    },
  });
  detector.setSensitivity(Number(sensSlider.value) / 100);

  // Si el usuario deja de compartir desde el diálogo del navegador
  stream.getAudioTracks()[0].addEventListener('ended', stop);

  setStatus(source === 'mic' ? 'mic' : 'live');
  lastFrame = performance.now();
  loop();
}

function stop() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  audioCtx?.close();
  audioCtx = null;
  detector = null;
  setStatus('off');
  updateMeters({ subBass: 0, bass: 0, mid: 0, treble: 0, overall: 0 });
  if (auto.isEnabled()) autoStatus.textContent = 'EN ESPERA';
}

function updateMeters(e: BeatEnergies) {
  meterEls.sub.style.height = `${Math.min(100, e.subBass * 130)}%`;
  meterEls.bass.style.height = `${Math.min(100, e.bass * 130)}%`;
  meterEls.mid.style.height = `${Math.min(100, e.mid * 160)}%`;
  meterEls.tre.style.height = `${Math.min(100, e.treble * 200)}%`;
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (detector) {
    const energies = detector.tick();
    updateMeters(energies);
    auto.frame(dt, energies.overall);
  }
  lights.frame(dt);
}

// Bucle de reposo para que el decaimiento siga funcionando sin audio
function idleLoop() {
  if (!rafId) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    lights.frame(dt);
  }
  requestAnimationFrame(idleLoop);
}
idleLoop();

// ---- Controles ----

captureBtn.addEventListener('click', () => start('system'));
micBtn.addEventListener('click', () => start('mic'));
stopBtn.addEventListener('click', stop);

sensSlider.addEventListener('input', () => {
  detector?.setSensitivity(Number(sensSlider.value) / 100);
});

autoBtn.addEventListener('click', () => {
  const on = !auto.isEnabled();
  auto.setEnabled(on);
  setAutoUI(on);
});

modeGrid.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
  if (!btn) return;
  if (auto.isEnabled()) {
    auto.setEnabled(false);
    setAutoUI(false);
  }
  highlightMode(btn.dataset.mode as LightMode);
  lights.setMode(btn.dataset.mode as LightMode);
});

zoneGrid.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-zones]');
  if (!btn) return;
  zoneGrid.querySelectorAll('.opt-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  lights.setPanelCount(Number(btn.dataset.zones));
});

// Paleta: generar botones con muestra de colores
PALETTES.forEach((p, i) => {
  const btn = document.createElement('button');
  btn.className = 'palette-btn' + (i === 0 ? ' active' : '');
  btn.title = p.name;
  const stops = p.colors
    .map((c, j) => `${c} ${(j / p.colors.length) * 100}% ${((j + 1) / p.colors.length) * 100}%`)
    .join(', ');
  btn.style.setProperty('--swatch', `linear-gradient(90deg, ${stops})`);
  btn.addEventListener('click', () => {
    if (auto.isEnabled()) {
      auto.setEnabled(false);
      setAutoUI(false);
    }
    highlightPalette(p.name);
    lights.setPalette(p);
  });
  paletteButtons.set(p.name, btn);
  paletteGrid.appendChild(btn);
});

// ---- Pantalla completa ----

fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    stageWrap.requestFullscreen();
  }
});

stageWrap.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    // Mostrar la pista de salida unos segundos
    const hint = $<HTMLDivElement>('fsHint');
    hint.classList.add('visible');
    setTimeout(() => hint.classList.remove('visible'), 3000);
  }
});

setStatus('off');
setAutoUI(true);

// Gancho de depuración: permite disparar beats desde la consola sin audio
(window as any).__partyluz = { lights, auto };
