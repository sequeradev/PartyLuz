// src/captureAudio.ts

/**
 * Captura el audio del sistema usando getDisplayMedia (compartir pantalla + audio).
 * El usuario verá un diálogo del navegador donde debe activar "Compartir audio".
 * Funciona con Spotify, YouTube, o cualquier app que reproduzca audio en el PC.
 * Compatible con Chrome y Edge. Firefox no soporta esta función.
 */
export async function getSystemAudioStream(): Promise<MediaStream> {
  try {
    const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: true, // algunos navegadores requieren video=true para activar el audio
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100,
      },
    });

    // Detener las pistas de video — solo necesitamos el audio
    displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      throw new Error(
        'No se recibió audio. Vuelve a intentarlo y activa la casilla «Compartir audio» en el diálogo.'
      );
    }

    return displayStream;
  } catch (err: any) {
    // El usuario canceló — no intentar fallback silencioso
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      throw err;
    }
    console.warn('getDisplayMedia falló, intentando fallback:', err);
  }

  // Fallback 1: VB-Audio Virtual Cable (si está instalado)
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cable = devices.find(
      (d) => d.kind === 'audioinput' && /cable/i.test(d.label)
    );
    if (cable) {
      return navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: cable.deviceId } },
        video: false,
      });
    }
  } catch {}

  // Fallback 2: micrófono por defecto
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

/**
 * Captura el micrófono físico del usuario.
 */
export async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}
