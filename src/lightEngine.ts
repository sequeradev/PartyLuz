// src/lightEngine.ts
// Motor de luces estáticas: una cuadrícula de zonas de color sólido que
// cambian de color/brillo cuando el detector de beats dispara eventos.

export type LightMode = 'flash' | 'alterno' | 'aleatorio' | 'secuencia' | 'strobe';

export interface Palette {
  name: string;
  colors: string[];
}

export const PALETTES: Palette[] = [
  { name: 'FIESTA', colors: ['#ff2d55', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'] },
  { name: 'NEÓN', colors: ['#ff00ff', '#00ffff', '#39ff14', '#ff3131', '#fffb00'] },
  { name: 'FUEGO', colors: ['#ff3b00', '#ff7a00', '#ffb300', '#ffdd55', '#ff1900'] },
  { name: 'OCÉANO', colors: ['#00c2ff', '#0066ff', '#00ffd0', '#3a29ff', '#7fdbff'] },
  { name: 'UV', colors: ['#7a00ff', '#b000ff', '#ff00d4', '#4400ff', '#d0a0ff'] },
  { name: 'BLANCO', colors: ['#ffffff', '#dfe8ff', '#fff3d6', '#c8d4e0'] },
];

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

interface PanelState {
  el: HTMLDivElement;
  color: RGB;
  bright: number; // 0..1 envolvente de brillo, decae cada frame
}

const IDLE_BRIGHT = 0.10; // brillo mínimo en reposo (luces "encendidas" tenues)

export function createLightEngine(container: HTMLElement) {
  let panels: PanelState[] = [];
  let mode: LightMode = 'flash';
  let palette = PALETTES[0];
  let colorIdx = 0;
  let chaseIdx = 0;
  let decayRate = 2.2; // por segundo (exponencial)

  function nextColor(): RGB {
    colorIdx = (colorIdx + 1) % palette.colors.length;
    return hexToRgb(palette.colors[colorIdx]);
  }

  function randomColor(): RGB {
    return hexToRgb(palette.colors[Math.floor(Math.random() * palette.colors.length)]);
  }

  function setPanelCount(n: number) {
    container.innerHTML = '';
    panels = [];
    // Cuadrícula lo más cuadrada posible sin celdas sueltas (6→3×2, 9→3×3, 12→4×3)
    const cols = Math.ceil(Math.sqrt(n));
    container.style.gridTemplateColumns = `repeat(${Math.min(cols, n)}, 1fr)`;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'light-panel';
      container.appendChild(el);
      panels.push({ el, color: randomColor(), bright: IDLE_BRIGHT });
    }
    render();
  }

  function setMode(m: LightMode) {
    mode = m;
    chaseIdx = 0;
  }

  function setPalette(p: Palette) {
    palette = p;
    colorIdx = 0;
    // Recolorear suavemente las zonas con la nueva paleta
    for (const panel of panels) panel.color = randomColor();
  }

  function lightAll(color: RGB, bright: number) {
    for (const p of panels) {
      p.color = color;
      p.bright = Math.max(p.bright, bright);
    }
  }

  // ---- Reacciones a los beats según el modo ----

  function onKick(energy: number) {
    const b = Math.min(1, 0.7 + energy);
    switch (mode) {
      case 'flash':
        lightAll(nextColor(), b);
        break;
      case 'alterno': {
        // Con una sola zona no hay mitades que alternar: flash directo
        if (panels.length === 1) {
          lightAll(nextColor(), b);
          break;
        }
        const c = nextColor();
        const even = chaseIdx % 2 === 0;
        chaseIdx++;
        panels.forEach((p, i) => {
          if (i % 2 === (even ? 0 : 1)) {
            p.color = c;
            p.bright = b;
          }
        });
        break;
      }
      case 'aleatorio': {
        const count = Math.max(1, Math.floor(panels.length / 2));
        for (let i = 0; i < count; i++) {
          const p = panels[Math.floor(Math.random() * panels.length)];
          p.color = randomColor();
          p.bright = b;
        }
        break;
      }
      case 'secuencia': {
        const c = nextColor();
        const p = panels[chaseIdx % panels.length];
        chaseIdx++;
        if (p) {
          p.color = c;
          p.bright = 1;
        }
        break;
      }
      case 'strobe':
        lightAll({ r: 255, g: 255, b: 255 }, 1);
        break;
    }
  }

  function onBass(energy: number) {
    const b = Math.min(1, 0.5 + energy * 0.8);
    switch (mode) {
      case 'flash':
        // Refuerza el brillo sin cambiar de color
        for (const p of panels) p.bright = Math.max(p.bright, b * 0.85);
        break;
      case 'alterno':
        panels.forEach((p, i) => {
          if (i % 2 === chaseIdx % 2) p.bright = Math.max(p.bright, b);
        });
        break;
      case 'aleatorio': {
        const p = panels[Math.floor(Math.random() * panels.length)];
        if (p) {
          p.color = randomColor();
          p.bright = Math.max(p.bright, b);
        }
        break;
      }
      case 'secuencia': {
        const p = panels[(chaseIdx + Math.floor(panels.length / 2)) % panels.length];
        if (p) p.bright = Math.max(p.bright, b * 0.7);
        break;
      }
      case 'strobe':
        // Color de fondo tenue entre estrobos
        lightAll(randomColor(), 0.3);
        break;
    }
  }

  function onMid(energy: number) {
    if (mode === 'strobe') return;
    const p = panels[Math.floor(Math.random() * panels.length)];
    if (p) {
      if (mode === 'aleatorio') p.color = randomColor();
      p.bright = Math.max(p.bright, Math.min(1, 0.35 + energy * 0.6));
    }
  }

  function onTreble(energy: number) {
    if (mode === 'strobe') return;
    // Chispa blanca breve en una zona al azar
    const p = panels[Math.floor(Math.random() * panels.length)];
    if (p && energy > 0.3) {
      const c = p.color;
      p.color = {
        r: Math.min(255, c.r + 120),
        g: Math.min(255, c.g + 120),
        b: Math.min(255, c.b + 120),
      };
      p.bright = Math.max(p.bright, 0.6);
    }
  }

  function onPeak(_energy: number) {
    // Subidón: toda la sala a color nuevo al máximo
    lightAll(nextColor(), 1);
  }

  // ---- Bucle de render: decaimiento del brillo ----

  function render() {
    for (const p of panels) {
      const L = p.bright;
      const r = Math.round(p.color.r * L);
      const g = Math.round(p.color.g * L);
      const b = Math.round(p.color.b * L);
      p.el.style.backgroundColor = `rgb(${r},${g},${b})`;
      const glow = Math.max(0, (L - IDLE_BRIGHT) * 0.9);
      p.el.style.boxShadow = glow > 0.02
        ? `0 0 ${Math.round(80 * glow)}px ${Math.round(18 * glow)}px rgba(${p.color.r},${p.color.g},${p.color.b},${glow.toFixed(2)})`
        : 'none';
    }
  }

  function frame(dtSeconds: number) {
    // El estrobo decae mucho más rápido para dar golpes secos
    const rate = mode === 'strobe' ? decayRate * 4 : decayRate;
    const decay = Math.exp(-rate * dtSeconds);
    for (const p of panels) {
      p.bright = IDLE_BRIGHT + (p.bright - IDLE_BRIGHT) * decay;
    }
    render();
  }

  return {
    setPanelCount,
    setMode,
    setPalette,
    onKick,
    onBass,
    onMid,
    onTreble,
    onPeak,
    frame,
  };
}
