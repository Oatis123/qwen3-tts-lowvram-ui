import { decodeToMono } from './audio'

export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buf = new Float32Array(2048)

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    })
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser)
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 })
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start(250)
  }

  level(): number {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (const v of this.buf) sum += v * v
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4)
  }

  async stop(): Promise<Float32Array> {
    const rec = this.recorder
    if (!rec) return new Float32Array(0)
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve()
      rec.stop()
    })
    const blob = new Blob(this.chunks, { type: 'audio/webm' })
    this.release()
    return decodeToMono(await blob.arrayBuffer())
  }

  cancel(): void {
    try {
      this.recorder?.stop()
    } catch {
      /* not started */
    }
    this.release()
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.stream = null
    this.recorder = null
    this.ctx = null
    this.analyser = null
  }
}
