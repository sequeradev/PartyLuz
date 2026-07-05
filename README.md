# PartyLuz 🟢

Luces de discoteca estáticas que cambian al ritmo de la música que reproduces en **otra aplicación** (Spotify, YouTube, etc.). Interfaz industrial minimalista en negro, blanco y verde eléctrico, con modo pantalla completa para ver solo las luces.

## ▶ Usar ahora

**https://party-luz.vercel.app**

Ábrelo en **Chrome o Edge** (Firefox no soporta la captura de audio del sistema). No hace falta instalar nada.

## Uso local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en **Chrome o Edge**.

1. Pulsa **CAPTURAR AUDIO DEL SISTEMA**.
2. En el diálogo del navegador, elige la pestaña o pantalla donde suena la música y **activa la casilla «Compartir audio»** (imprescindible).
3. Las luces empezarán a reaccionar al ritmo. Pulsa **⛶ PANTALLA COMPLETA** para ver solo las luces (ESC o doble clic para salir).

> Consejo: capturar una **pestaña** de Chrome (p. ej. YouTube) da mejor audio que capturar la pantalla entera. Para apps de escritorio como Spotify, elige «Toda la pantalla» + compartir audio.

## Modo inteligente (por defecto)

El **técnico de luces automático** analiza la música y decide solo qué poner, sin tocar nada:

- Compara la energía actual con el volumen típico de la canción para clasificar la sección: **CALMA**, **RITMO**, **FUERTE** o **DROP**.
- Estima el **BPM** midiendo los intervalos entre bombos.
- Elige modo y paleta acordes a la sección (suaves en calma, flash y colores cálidos en lo fuerte) y los rota cada cierto tiempo para dar variedad.
- Cuando detecta un subidón con la pista fuerte o tempo rápido, mete un **golpe de estrobo** de 2,5 s como en un drop real.

El panel muestra su decisión en vivo (p. ej. `FUERTE · FLASH TOTAL · 128 BPM`). Tocar cualquier control de modo o paleta desactiva el técnico y te devuelve el control manual; se reactiva con el botón **◈ MODO INTELIGENTE**.

## Controles

- **Sensibilidad** — cuánta energía hace falta para disparar un cambio de luz.
- **Modo** — FLASH TOTAL (todas a la vez), ALTERNO (mitades intercaladas), ALEATORIO, SECUENCIA (recorrido), ESTROBO (blanco seco al bombo).
- **Paleta** — FIESTA, NEÓN, FUEGO, OCÉANO, UV, BLANCO.
- **Zonas** — número de paneles de luz (6 / 9 / 12).
- **Niveles** — medidores en vivo de sub-graves, bajos, medios y agudos.

## Cómo funciona

- `src/captureAudio.ts` — captura el audio de otra ventana con `getDisplayMedia` (con fallback a VB-Audio Cable o micrófono).
- `src/beatDetector.ts` — FFT por bandas de frecuencia con medias móviles exponenciales; dispara eventos de bombo, bajo, medios, agudos y picos de energía.
- `src/lightEngine.ts` — motor de zonas de color sólido con envolvente de brillo que decae entre beats.

Basado en el detector de beats de [retro-ai-visualizer](https://github.com/sequeradev/retro-ai-visualizer).
