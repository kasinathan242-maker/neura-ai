/**
 * NEURA AI — Web Audio API Manager (Recording, PCM Encoding, Queue Playback, Analyser)
 */

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isRecording = false;

  private playQueue: ArrayBuffer[] = [];
  private isPlaying = false;

  public async initAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: 16000 });
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Starts capturing microphone audio and streams raw 16-bit 16kHz PCM chunks.
   */
  public async startRecording(
    onPcmChunk: (chunk: Uint8Array) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    try {
      const ctx = await this.initAudioContext();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = ctx.createMediaStreamSource(this.mediaStream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;

      // ScriptProcessor for 16-bit PCM conversion (512 samples = 32ms frames)
      this.scriptProcessor = ctx.createScriptProcessor(512, 1, 1);
      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onPcmChunk(new Uint8Array(pcm16.buffer));
      };

      source.connect(this.analyser);
      this.analyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(ctx.destination);
      this.isRecording = true;
    } catch (err: unknown) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Stops recording and releases microphone track.
   */
  public stopRecording(): void {
    this.isRecording = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Returns current microphone RMS energy normalized to [0.0, 1.0] for reactive visualizers.
   */
  public getEnergy(): number {
    if (!this.analyser || !this.isRecording) return 0.0;
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i];
    }
    const avg = sum / buffer.length;
    return Math.min(1.0, avg / 128.0);
  }

  /**
   * Enqueues and plays synthesized audio chunks received from backend.
   */
  public async playBase64Wav(base64Data: string): Promise<void> {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this.playQueue.push(bytes.buffer);
      if (!this.isPlaying) {
        this.processPlayQueue();
      }
    } catch (err) {
      console.warn("Audio queue decode error:", err);
    }
  }

  private async processPlayQueue(): Promise<void> {
    if (this.playQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const buffer = this.playQueue.shift()!;
    const ctx = await this.initAudioContext();

    try {
      const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        this.processPlayQueue();
      };
      source.start();
    } catch {
      // If chunk is raw PCM or headerless, skip gracefully
      this.processPlayQueue();
    }
  }

  /**
   * Immediately clears audio playback queue (used on interruption / barge-in).
   */
  public clearPlaybackQueue(): void {
    this.playQueue = [];
    this.isPlaying = false;
  }
}

export const audioManager = new AudioManager();
