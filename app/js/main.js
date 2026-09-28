import { LiveSensors, DemoSensors } from "./sensors.js";
import { evaluate, advise, mainIssue, STATUS_TEXT, LIGHT_LABEL, NOISE_LABEL, statusOf } from "./score.js";
import { autoWeather, searchCity, demoWeather } from "./weather.js";
import { Store } from "./store.js";
import { computeInsights, placeStats } from "./insights.js";
import { lineChart, barChart, prefChart } from "./charts.js";
import { learnPreference } from "./personal.js";
import { CATEGORIES, catOf, locate, nearbyPlaces, demoNearby } from "./places.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const state = {
  demo: params.get("demo") === "1",
  sensors: null,
  store: null,
  weather: null,
  started: false,     // 用户是否已经开始过检测（决定回到「环境」页时是否自动恢复）
  view: "env",
  lastEval: null,
  loop: null,
  personal: null,     // 个性化偏好（personal.js）
  pos: null,          // 最近一次定位
  newCat: "library",  // 手动添加地点时选的类型
  map: null,
  mapLayer: null,
};

// 个性化评分是否生效
const scoring = () => (state.personal?.ready && state.store.prefs.personalize !== false ? { noiseShift: state.personal.shift } : {});
const personalized = () => Boolean(scoring().noiseShift != null && state.personal?.ready && state.store.prefs.personalize !== false);
function refreshPersonal() { state.personal = learnPreference(state.store.records); }

/* ---------------- mode ---------------- */
function setMode(demo) {
  state.sensors?.stop();
  state.demo = demo;
  state.sensors = demo ? new DemoSensors() : new LiveSensors();
  state.store = new Store(demo);
  state.weather = null;
  $("#demo-badge").classList.toggle("hidden", !demo);
  $("#demo-noise").classList.toggle("hidden", !demo);
  $("#ins-demo-note").classList.toggle("hidden", !demo);
  document.querySelectorAll(".demo-only").forEach((e) => e.classList.toggle("hidden", !demo));
  refreshPersonal();
  state.pos = null;
  $("#nearby").classList.add("hidden");
  const url = new URL(location.href);
  if (demo) url.searchParams.set("demo", "1"); else url.searchParams.delete("demo");
  history.replaceState(null, "", url);
  renderPlace();
  renderPresets();
}

/* ---------------- place ---------------- */
function renderPlace() {
  const cur = state.store.currentPlace();
  $("#place-name").textContent = cur.name;
  const box = $("#place-chips");
  box.innerHTML = "";
  state.store.placeList.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `${catOf(p.category).icon} ${p.name}`;
    b.setAttribute("aria-pressed", String(p.id === cur.id));
    b.onclick = () => { usePlace(p.id); };
    box.append(b);
  });
  const cats = $("#cat-chips");
  cats.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `${c.icon} ${c.name}`;
    b.setAttribute("aria-pressed", String(c.key === state.newCat));
    b.onclick = () => { state.newCat = c.key; renderPlace(); };
    cats.append(b);
  });
}
function usePlace(id) {
  state.store.setPref("placeId", id);
  renderPlace();
  focus.tick();
  if (state.view === "places") renderPlaces();
}
function openSheet(open) {
  $("#place-sheet").classList.toggle("hidden", !open);
  if (open) $("#place-chips button[aria-pressed='true']")?.focus();
}

