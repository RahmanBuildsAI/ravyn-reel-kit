// The parent-side WebAudio mixer: sample-accurate playback of every audio clip (and every video
// clip whose own audio is switched on) from any time, with per-clip volume, per-track mute and a
// master. The audio context clock drives playback time while playing.
import { S, M } from "/ui/state.js";
import { mediaUrl } from "/ui/util.js";

export const Audio = {
  ctx: null, master: null, buffers: new Map(), pending: new Map(), sources: [], masterVol: 1,
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.masterVol; this.master.connect(this.ctx.destination);
    }
    return this.ctx.resume();
  },
  setMaster(v) { this.masterVol = v; if (this.master) this.master.gain.value = v; },
  url(src) { return mediaUrl(src, null, false); },
  load(src) {
    const u = this.url(src);
    if (this.buffers.has(u)) return Promise.resolve(this.buffers.get(u));
    if (this.pending.has(u)) return this.pending.get(u);
    const p = fetch(u).then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab)).then((buf) => { this.buffers.set(u, buf); this.pending.delete(u); return buf; })
      .catch((e) => { console.warn("audio decode failed", src, e); this.buffers.set(u, null); this.pending.delete(u); return null; });
    this.pending.set(u, p); return p;
  },
  audible(p) {
    return M.allClips(p).filter((c) => {
      if (!M.clipVisible(p, c)) return false;
      return c.type === "audio" || (c.type === "video" && c.audio);
    });
  },
  preload() {
    if (!S.project || !this.ctx) return Promise.resolve();
    return Promise.all([...new Set(this.audible(S.project).map((c) => c.src))].map((s) => this.load(s)));
  },
  /* schedule everything from time fromT at playback rate (1, 1.5, 2: review speed); resolves with
     the context time that maps to fromT. Reel seconds become rate-times fewer context seconds. */
  async start(fromT, rate = 1) {
    this.stop();
    if (!S.project) return null;
    await this.preload();
    const now = this.ctx.currentTime + 0.05;
    for (const c of this.audible(S.project)) {
      const buf = this.buffers.get(this.url(c.src)); if (!buf) continue;
      const end = c.start + c.duration;
      if (end <= fromT + 0.01) continue;
      const when = Math.max(0, c.start - fromT);
      const into = Math.max(0, fromT - c.start);
      const offset = (c.mediaStart || 0) + into;
      const remain = Math.min(c.duration - into, buf.duration - offset);
      if (remain <= 0) continue;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = this.ctx.createGain(); g.gain.value = c.volume ?? 1;
      if (c.type === "audio" && (c.fadeIn || c.fadeOut)) {
        const t0 = now + when / rate;
        if (c.fadeIn && into < c.fadeIn) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(c.volume ?? 1, t0 + (c.fadeIn - into) / rate); }
        if (c.fadeOut) { const fo = t0 + (remain - c.fadeOut) / rate; if (fo > t0) { g.gain.setValueAtTime(c.volume ?? 1, fo); g.gain.linearRampToValueAtTime(0, t0 + remain / rate); } }
      }
      src.connect(g); g.connect(this.master);
      try { src.start(now + when / rate, offset, remain); this.sources.push(src); } catch (e) { console.warn(e); }
    }
    return now;
  },
  stop() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources = []; },
  /* waveform peaks at PPS samples per second: Float32Array of max |amplitude| per bucket */
  PPS: 100, peaksCache: new Map(),
  async peaks(src) {
    const u = this.url(src);
    if (this.peaksCache.has(u)) return this.peaksCache.get(u);
    if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.masterVol; this.master.connect(this.ctx.destination); }
    const buf = await this.load(src); if (!buf) { this.peaksCache.set(u, null); return null; }
    const n = Math.ceil(buf.duration * this.PPS), out = new Float32Array(n), per = buf.sampleRate / this.PPS;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) { let m = 0; const a = Math.floor(i * per), b = Math.min(data.length, Math.floor((i + 1) * per)); for (let j = a; j < b; j += 4) { const v = Math.abs(data[j]); if (v > m) m = v; } if (m > out[i]) out[i] = m; }
    }
    this.peaksCache.set(u, out); return out;
  },
  /* one-shot audition of a file (media panel) */
  async audition(src) {
    await this.ensure();
    const buf = await this.load(src); if (!buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.master); s.start();
    this._aud?.stop?.(); this._aud = s;
  },
};
