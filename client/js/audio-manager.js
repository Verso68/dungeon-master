/**
 * Pipeline de voz: VAD (deteccion de habla) -> Whisper (STT) -> TTS (respuesta)
 * Usa @ricky0123/vad-web para detectar cuando los jugadores hablan.
 */

export class AudioManager {
  constructor() {
    this.vad = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.isPaused = false;
    this.currentAudio = null;
    this.onTranscription = null; // callback(text)
    this.onStatusChange = null;  // callback(status: 'listening'|'processing'|'speaking'|'idle')
  }

  async initialize() {
    try {
      this.setStatus('processing');

      // Usar el objeto global `vad` cargado via script tags en index.html
      if (typeof vad === 'undefined') {
        throw new Error('VAD no cargado. Asegurate de incluir los scripts de onnxruntime-web y @ricky0123/vad-web.');
      }

      this.vad = await vad.MicVAD.new({
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.3,
        minSpeechFrames: 5,
        preSpeechPadFrames: 10,
        redemptionFrames: 15,
        baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
        onSpeechStart: () => {
          if (!this.isSpeaking && !this.isPaused) {
            this.setStatus('processing');
          }
        },
        onSpeechEnd: async (audio) => {
          if (this.isSpeaking || this.isPaused) return;
          await this.processAudio(audio);
        },
      });

      this.vad.start();
      this.isListening = true;
      this.setStatus('listening');
      return true;
    } catch (error) {
      console.error('Error inicializando audio:', error);
      this.setStatus('idle');
      return false;
    }
  }

  async processAudio(audioFloat32) {
    this.setStatus('processing');

    try {
      // Convertir Float32Array a WAV
      const wavBlob = this.float32ToWav(audioFloat32, 16000);

      // Enviar a Whisper
      const formData = new FormData();
      formData.append('file', wavBlob, 'audio.wav');

      const response = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Whisper error: ${response.status}`);

      const data = await response.json();
      const text = data.text?.trim();

      if (text && text.length > 1 && this.onTranscription) {
        this.onTranscription(text);
      } else {
        this.setStatus('listening');
      }
    } catch (error) {
      console.error('Error procesando audio:', error);
      this.setStatus('listening');
    }
  }

  async speak(text) {
    if (!text) return;

    this.isSpeaking = true;
    this.setStatus('speaking');

    try {
      // Dividir en primera frase y resto para reducir latencia
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const firstSentence = sentences[0].trim();
      const rest = sentences.slice(1).join(' ').trim();

      // Lanzar TTS de la primera frase y del resto en paralelo
      const firstPromise = this.fetchTTS(firstSentence);
      const restPromise = rest ? this.fetchTTS(rest) : null;

      // Reproducir primera frase (llega rapido porque es corta)
      const firstBlob = await firstPromise;
      await this.playAudio(firstBlob);

      // Reproducir el resto (ya se estaba descargando en paralelo)
      if (restPromise) {
        const restBlob = await restPromise;
        await this.playAudio(restBlob);
      }
    } catch (error) {
      console.error('Error en TTS:', error);
    } finally {
      this.isSpeaking = false;
      if (!this.isPaused) this.setStatus('listening');
    }
  }

  async fetchTTS(text) {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'onyx',
        input: text,
        speed: 0.95,
      }),
    });
    if (!response.ok) throw new Error(`TTS error: ${response.status}`);
    return response.blob();
  }

  playAudio(blob) {
    return new Promise((resolve) => {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }

      const url = URL.createObjectURL(blob);
      this.currentAudio = new Audio(url);

      this.currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        resolve();
      };

      this.currentAudio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        resolve();
      };

      this.currentAudio.play().catch(() => resolve());
    });
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.vad?.pause();
      this.setStatus('idle');
    } else {
      this.vad?.start();
      this.setStatus('listening');
    }
    return this.isPaused;
  }

  stopSpeaking() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isSpeaking = false;
    this.setStatus('listening');
  }

  setStatus(status) {
    if (this.onStatusChange) this.onStatusChange(status);
  }

  /** Convierte Float32Array (PCM) a WAV blob */
  float32ToWav(float32Array, sampleRate) {
    const length = float32Array.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // PCM samples
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
