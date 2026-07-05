// src/autoPilot.ts
// "Técnico de luces" automático: escucha la energía y el tempo de la música
// y decide solo el modo de luces, la paleta y los golpes de estrobo,
// igual que un técnico en cabina leyendo la pista de baile.

import { PALETTES, type LightMode, type Palette } from './lightEngine';

export type Section = 'SILENCIO' | 'CALMA' | 'RITMO' | 'FUERTE' | 'DROP';

export interface AutoStatus {
  section: Section;
  mode: LightMode;
  palette: string;
  bpm: number | null;
}

export interface AutoApply {
  setMode(m: LightMode): void;
  setPalette(p: Palette): void;
}

// Repertorio del técnico según la intensidad de la sección
const CALM_MODES: LightMode[] = ['secuencia', 'aleatorio'];
const GROOVE_MODES: LightMode[] = ['alterno', 'aleatorio', 'secuencia'];
const HARD_MODES: LightMode[] = ['flash', 'alterno'];

const CALM_PALETTES = ['OCÉANO', 'UV', 'BLANCO'];
const HARD_PALETTES = ['FIESTA', 'NEÓN', 'FUEGO'];

const MODE_DWELL_MIN = 6000;   // ms mínimos antes de cambiar de modo
const MODE_DWELL_MAX = 30000;  // ms máximos con el mismo modo (variedad)
const PALETTE_DWELL = 20000;   // ms mínimos entre cambios de paleta
const SECTION_STABLE = 2500;   // ms que una sección debe sostenerse para confirmarse
const STROBE_BURST = 2500;     // duración del golpe de estrobo en un drop

export function createAutoPilot(apply: AutoApply) {
  let enabled = true;

  // Seguimiento de energía: media corta (lo que suena ahora)
  // frente a media larga (el volumen típico de la canción)
  let emaShort = 0;
  let emaLong = 0.0001;

  // Estimación de BPM a partir de los intervalos entre kicks
  const kickTimes: number[] = [];
  let bpm: number | null = null;

  let section: Section = 'SILENCIO';
  let candidate: Section = 'SILENCIO';
  let candidateSince = 0;

  let mode: LightMode = 'aleatorio';
  let palette: Palette = PALETTES[0];
  let lastModeChange = 0;
  let lastPaletteChange = 0;
  let strobeUntil = 0;

  let onChange: ((s: AutoStatus) => void) | null = null;

  function status(): AutoStatus {
    return {
      section: performance.now() < strobeUntil ? 'DROP' : section,
      mode,
      palette: palette.name,
      bpm,
    };
  }

  function notify() {
    onChange?.(status());
  }

  function pickOther<T>(pool: T[], current: T): T {
    const others = pool.filter((x) => x !== current);
    if (others.length === 0) return current;
    return others[Math.floor(Math.random() * others.length)];
  }

  function poolFor(s: Section): LightMode[] {
    switch (s) {
      case 'CALMA': return CALM_MODES;
      case 'RITMO': return GROOVE_MODES;
      case 'FUERTE':
      case 'DROP': return HARD_MODES;
      default: return CALM_MODES;
    }
  }

  function palettePoolFor(s: Section): Palette[] {
    const names =
      s === 'CALMA' || s === 'SILENCIO' ? CALM_PALETTES :
      s === 'RITMO' ? PALETTES.map((p) => p.name) :
      HARD_PALETTES;
    return PALETTES.filter((p) => names.includes(p.name));
  }

  function switchMode(now: number) {
    mode = pickOther(poolFor(section), mode);
    lastModeChange = now;
    apply.setMode(mode);
    notify();
  }

  function switchPalette(now: number, force = false) {
    if (!force && now - lastPaletteChange < PALETTE_DWELL) return;
    palette = pickOther(palettePoolFor(section), palette);
    lastPaletteChange = now;
    apply.setPalette(palette);
    notify();
  }

  // ---- Eventos de beat (llamar siempre; solo cuentan para el análisis) ----

  function handleKick() {
    const now = performance.now();
    kickTimes.push(now);
    if (kickTimes.length > 12) kickTimes.shift();
    if (kickTimes.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < kickTimes.length; i++) {
        intervals.push(kickTimes[i] - kickTimes[i - 1]);
      }
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      // Solo tempos plausibles (40–240 BPM)
      if (median > 250 && median < 1500) bpm = Math.round(60000 / median);
    }
  }

  function handlePeak() {
    if (!enabled) return;
    const now = performance.now();
    // Un subidón con la pista ya fuerte o tempo rápido = drop → estrobo
    if (section === 'FUERTE' || (bpm ?? 0) >= 120) {
      strobeUntil = now + STROBE_BURST;
      mode = 'strobe';
      apply.setMode('strobe');
      notify();
    }
    // Los picos marcan cambio de sección: momento de refrescar la paleta
    switchPalette(now, true);
  }

  // ---- Análisis por frame ----

  function frame(dt: number, overall: number) {
    if (!enabled) return;
    const now = performance.now();

    // Medias móviles independientes del frame-rate
    const aShort = 1 - Math.exp(-dt / 1.5);
    const aLong = 1 - Math.exp(-dt / 25);
    emaShort += aShort * (overall - emaShort);
    emaLong += aLong * (overall - emaLong);

    // Olvidar el BPM si el ritmo se detuvo
    if (bpm !== null && kickTimes.length > 0 && now - kickTimes[kickTimes.length - 1] > 3000) {
      kickTimes.length = 0;
      bpm = null;
    }

    // Durante un golpe de estrobo no se toca nada
    if (now < strobeUntil) return;
    if (strobeUntil > 0 && now >= strobeUntil) {
      // El drop terminó: volver enseguida a un modo fuerte
      strobeUntil = 0;
      switchMode(now);
      return;
    }

    // Clasificar la sección actual comparando con el volumen típico
    let next: Section;
    if (emaShort < 0.02) {
      next = 'SILENCIO';
    } else {
      const ratio = emaShort / Math.max(emaLong, 0.02);
      if (ratio < 0.8) next = 'CALMA';
      else if (ratio < 1.2) next = 'RITMO';
      else next = 'FUERTE';
      // Tempo rápido y sonando con cuerpo: subir un escalón
      if (next === 'RITMO' && (bpm ?? 0) >= 125 && emaShort > 0.15) next = 'FUERTE';
    }

    // Confirmar el cambio de sección solo si se sostiene un par de segundos
    if (next !== candidate) {
      candidate = next;
      candidateSince = now;
    }
    const confirmed = candidate !== section && now - candidateSince > SECTION_STABLE;
    if (confirmed) {
      section = candidate;
      notify();
    }

    // Decidir el modo: cambiar si ya no encaja con la sección,
    // o rotar para dar variedad si lleva demasiado tiempo igual
    const dwell = now - lastModeChange;
    const pool = poolFor(section);
    if (section !== 'SILENCIO') {
      if (!pool.includes(mode) && dwell > MODE_DWELL_MIN) switchMode(now);
      else if (dwell > MODE_DWELL_MAX) switchMode(now);
      switchPalette(now);
    }
  }

  // ---- Control ----

  function setEnabled(on: boolean) {
    enabled = on;
    if (on) {
      // Arrancar con lo que corresponda ya mismo
      lastModeChange = 0;
      notify();
    }
  }

  function isEnabled() {
    return enabled;
  }

  function setOnChange(cb: (s: AutoStatus) => void) {
    onChange = cb;
  }

  return {
    handleKick,
    handlePeak,
    frame,
    setEnabled,
    isEnabled,
    setOnChange,
    status,
  };
}
