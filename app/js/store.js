// 本地存储（localStorage）：记录、地点、偏好。真实数据与演示数据分开保存，互不影响。
// 所有数据只在本机，不上传。
import { evaluate } from "./score.js";

const KEYS = {
  real: { records: "studysync.records.v2", places: "studysync.places.v3", prefs: "studysync.prefs.v3" },
  demo: { records: "studysync.demo.v3", places: "studysync.demo-places.v3", prefs: "studysync.demo-prefs.v3" },
};

const DEFAULT_PLACES = [
  { name: "图书馆", category: "library" },
  { name: "宿舍", category: "dorm" },
  { name: "教室", category: "classroom" },
  { name: "咖啡馆", category: "cafe" },
  { name: "家", category: "home" },
];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export class Store {
  constructor(demo) {
    this.demo = demo;
    this.k = demo ? KEYS.demo : KEYS.real;
    this.records = read(this.k.records, null);
    this.placeList = read(this.k.places, null);
    if (demo && (!this.records || !this.placeList)) {
      const seed = seedDemo();
      this.records = seed.records;
      this.placeList = seed.places;
    }
    this.records ||= [];
    if (!this.placeList) this.placeList = migratePlaces(this.records);
    this.prefs = read(this.k.prefs, null) || {
      placeId: (demo ? this.placeList[0] : this.placeList.find((p) => p.name === "图书馆") || this.placeList[0]).id,
      sound: true,
      personalize: true,
    };
    this._save();
  }
  _save() {
    write(this.k.records, this.records);
    write(this.k.places, this.placeList);
    write(this.k.prefs, this.prefs);
  }

  /* records */
  add(rec) {
    const p = this.currentPlace();
    const r = { id: uid("r"), ts: Date.now(), placeId: p.id, place: p.name, category: p.category, ...rec };
    this.records.push(r);
    this._save();
    return r;
  }
  update(id, patch) {
    const r = this.records.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    this._save();
  }
  remove(id) {
    this.records = this.records.filter((r) => r.id !== id);
    this._save();
  }
  clear() {
    if (this.demo) {
      const seed = seedDemo();
      this.records = seed.records;
      this.placeList = seed.places;
      this.prefs.placeId = this.placeList[0].id;
    } else {
      this.records = [];
    }
    this._save();
  }

  /* places */
  currentPlace() {
    return this.placeList.find((p) => p.id === this.prefs.placeId) || this.placeList[0];
  }
  place(id) {
    return this.placeList.find((p) => p.id === id);
  }
  addPlace({ name, category, lat = null, lon = null, osmId = null }) {
    const same = this.placeList.find((p) => (osmId && p.osmId === osmId) || p.name === name);
    if (same) {
      if (lat != null && same.lat == null) Object.assign(same, { lat, lon });
      this._save();
      return same;
    }
    const p = { id: uid("p"), name, category, lat, lon, osmId, createdAt: Date.now() };
    this.placeList.push(p);
    this._save();
    return p;
  }
  renamePlace(id, name) {
    const p = this.place(id);
    if (!p || !name) return;
    p.name = name;
    this.records.forEach((r) => { if (r.placeId === id) r.place = name; });
    this._save();
  }
  setPref(k, v) {
    this.prefs[k] = v;
    this._save();
  }
}

// 旧版本只存了地点名称：为每个名称建一个地点，并把记录关联上
function migratePlaces(records) {
  const list = DEFAULT_PLACES.map((p) => ({ id: uid("p"), ...p, lat: null, lon: null }));
  records.forEach((r) => {
    let p = list.find((x) => x.name === r.place);
    if (!p) {
      p = { id: uid("p"), name: r.place, category: "other", lat: null, lon: null };
      list.push(p);
    }
    r.placeId = p.id;
    r.category = p.category;
  });
  return list;
}