async function findNearby() {
  const box = $("#nearby");
  box.classList.remove("hidden");
  box.innerHTML = `<p class="muted small">正在定位并查找附近的地点…</p>`;
  try {
    if (state.demo) {
      state.pos = { lat: 51.5240, lon: -0.1330 };
      await new Promise((r) => setTimeout(r, 400));
    } else {
      state.pos = await locate();
    }
    const list = state.demo ? demoNearby() : await nearbyPlaces(state.pos);
    if (!list.length) {
      box.innerHTML = `<p class="muted small">附近 250 米内没有找到有名字的地点，可以在下面手动添加，位置会一起保存。</p>`;
      return;
    }
    box.innerHTML = `<p class="muted small">选一个你现在所在的地方：</p>`;
    const ul = document.createElement("ul");
    ul.className = "nearby-list";
    list.forEach((n) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span class="nb-icon" aria-hidden="true"></span><span class="nb-main"><span class="nb-name"></span><span class="nb-sub muted small"></span></span>`;
      b.querySelector(".nb-icon").textContent = catOf(n.category).icon;
      b.querySelector(".nb-name").textContent = n.name;
      b.querySelector(".nb-sub").textContent = `${catOf(n.category).name} · ${n.dist} 米`;
      b.onclick = () => {
        const p = state.store.addPlace(n);
        usePlace(p.id);
        box.innerHTML = `<p class="ok-line small">✓ 已设为当前地点：${p.name.replace(/</g, "&lt;")}</p>`;
      };
      li.append(b);
      ul.append(li);
    });
    box.append(ul);
  } catch (e) {
    box.innerHTML = `<p class="warn-line small"></p>`;
    box.firstChild.textContent = `${e.message || "查找失败"}。可以在下面手动添加地点。`;
  }
}

/* ---------------- env view ---------------- */
async function startDetection() {
  state.started = true;
  $("#env-intro").classList.add("hidden");
  $("#env-live").classList.remove("hidden");
  $("#live-text").textContent = "正在请求权限…";
  const st = await state.sensors.start({ light: true, noise: true });
  const note = [];
  if (st.light !== "on") note.push(st.light === "denied" ? "摄像头未授权" : "摄像头不可用");
  if (st.noise !== "on") note.push(st.noise === "denied" ? "麦克风未授权" : "麦克风不可用");
  if (st.light !== "on" && st.noise !== "on") {
    $("#live-text").textContent = "无法读取传感器";
    $("#partial-note").textContent = `${note.join("、")}。可以在浏览器设置里允许后刷新，或用演示数据体验。`;
    $("#partial-note").classList.remove("hidden");
  } else if (note.length) {
    $("#partial-note").textContent = `${note.join("、")}，评分只基于${st.light === "on" ? "光线" : "噪音"}。`;
    $("#partial-note").classList.remove("hidden");
  } else {
    $("#partial-note").classList.add("hidden");
  }
  startLoop();
  if (!state.weather) loadWeather();
}

async function loadWeather() {
  $("#w-city").textContent = "正在获取天气…";
  if (state.demo) { setWeather(demoWeather()); return; }
  try {
    const w = await autoWeather();
    setWeather(w);
    if (!w.located) {
      $("#w-note").textContent = w.reason === "denied" ? "没有获取定位权限，先显示伦敦的天气，可以手动换城市。" : "暂时无法定位，先显示伦敦的天气，可以手动换城市。";
      $("#w-note").classList.remove("hidden");
    }
  } catch {
    $("#w-city").textContent = "天气暂时不可用";
    $("#w-temp").textContent = "--";
  }
}
function setWeather(w) {
  state.weather = w;
  $("#w-icon").textContent = w.icon;
  $("#w-temp").textContent = Math.round(w.temp);
  $("#w-text").textContent = w.text;
  $("#w-city").textContent = `${w.city}${w.humidity != null ? ` · 湿度 ${w.humidity}%` : ""}`;
  $("#w-note").classList.add("hidden");
  renderEnv();
}

const CIRC = 2 * Math.PI * 52;
function renderEnv() {
  const r = state.sensors.reading();
  const ev = evaluate(r, scoring());
  state.lastEval = ev;
  const ring = $("#ring-fill");
  ring.style.strokeDasharray = CIRC;
  if (!ev) {
    $("#score").textContent = "--";
    ring.style.strokeDashoffset = CIRC;
    return;
  }
  $("#score").textContent = ev.score;
  ring.style.strokeDashoffset = CIRC * (1 - ev.score / 100);
  ring.setAttribute("class", `ring-fill ${ev.status}`);
  const pill = $("#status");
  pill.className = `status-pill ${ev.status}`;
  pill.querySelector(".status-icon").textContent = STATUS_TEXT[ev.status].icon;
  pill.querySelector(".status-text").textContent = STATUS_TEXT[ev.status].title;
  $("#live-text").textContent = `${state.demo ? "演示数据 · 实时模拟" : "正在实时检测"}${personalized() ? " · 个性化评分" : ""}`;

  metric("lux", ev.light, (l) => `${LIGHT_LABEL[l.level]} · 建议 300–750 lx`, (l) => Math.min(100, (l.lux / 1000) * 100));
  const pr = personalized() ? state.personal.range : null;
  metric("db", ev.noise, (n) => `${NOISE_LABEL[n.level]} · ${pr ? `你的舒适区 ${pr[0]}–${pr[1]} dB` : "建议 45 dB 以下"}`, (n) => Math.min(100, Math.max(0, ((n.db - 25) / 60) * 100)));

  const tips = advise(ev, state.weather);
  const ol = $("#tips");
  const html = tips.map((t) => `<li>${t}</li>`).join("");
  if (ol.dataset.html !== html) { ol.innerHTML = html; ol.dataset.html = html; }
}
function metric(id, m, sub, pct) {
  if (!m) {
    $(`#${id}`).textContent = "--";
    $(`#${id}-level`).textContent = "未授权";
    $(`#${id}-bar`).style.width = "0";
    return;
  }
  $(`#${id}`).textContent = id === "lux" ? m.lux : m.db;
  $(`#${id}-level`).textContent = sub(m);
  const bar = $(`#${id}-bar`);
  bar.style.width = `${pct(m)}%`;
  bar.className = `meter-fill ${statusOf(m.score)}`;
}

function startLoop() {
  clearInterval(state.loop);
  state.loop = setInterval(() => {
    if (state.view === "env") renderEnv();
    focus.sample();
  }, 500);
}

function saveCheck() {
  const ev = state.lastEval;
  if (!ev) { flash("还没有读数，稍等一下再保存。", true); return; }
  state.store.add({
    type: "check",
    lux: ev.light?.lux ?? null,
    db: ev.noise?.db ?? null,
    score: ev.score,
    weather: state.weather ? { city: state.weather.city, temp: Math.round(state.weather.temp), text: state.weather.text } : null,
  });
  flash(`已保存：${state.store.currentPlace().name} · ${ev.score} 分。可以在「地点」和「洞察」里查看。`);
}
let flashT;
function flash(msg, warn) {
  const el = $("#save-msg");
  el.textContent = msg;
  el.style.color = warn ? "var(--poor-ink)" : "";
  clearTimeout(flashT);
  flashT = setTimeout(() => { el.textContent = ""; }, 3500);
}

/* ---------------- focus ---------------- */
const PRESETS = [25, 50];
const TCIRC = 2 * Math.PI * 54;
const ALERT_AFTER = 20000;  // 连续 20 秒低于 60 分才提醒，避免偶发噪音误报
const RECOVER_AT = 70;

const focus = {
  planned: 25,
  running: false,
  paused: false,
  startTs: 0,
  pausedMs: 0,
  pauseAt: 0,
  samples: [],
  alerts: 0,
  badSince: 0,
  alerting: false,
  timer: null,
  wake: null,

  elapsed() {
    if (!this.startTs) return 0;
    const end = this.paused ? this.pauseAt : Date.now();
    return end - this.startTs - this.pausedMs;
  },
  async start() {
    this.running = true;
    this.paused = false;
    this.startTs = Date.now();
    this.pausedMs = 0;
    this.samples = [];
    this.alerts = 0;
    this.badSince = 0;
    this.alerting = false;
    $("#focus-done").classList.add("hidden");
    if ($("#opt-monitor").checked && !state.sensors.active) {
      await state.sensors.start({ light: true, noise: true });
      state.started = true;
      startLoop();
    }
    try { this.wake = await navigator.wakeLock?.request("screen"); } catch { this.wake = null; }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 250);
    this.tick();
    renderFocusButtons();
  },
  pause() {
    if (!this.running) return;
    if (this.paused) {
      this.pausedMs += Date.now() - this.pauseAt;
      this.paused = false;
    } else {
      this.pauseAt = Date.now();
      this.paused = true;
    }
    renderFocusButtons();
    this.tick();
  },
  tick() {
    const total = this.planned * 60000;
    const left = Math.max(0, total - this.elapsed());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    const txt = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    $("#timer").textContent = txt;
    $("#timer-fill").style.strokeDashoffset = TCIRC * (1 - left / total);
    $("#timer-sub").textContent = this.paused ? "已暂停" : this.running ? `专注中 · ${state.store.currentPlace().name}` : "准备开始";
    document.title = this.running ? `${txt} · 专注中 · StudySync` : "StudySync · 学习环境检测";
    if (this.running && left <= 0) this.finish(true);
  },
  sample() {
    const r = state.sensors.reading();
    const ev = evaluate(r, scoring());
    renderFocusEnv(ev);
    if (!this.running || this.paused || !ev || !$("#opt-monitor").checked) return;
    const now = Date.now();
    if (!this._lastSample || now - this._lastSample >= 1000) {
      this._lastSample = now;
      this.samples.push({ lux: ev.light?.lux ?? null, db: ev.noise?.db ?? null, score: ev.score });
    }
    if (ev.score < 60) {
      this.badSince ||= now;
      if (!this.alerting && now - this.badSince >= ALERT_AFTER) {
        this.alerting = true;
        this.alerts++;
        $("#focus-alert-text").textContent = `${mainIssue(ev) || "环境分偏低"}，已经持续 ${Math.round((now - this.badSince) / 1000)} 秒。${ev.noise?.level === "noisy" ? "戴上耳机或换个安静的位置？" : "调整一下再继续？"}`;
        $("#focus-alert").classList.remove("hidden");
        notify();
      }
    } else if (ev.score >= RECOVER_AT) {
      this.badSince = 0;
      if (this.alerting) {
        this.alerting = false;
        $("#focus-alert").classList.add("hidden");
      }
    }
  },
  finish(completed) {
    if (!this.running) return;
    const ms = this.elapsed();
    this.running = false;
    this.paused = false;
    clearInterval(this.timer);
    this.wake?.release?.().catch(() => {});
    this.wake = null;
    $("#focus-alert").classList.add("hidden");
    const mins = Math.max(0, Math.round(ms / 60000));
    const avg = (k) => {
      const v = this.samples.map((x) => x[k]).filter((x) => x != null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    const score = avg("score");
    const done = $("#focus-done");
    if (ms < 60000) {
      done.innerHTML = `<h2>专注不到 1 分钟</h2><p class="muted">这次太短，没有保存记录。</p>`;
    } else {
      const rec = state.store.add({
        type: "focus",
        lux: avg("lux"), db: avg("db"), score,
        plannedMin: this.planned, durationMin: mins, completed, alerts: this.alerts,
        weather: state.weather ? { city: state.weather.city, temp: Math.round(state.weather.temp), text: state.weather.text } : null,
      });
      done.innerHTML = `<h2>${completed ? "🎉 完成一次专注" : "已结束这次专注"}</h2>
        <div class="done-stats">
          <div><b>${mins}</b><span class="muted small">分钟</span></div>
          <div><b>${score ?? "--"}</b><span class="muted small">平均环境分</span></div>
          <div><b>${this.alerts}</b><span class="muted small">次提醒</span></div>
        </div>
        <div class="fb">
          <p class="fb-q">这次状态怎么样？</p>
          <div class="fb-btns" role="group" aria-label="状态反馈">
            <button type="button" data-fb="1">😣 不太好</button>
            <button type="button" data-fb="2">😐 一般</button>
            <button type="button" data-fb="3">😊 很好</button>
          </div>
          <p class="fb-msg muted small">你的反馈会让评分越来越贴合你自己。</p>
        </div>`;
      done.querySelectorAll("[data-fb]").forEach((b) => {
        b.onclick = () => {
          const v = Number(b.dataset.fb);
          state.store.update(rec.id, { feedback: v });
          const wasReady = state.personal?.ready;
          refreshPersonal();
          done.querySelectorAll("[data-fb]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          const p = state.personal;
          done.querySelector(".fb-msg").textContent = p.ready
            ? `已记录。你在 ${p.range[0]}–${p.range[1]} dB 时状态最好，${wasReady ? "个性化评分已更新" : "从现在起，噪音评分会按你的偏好调整"}。`
            : `已记录。再反馈 ${p.need} 次，就能生成你的个性化评分。`;
        };
      });
    }
    done.classList.remove("hidden");
    this.startTs = 0;
    this.tick();
    renderFocusButtons();
    if (state.view !== "env" && state.view !== "focus") stopSensorsIfIdle();
  },
};

function renderPresets() {
  const box = $("#presets");
  box.innerHTML = "";
  const list = state.demo ? [1, ...PRESETS] : PRESETS;
  if (!list.includes(focus.planned)) focus.planned = list[0] === 1 ? 25 : list[0];
  list.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = m === 1 ? "1 分钟（演示）" : `${m} 分钟`;
    b.setAttribute("aria-pressed", String(m === focus.planned));
    b.disabled = focus.running;
    b.onclick = () => { focus.planned = m; renderPresets(); focus.tick(); };
    box.append(b);
  });
}
function renderFocusButtons() {
  $("#f-start").classList.toggle("hidden", focus.running);
  $("#f-pause").classList.toggle("hidden", !focus.running);
  $("#f-stop").classList.toggle("hidden", !focus.running);
  $("#f-pause").textContent = focus.paused ? "继续" : "暂停";
  renderPresets();
}
function renderFocusEnv(ev) {
  const pill = $("#f-score");
  if (!ev) {
    pill.className = "mini-pill";
    pill.textContent = state.sensors.active ? "环境测量中" : "未开启环境监测";
    $("#f-lux").textContent = "";
    $("#f-db").textContent = "";
    return;
  }
  pill.className = `mini-pill ${ev.status}`;
  pill.textContent = `环境 ${ev.score}`;
  $("#f-lux").textContent = ev.light ? `☀️ ${ev.light.lux} lx` : "";
  $("#f-db").textContent = ev.noise ? `🔊 ${ev.noise.db} dB` : "";
}

let audioCtx;
function notify() {
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
  if (!$("#opt-sound").checked) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch {}
}

/* ---------------- 个性化偏好 ---------------- */
function renderPref() {
  const p = state.personal;
  const t = $("#pref-text");
  const counts = `😊 ${p.counts[3]} · 😐 ${p.counts[2]} · 😣 ${p.counts[1]}`;
  if (!p.ready) {
    t.innerHTML = p.n
      ? `已收到 ${p.n} 次反馈（${counts}）。再反馈 <b>${p.need}</b> 次，StudySync 就能学会你适合多大的背景声。`
      : `每次专注结束后点一下"这次状态怎么样"。积累 5 次以上，评分就会按<b>你自己</b>的偏好调整：有人需要绝对安静，有人在咖啡馆的背景声里反而更专注。`;
    $("#pref-toggle-wrap").classList.add("hidden");
  } else {
    const more = p.shift >= 4 ? "，比通用标准能接受更多背景声" : p.shift <= -4 ? "，比通用标准更需要安静" : "";
    t.innerHTML = `根据 ${p.n} 次反馈（${counts}），你在 <b>${p.range[0]}–${p.range[1]} dB</b> 时状态最好${more}。${state.store.prefs.personalize !== false ? "噪音评分已按你的偏好调整。" : "目前使用通用标准评分。"}`;
    $("#pref-toggle-wrap").classList.remove("hidden");
    $("#pref-toggle").checked = state.store.prefs.personalize !== false;
  }
  const host = $("#pref-chart");
  host.classList.toggle("hidden", !p.points.length);
  if (p.points.length) prefChart(host, p.points, p.ready ? p.range : null);
}

/* ---------------- 地点 ---------------- */
const STATUS_HEX = { good: "#0ca30c", fair: "#fab219", poor: "#d03b3b", none: "#9493ad" };
let leafletP;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletP ||= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = () => resolve(window.L);
    sc.onerror = () => { leafletP = null; reject(new Error("地图加载失败")); };
    document.head.append(sc);
  });
  return leafletP;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderPlaces() {
  const recs = state.store.records;
  const cur = state.store.currentPlace();
  // 没有记录也没有位置的默认地点不占列表（当前地点除外）
  const items = state.store.placeList.map((p) => ({ p, st: placeStats(recs, p.id) }))
    .filter(({ p, st }) => st.n > 0 || p.lat != null || p.id === cur.id)
    .sort((a, b) => (b.st.score ?? -1) - (a.st.score ?? -1) || b.st.n - a.st.n);
  const ul = $("#place-list");
  ul.innerHTML = "";
  items.forEach(({ p, st }) => {
    const status = st.score != null ? statusOf(st.score) : null;
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="pl-item">
      <span class="pl-icon" aria-hidden="true">${catOf(p.category).icon}</span>
      <span class="pl-main"><span class="pl-name"></span><span class="pl-sub muted small"></span></span>
      <span class="pl-score">${status ? `<i style="background:${COLOR[status]}"></i>${Math.round(st.score)}` : `<span class="muted small">--</span>`}</span>
    </button>`;
    li.querySelector(".pl-name").innerHTML = `${esc(p.name)}${p.id === cur.id ? ' <span class="cur-tag">当前</span>' : ""}`;
    li.querySelector(".pl-sub").textContent = st.n ? `${catOf(p.category).name} · 来过 ${st.n} 次${p.lat == null ? " · 未定位" : ""}` : `${catOf(p.category).name} · 还没有记录`;
    li.querySelector("button").onclick = () => openPlace(p.id);
    ul.append(li);
  });
  renderMap(items);
}

async function renderMap(items) {
  const withPos = items.filter(({ p }) => p.lat != null);
  $("#map").classList.toggle("hidden", !withPos.length);
  $("#map-empty").classList.toggle("hidden", withPos.length > 0);
  if (!withPos.length) return;
  let L;
  try { L = await loadLeaflet(); } catch { $("#map").innerHTML = `<p class="muted small map-fail">地图暂时加载不了，下面的列表不受影响。</p>`; return; }
  if (!state.map) {
    state.map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
      subdomains: "abcd", maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(state.map);
    state.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    state.mapLayer = L.layerGroup().addTo(state.map);
  }
  state.mapLayer.clearLayers();
  const pts = [];
  withPos.forEach(({ p, st }) => {
    const status = st.score != null ? statusOf(st.score) : "none";
    const mk = L.circleMarker([p.lat, p.lon], { radius: 10, color: "#fff", weight: 2, fillColor: STATUS_HEX[status], fillOpacity: 0.95 })
      .bindTooltip(`${esc(p.name)}${st.score != null ? ` · ${Math.round(st.score)}` : ""}`, { permanent: true, direction: "top", offset: [0, -10], className: "map-label" })
      .on("click", () => openPlace(p.id));
    mk.addTo(state.mapLayer);
    pts.push([p.lat, p.lon]);
  });
  state.map.invalidateSize();
  if (pts.length === 1) state.map.setView(pts[0], 16);
  else state.map.fitBounds(pts, { padding: [36, 36], maxZoom: 17 });
}

let pdId = null;
function openPlace(id) {
  pdId = id;
  const p = state.store.place(id);
  const st = placeStats(state.store.records, id);
  const cat = catOf(p.category);
  $("#pd-icon").textContent = cat.icon;
  $("#pd-title").textContent = p.name;
  $("#pd-sub").textContent = `${cat.name}${st.last ? ` · 上次来是 ${fmtWhen(st.last)}` : ""}`;
  const body = $("#pd-body");
  if (!st.n) {
    body.innerHTML = `<p class="muted pd-empty">还没有在这里的记录。设为当前地点后，做一次检测或专注，这里就会开始积累数据。</p>`;
  } else {
    const status = st.score != null ? statusOf(st.score) : null;
    const pct = st.completion != null ? `${Math.round(st.completion * 100)}%` : "--";
    body.innerHTML = `
      <div class="pd-stats">
        <div><b>${st.score != null ? Math.round(st.score) : "--"}</b><span>平均环境分</span></div>
        <div><b>${st.n}</b><span>来过的次数</span></div>
        <div><b>${st.lux != null ? Math.round(st.lux) : "--"}</b><span>平均光线 lx</span></div>
        <div><b>${st.db != null ? Math.round(st.db) : "--"}</b><span>平均噪音 dB</span></div>
        <div><b>${pct}</b><span>专注完成率</span></div>
        <div><b class="fb-sum">😊${st.feedback[3]} 😐${st.feedback[2]} 😣${st.feedback[1]}</b><span>状态反馈</span></div>
      </div>
      ${status ? `<p class="pd-verdict ${status}"><span class="status-icon">${STATUS_TEXT[status].icon}</span>${STATUS_TEXT[status].title}</p>` : ""}
      <h3 class="pd-h">不同时段</h3>
      ${st.n >= 3 ? `<p class="pd-note">${st.periodNote || "目前各时段差别不大。"}</p><div id="pd-period" class="chart-host"></div>`
        : `<p class="muted small">再来这里 <b>${3 - st.n}</b> 次，就能看到这里在不同时段的规律。</p>`}
      <h3 class="pd-h">最近的记录</h3>
      <ul class="pd-recent">${st.recent.map((r) => `<li><span>${fmtWhen(r.ts)} · ${r.type === "focus" ? `专注 ${r.durationMin} 分钟` : "环境检测"}${r.feedback ? ` · ${["", "😣", "😐", "😊"][r.feedback]}` : ""}</span><b>${r.score ?? "--"}</b></li>`).join("")}</ul>`;
  }
  $("#pd-use").textContent = state.store.prefs.placeId === id ? "已是当前地点" : "设为当前地点";
  $("#pd-use").disabled = state.store.prefs.placeId === id;
  $("#pd-rename-form").classList.add("hidden");
  $("#pd-sheet").classList.remove("hidden");
  if (st.n >= 3) barChart($("#pd-period"), st.byPeriod.map((g) => ({ ...g, key: g.name })));
  $("#pd-close").focus();
}
function closePlace() { $("#pd-sheet").classList.add("hidden"); pdId = null; }

/* ---------------- insights ---------------- */
const fmtWhen = (ts) => {
  const d = new Date(ts), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  return days === 0 ? `今天 ${hm}` : days === 1 ? `昨天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
};
const fmtMin = (m) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} 小时` : `${m} 分钟`);
const COLOR = { good: "var(--good)", fair: "var(--fair)", poor: "var(--poor)" };

function renderInsights() {
  const recs = state.store.records;
  const empty = recs.length === 0;
  $("#ins-empty").classList.toggle("hidden", !empty);
  $("#ins-body").classList.toggle("hidden", empty);
  if (empty) return;
  const ins = computeInsights(recs);

  $("#st-focus").textContent = ins.focusMin ? fmtMin(ins.focusMin) : "0 分钟";
  $("#st-focus-sub").textContent = ins.completion != null ? `完成率 ${Math.round(ins.completion * 100)}%` : "还没有专注记录";
  $("#st-avg").textContent = ins.weekAvg != null ? `${Math.round(ins.weekAvg)} 分` : "--";
  $("#st-avg-sub").textContent = ins.weekAvg != null ? STATUS_TEXT[statusOf(ins.weekAvg)].title : "本周暂无检测";
  $("#st-place").textContent = ins.bestPlace ? ins.bestPlace.key : "--";
  $("#st-place-sub").textContent = ins.bestPlace ? `平均 ${Math.round(ins.bestPlace.score)} 分` : "每个地点至少记录 2 次";
  $("#st-period").textContent = ins.bestPeriod ? ins.bestPeriod.name : "--";
  $("#st-period-sub").textContent = ins.bestPeriod ? `平均 ${Math.round(ins.bestPeriod.score)} 分` : "记录再多一些";

  const f = $("#findings");
  f.innerHTML = ins.findings.length ? ins.findings.map((x) => `<li>${x}</li>`).join("")
    : `<li>记录再多一些（至少两个地点、每个地点两次以上），这里会告诉你在哪里、什么时候学得最好。</li>`;

  lineChart($("#trend"), ins.trend);
  barChart($("#by-place"), ins.byPlace);
  renderPref();

  const ul = $("#history");
  ul.innerHTML = "";
  const sorted = [...recs].sort((a, b) => b.ts - a.ts);
  const shown = state.showAll ? sorted : sorted.slice(0, 6);
  shown.forEach((r) => {
    const li = document.createElement("li");
    const st = r.score != null ? statusOf(r.score) : null;
    const detail = [
      r.type === "focus" ? `专注 ${r.durationMin} 分钟${r.completed ? "" : "（提前结束）"}` : "环境检测",
      r.lux != null ? `${r.lux} lx` : null,
      r.db != null ? `${r.db} dB` : null,
      r.weather ? `${r.weather.text} ${r.weather.temp}°C` : null,
      r.feedback ? ["", "😣", "😐", "😊"][r.feedback] : null,
    ].filter(Boolean).join(" · ");
    li.innerHTML = `
      <span class="h-icon" aria-hidden="true">${r.type === "focus" ? "⏱" : "◎"}</span>
      <div class="h-main"><div class="h-title"></div><div class="h-sub"></div></div>
      <span class="h-score">${st ? `<i style="background:${COLOR[st]}"></i>${r.score}` : "--"}</span>
      <button class="h-del" type="button" aria-label="删除这条记录">×</button>`;
    li.querySelector(".h-title").textContent = `${r.place} · ${fmtWhen(r.ts)}`;
    li.querySelector(".h-sub").textContent = detail;
    li.querySelector(".h-del").onclick = () => { state.store.remove(r.id); refreshPersonal(); renderInsights(); };
    ul.append(li);
  });
  if (sorted.length > 6) {
    const li = document.createElement("li");
    li.className = "more";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn";
    b.textContent = state.showAll ? "收起" : `显示全部 ${sorted.length} 条`;
    b.onclick = () => { state.showAll = !state.showAll; renderInsights(); };
    li.append(b);
    ul.append(li);
  }
  $("#clear-all").textContent = state.demo ? "重置演示数据" : "清空全部记录";
}

let clearArmed = false;
function clearAll() {
  const btn = $("#clear-all");
  if (!clearArmed) {
    clearArmed = true;
    btn.textContent = state.demo ? "再点一次确认重置" : "再点一次确认清空（不可恢复）";
    setTimeout(() => { clearArmed = false; if (state.view === "insights") renderInsights(); }, 4000);
    return;
  }
  clearArmed = false;
  state.store.clear();
  refreshPersonal();
  renderPlace();
  renderInsights();
}

/* ---------------- routing ---------------- */
function stopSensorsIfIdle() {
  if (!focus.running) {
    state.sensors.stop();
    clearInterval(state.loop);
  }
}
function route() {
  const view = (location.hash || "#env").slice(1);
  state.view = ["env", "focus", "places", "insights"].includes(view) ? view : "env";
  ["env", "focus", "places", "insights"].forEach((v) => $(`#view-${v}`).classList.toggle("hidden", v !== state.view));
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.tab === state.view) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  if (state.view === "env") {
    if (state.started && !state.sensors.active) startDetection();
    else if (state.started) renderEnv();
  } else if (state.view === "focus") {
    focus.tick();
    renderFocusEnv(evaluate(state.sensors.reading(), scoring()));
  } else {
    // 离开检测页且没有在专注：关闭摄像头和麦克风
    stopSensorsIfIdle();
    if (state.view === "places") renderPlaces(); else renderInsights();
  }
  window.scrollTo(0, 0);
}

