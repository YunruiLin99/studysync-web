// 传感器：摄像头估算环境光（lux），麦克风估算噪音（dB）。
// 两者都是基于消费级硬件的估算值，用于判断"偏暗/适宜/偏强"这类区间，而非精确测量。
// 所有数据只在本地处理，不录像、不录音、不上传。

const LIGHT_INTERVAL = 500; // ms
const EMA = 0.3;            // 指数平滑系数，越大越灵敏
const DB_OFFSET = 90;       // dBFS → 近似 dB SPL 的经验偏移（未校准的手机/电脑麦克风）

const smooth = (prev, next) => (prev == null ? next : prev + (next - prev) * EMA);

export class LiveSensors {
  constructor() {
    this.lux = null;
    this.db = null;
    this.status = { light: "off", noise: "off" }; // off | on | denied | unsupported | error
    this._video = null;
    this._canvas = null;
    this._timer = null;
    this._raf = null;
    this._streams = [];
    this._audioCtx = null;
  }

  get active() {
    return this.status.light === "on" || this.status.noise === "on";
  }

  async start({ light = true, noise = true } = {}) {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      this.status = { light: "unsupported", noise: "unsupported" };
      return this.status;
    }
    // 两个权限分开申请：用户可以只授权其中一个
    if (light && this.status.light !== "on") await this._startLight(md);
    if (noise && this.status.noise !== "on") await this._startNoise(md);
    return this.status;
  }

  async _startLight(md) {
    try {
      const stream = await md.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
      this._streams.push(stream);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this._video = video;
      this._canvas = document.createElement("canvas");
      this._canvas.width = 64;
      this._canvas.height = 48;
      this._timer = setInterval(() => this._sampleLight(), LIGHT_INTERVAL);
      this._sampleLight();
      this.status.light = "on";
    } catch (e) {
      this.status.light = e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error";
    }
  }

  _sampleLight() {
    const v = this._video;
    if (!v || v.readyState < 2) return;
    const ctx = this._canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, 64, 48);
    const d = ctx.getImageData(0, 0, 64, 48).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const brightness = sum / (d.length / 4) / 255;
    // 与 Flutter 版保持同一映射：lux ≈ brightness² × 1500
    const lux = Math.min(2000, Math.round(brightness * brightness * 1500));
    this.lux = Math.round(smooth(this.lux, lux));
  }

  async _startNoise(md) {
    try {
      const stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      this._streams.push(stream);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      this._audioCtx = ctx;
      let last = 0;
      const tick = (t) => {
        this._raf = requestAnimationFrame(tick);
        if (t - last < 200) return;
        last = t;
        analyser.getFloatTimeDomainData(buf);
        let sq = 0;
        for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
        const rms = Math.sqrt(sq / buf.length);
        const dbfs = 20 * Math.log10(Math.max(rms, 1e-7));
        const db = Math.max(20, Math.min(100, dbfs + DB_OFFSET));
        this.db = Math.round(smooth(this.db, db));
      };
      this._raf = requestAnimationFrame(tick);
      this.status.noise = "on";
    } catch (e) {
      this.status.noise = e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error";
    }
  }

  stop() {
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this._streams = [];
    if (this._audioCtx) this._audioCtx.close().catch(() => {});
    this._audioCtx = null;
    this._video = null;
    if (this.status.light === "on") this.status.light = "off";
    if (this.status.noise === "on") this.status.noise = "off";
  }

  reading() {
    return {
      lux: this.status.light === "on" ? this.lux : null,
      db: this.status.noise === "on" ? this.db : null,
    };
  }
}

// 演示模式：不申请任何权限，用平滑随机游走模拟一个真实的自习环境，
// 偶尔出现一段噪音高峰，方便体验"环境变差提醒"。
export class DemoSensors {
  constructor() {
    this.lux = 430;
    this.db = 41;
    this.status = { light: "off", noise: "off" };
    this._timer = null;
    this._spike = 0;
  }
  get active() { return this.status.light === "on"; }
  async start() {
    this.status = { light: "on", noise: "on" };
    clearInterval(this._timer);
    this._timer = setInterval(() => this._step(), 500);
    return this.status;
  }
  _step() {
    const jitter = (n) => (Math.random() - 0.5) * n;
    this.lux = Math.round(Math.max(250, Math.min(620, this.lux + jitter(24))));
    if (this._spike > 0) {
      this._spike--;
      this.db = Math.round(this.db + (63 - this.db) * 0.35 + jitter(2));
    } else {
      if (Math.random() < 0.004) this._spike = 70; // 约 35 秒的嘈杂时段
      this.db = Math.round(this.db + (41 - this.db) * 0.2 + jitter(3));
    }
  }
  // 手动触发一次嘈杂（演示用）
  triggerNoise() { this._spike = 80; }
  stop() {
    clearInterval(this._timer);
    this.status = { light: "off", noise: "off" };
  }
  reading() {
    return this.status.light === "on" ? { lux: this.lux, db: this.db } : { lux: null, db: null };
  }
}
