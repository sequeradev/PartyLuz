// src/beatDetector.ts
// Motor de detección de beats en tiempo real usando FFT del AnalyserNode.
// Se llama cada frame desde el bucle de animación principal.

export interface BeatEnergies {
  subBass: number; // 0..1  (bombo, <60 Hz)
  bass: number;    // 0..1  (bajo, 60–250 Hz)
  mid: number;     // 0..1  (medios, 250–2000 Hz)
  treble: number;  // 0..1  (agudos, 2000 Hz+)
  overall: number; // 0..1  (energía total ponderada)
}

export interface BeatCallbacks {
  onKickBeat?: (energy: number) => void;
  onBassBeat?: (energy: number) => void;
  onMidBeat?: (energy: number) => void;
  onTrebleBeat?: (energy: number) => void;
  onEnergyPeak?: (energy: number) => void;
}

export function createBeatDetector(
  analyser: AnalyserNode,
  callbacks: BeatCallbacks
) {
  analyser.fftSize = 2048;
  const bufferLength = analyser.frequencyBinCount; // 1024
  const dataArray = new Uint8Array(bufferLength);

  const sampleRate = analyser.context.sampleRate;
  const nyquist = sampleRate / 2;
  const binHz = nyquist / bufferLength;

  const SUB_BASS_END = Math.max(1, Math.round(60 / binHz));
  const BASS_END = Math.max(SUB_BASS_END + 1, Math.round(250 / binHz));
  const MID_END = Math.max(BASS_END + 1, Math.round(2000 / binHz));

  // Promedios móviles exponenciales (EMA)
  let avgSubBass = 0.01;
  let avgBass = 0.01;
  let avgMid = 0.01;
  let avgTreble = 0.01;
  let avgOverall3s = 0.01;

  const EMA_FAST = 0.12;
  const EMA_SLOW = 0.03;

  let lastKickTime = 0;
  let lastBassTime = 0;
  let lastMidTime = 0;
  let lastTrebleTime = 0;
  let lastPeakTime = 0;

  const KICK_COOLDOWN = 200;
  const BASS_COOLDOWN = 300;
  const MID_COOLDOWN = 150;
  const TREBLE_COOLDOWN = 100;
  const PEAK_COOLDOWN = 8000;

  const KICK_THRESH = 2.0;
  const BASS_THRESH = 1.5;
  const MID_THRESH = 1.4;
  const TREBLE_THRESH = 1.6;
  const PEAK_THRESH = 2.2;

  // Sensibilidad global: 1 = normal, >1 dispara con menos energía
  let sensitivity = 1;
  function setSensitivity(s: number) {
    sensitivity = Math.max(0.25, Math.min(4, s));
  }

  function bandRMS(start: number, end: number): number {
    let sum = 0;
    const count = end - start;
    for (let i = start; i < end; i++) {
      const v = dataArray[i] / 255;
      sum += v * v;
    }
    return Math.sqrt(sum / count);
  }

  function tick(): BeatEnergies {
    analyser.getByteFrequencyData(dataArray);
    const now = performance.now();

    const subBass = bandRMS(0, SUB_BASS_END);
    const bass = bandRMS(SUB_BASS_END, BASS_END);
    const mid = bandRMS(BASS_END, MID_END);
    const treble = bandRMS(MID_END, bufferLength);
    const overall = 0.5 * subBass + 0.3 * bass + 0.15 * mid + 0.05 * treble;

    avgSubBass += EMA_FAST * (subBass - avgSubBass);
    avgBass += EMA_FAST * (bass - avgBass);
    avgMid += EMA_FAST * (mid - avgMid);
    avgTreble += EMA_FAST * (treble - avgTreble);
    avgOverall3s += EMA_SLOW * (overall - avgOverall3s);

    const k = 1 / sensitivity;

    if (subBass > avgSubBass * KICK_THRESH * k && now - lastKickTime > KICK_COOLDOWN) {
      lastKickTime = now;
      callbacks.onKickBeat?.(subBass);
    }
    if (bass > avgBass * BASS_THRESH * k && now - lastBassTime > BASS_COOLDOWN) {
      lastBassTime = now;
      callbacks.onBassBeat?.(bass);
    }
    if (mid > avgMid * MID_THRESH * k && now - lastMidTime > MID_COOLDOWN) {
      lastMidTime = now;
      callbacks.onMidBeat?.(mid);
    }
    if (treble > avgTreble * TREBLE_THRESH * k && now - lastTrebleTime > TREBLE_COOLDOWN) {
      lastTrebleTime = now;
      callbacks.onTrebleBeat?.(treble);
    }
    if (overall > avgOverall3s * PEAK_THRESH * k && now - lastPeakTime > PEAK_COOLDOWN) {
      lastPeakTime = now;
      callbacks.onEnergyPeak?.(overall);
    }

    return { subBass, bass, mid, treble, overall };
  }

  return { tick, setSensitivity };
}