// ---------- 演示数据：过去两周、五个具体地点的自习记录（地点均为虚构） ----------
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function seedDemo() {
  const rand = rng(20260929);
  const gauss = (m, sd) => m + (rand() + rand() + rand() - 1.5) * sd * 1.2;
  const P = {
    lib: { id: "demo-lib", name: "学校图书馆 · 三楼自习区", category: "library", lat: 51.5247, lon: -0.1340, lux: [430, 100], db: [41, 4], hours: [9, 10, 14, 15, 19] },
    dorm: { id: "demo-dorm", name: "宿舍书桌", category: "dorm", lat: 51.5282, lon: -0.1338, lux: [190, 70], db: [49, 6], hours: [20, 21, 22, 23] },
    cafe1: { id: "demo-cafe1", name: "街角咖啡馆", category: "cafe", lat: 51.5215, lon: -0.1312, lux: [360, 80], db: [61, 4], hours: [10, 16], hourDb: { 10: -11, 16: 2 } },
    cls: { id: "demo-cls", name: "教学楼 A204", category: "classroom", lat: 51.5222, lon: -0.1368, lux: [520, 90], db: [47, 5], hours: [10, 16, 19] },
    cafe2: { id: "demo-cafe2", name: "社区咖啡书店", category: "cafe", lat: 51.5263, lon: -0.1296, lux: [410, 60], db: [50, 3], hours: [11, 15] },
  };
  const plan = ["lib", "dorm", "cafe1", "lib", "cafe2", "dorm", "cls", "cafe1", "lib", "dorm", "cafe2", "lib", "cafe1", "dorm",
    "cls", "lib", "cafe2", "dorm", "cafe1", "lib", "cls", "dorm", "cafe2", "lib", "dorm", "cafe1", "lib", "cafe2"];
  const now = new Date();
  const visits = {};
  const records = plan.map((key, i) => {
    const p = P[key];
    visits[key] = (visits[key] || 0) + 1;
    const day = Math.floor(((plan.length - 1 - i) / plan.length) * 14);
    const d = new Date(now);
    d.setDate(now.getDate() - day);
    const hour = p.hours[visits[key] % p.hours.length];
    d.setHours(hour, Math.floor(rand() * 60), 0, 0);
    if (d > now) d.setDate(d.getDate() - 1);
    const lux = Math.max(40, Math.round(gauss(...p.lux)));
    const db = Math.max(30, Math.round(gauss(p.db[0] + (p.hourDb?.[hour] || 0), p.db[1])));
    const ev = evaluate({ lux, db });
    const focus = rand() < 0.7;
    const planned = rand() < 0.65 ? 25 : 50;
    const completed = focus ? rand() < (ev.score >= 70 ? 0.85 : 0.45) : undefined;
    // 演示用户：在 44–54 dB 的"轻微背景声"里状态最好，太暗或太吵都不行
    let feedback;
    if (focus && rand() < 0.85) {
      if (lux < 250) feedback = rand() < 0.6 ? 1 : 2;
      else if (db >= 58) feedback = rand() < 0.7 ? 1 : 2;
      else if (db >= 44 && db <= 54) feedback = rand() < 0.8 ? 3 : 2;
      else feedback = rand() < 0.45 ? 3 : 2;
    }
    return {
      id: `demo-${i}`,
      ts: d.getTime(),
      type: focus ? "focus" : "check",
      placeId: p.id,
      place: p.name,
      category: p.category,
      lux,
      db,
      score: ev.score,
      weather: { city: "伦敦", temp: Math.round(gauss(13, 3)), text: rand() < 0.5 ? "多云" : "晴" },
      ...(focus ? {
        plannedMin: planned,
        durationMin: completed ? planned : Math.round(planned * (0.3 + rand() * 0.5)),
        completed,
        alerts: ev.score < 70 ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 1.4),
        ...(feedback ? { feedback } : {}),
      } : {}),
    };
  }).sort((a, b) => a.ts - b.ts);
  const places = Object.values(P).map(({ id, name, category, lat, lon }) => ({ id, name, category, lat, lon, osmId: null }));
  return { records, places };
}
