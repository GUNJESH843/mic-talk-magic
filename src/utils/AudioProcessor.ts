export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;

  constructor(
    private onAudioData: (audioData: ArrayBuffer) => void,
    private sampleRate: number = 24000
  ) {}

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate,
      });

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.floatToPCM16(inputData);
        // Create a proper ArrayBuffer copy
        const buffer = new ArrayBuffer(pcmData.byteLength);
        new Uint8Array(buffer).set(new Uint8Array(pcmData.buffer));
        this.onAudioData(buffer);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      console.log("Recording started");
    } catch (error) {
      console.error("Error starting recording:", error);
      throw error;
    }
  }

  stopRecording() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    console.log("Recording stopped");
  }

  async playAudio(audioData: ArrayBuffer) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate,
      });
    }

    try {
      // Create a copy to ensure it's an ArrayBuffer, not SharedArrayBuffer
      const buffer = new ArrayBuffer(audioData.byteLength);
      new Uint8Array(buffer).set(new Uint8Array(audioData));
      
      const audioBuffer = await this.audioContext.decodeAudioData(buffer);
      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this.playNextInQueue();
      }
    } catch (error) {
      console.error("Error playing audio:", error);
    }
  }

  private playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;

    if (!this.audioContext) {
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate,
      });
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.playNextInQueue();
    };

    source.start(0);
  }

  private floatToPCM16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  createWavHeader(dataLength: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");

    // fmt sub-chunk
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM format
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, 1, true); // Number of channels
    view.setUint32(24, this.sampleRate, true); // Sample rate
    view.setUint32(28, this.sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    return buffer;
  }
}