/* ---------------- init ---------------- */
function init() {
  setMode(state.demo);
  $("#timer-fill").style.strokeDasharray = TCIRC;
  $("#start-live").onclick = () => startDetection();
  $("#start-demo").onclick = () => { setMode(true); startDetection(); };
  $("#demo-badge").onclick = () => {
    focus.running && focus.finish(false);
    setMode(false);
    state.started = false;
    $("#env-intro").classList.remove("hidden");
    $("#env-live").classList.add("hidden");
    location.hash = "#env";
    route();
  };
  $("#place-btn").onclick = () => openSheet(true);
  $("#place-close").onclick = () => openSheet(false);
  $("#place-sheet").onclick = (e) => { if (e.target.id === "place-sheet") openSheet(false); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { openSheet(false); closePlace(); } });
  $("#place-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#place-input").value.trim();
    if (!v) return;
    const p = state.store.addPlace({ name: v, category: state.newCat, lat: state.pos?.lat ?? null, lon: state.pos?.lon ?? null });
    $("#place-input").value = "";
    usePlace(p.id);
  };
  $("#nearby-btn").onclick = findNearby;
  $("#map-add").onclick = () => { openSheet(true); findNearby(); };
  $("#pd-close").onclick = closePlace;
  $("#pd-sheet").onclick = (e) => { if (e.target.id === "pd-sheet") closePlace(); };
  $("#pd-use").onclick = () => { if (pdId) { usePlace(pdId); openPlace(pdId); } };
  $("#pd-rename").onclick = () => {
    const f = $("#pd-rename-form");
    f.classList.toggle("hidden");
    $("#pd-rename-input").value = state.store.place(pdId)?.name || "";
    $("#pd-rename-input").focus();
  };
  $("#pd-rename-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#pd-rename-input").value.trim();
    if (!v || !pdId) return;
    state.store.renamePlace(pdId, v);
    renderPlace();
    renderPlaces();
    openPlace(pdId);
  };
  $("#pref-toggle").onchange = (e) => { state.store.setPref("personalize", e.target.checked); renderPref(); };
  $("#w-change").onclick = () => { $("#city-form").classList.toggle("hidden"); $("#city-input").focus(); };
  $("#city-form").onsubmit = async (e) => {
    e.preventDefault();
    const q = $("#city-input").value.trim();
    if (!q) return;
    $("#w-city").textContent = "查询中…";
    try {
      setWeather({ ...(await searchCity(q)), located: true });
      $("#city-form").classList.add("hidden");
    } catch (err) {
      $("#w-city").textContent = err.message || "查询失败";
    }
  };
  $("#save-check").onclick = saveCheck;
  $("#go-focus").onclick = () => { location.hash = "#focus"; };
  $("#f-start").onclick = () => focus.start();
  $("#f-pause").onclick = () => focus.pause();
  $("#f-stop").onclick = () => focus.finish(false);
  $("#demo-noise").onclick = () => state.sensors.triggerNoise?.();
  $("#opt-sound").checked = state.store.prefs.sound !== false;
  $("#opt-sound").onchange = (e) => state.store.setPref("sound", e.target.checked);
  $("#clear-all").onclick = clearAll;
  window.addEventListener("hashchange", route);
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.view === "insights") renderInsights(); if (state.view === "places") state.map?.invalidateSize(); }, 150);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && focus.running) focus.tick(); });

  renderFocusButtons();
  focus.tick();
  route();
  if (state.demo && params.get("autostart") !== "0") startDetection();
}

init();
