// 本地记录存储（localStorage）。真实数据与演示数据分开保存，互不影响。
import { evaluate } from "./score.js";

const KEY_REAL = "studysync.records.v2";
const KEY_DEMO = "studysync.demo.v2";
const KEY_PREF = "studysync.prefs.v2";

export const DEFAULT_PLACES = ["图书馆", "宿舍", "教室", "咖啡馆", "家"];

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

export class Store {
  constructor(demo) {
    this.demo = demo;
    this.key = demo ? KEY_DEMO : KEY_REAL;
    this.records = read(this.key, null);
    if (!this.records) {
      this.records = demo ? seedDemo() : [];
      write(this.key, this.records);
    }
    this.prefs = read(KEY_PREF, { place: "图书馆", customPlaces: [], sound: true });
  }
  add(rec) {
    const r = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...rec };
    this.records.push(r);
    write(this.key, this.records);
    return r;
  }
  remove(id) {
    this.records = this.records.filter((r) => r.id !== id);
    write(this.key, this.records);
  }
  clear() {
    this.records = this.demo ? seedDemo() : [];
    write(this.key, this.records);
  }
  places() {
    const used = this.records.map((r) => r.place);
    return [...new Set([...DEFAULT_PLACES, ...this.prefs.customPlaces, ...used])];
  }
  setPref(k, v) {
    this.prefs[k] = v;
    write(KEY_PREF, this.prefs);
  }
}

// ---------- 演示数据：过去 12 天、四个地点的典型自习记录 ----------
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function seedDemo() {
  const rand = rng(20260428);
  const gauss = (m, sd) => m + (rand() + rand() + rand() - 1.5) * sd * 1.2;
  const profiles = {
    图书馆: { lux: [420, 110], db: [42, 4], hours: [9, 10, 14, 15, 19] },
    宿舍: { lux: [190, 70], db: [49, 6], hours: [20, 21, 22, 23] },
    咖啡馆: { lux: [360, 80], db: [61, 5], hours: [13, 16] },
    教室: { lux: [520, 90], db: [47, 5], hours: [10, 16, 19] },
  };
  const plan = ["图书馆", "宿舍", "图书馆", "咖啡馆", "宿舍", "教室", "图书馆", "宿舍", "咖啡馆", "图书馆", "宿舍", "教室",
    "图书馆", "宿舍", "图书馆", "咖啡馆", "宿舍", "图书馆", "教室", "宿舍", "图书馆", "宿舍"];
  const now = new Date();
  const out = [];
  plan.forEach((place, i) => {
    const p = profiles[place];
    const day = Math.floor(((plan.length - 1 - i) / plan.length) * 12);
    const d = new Date(now);
    d.setDate(now.getDate() - day);
    d.setHours(p.hours[Math.floor(rand() * p.hours.length)], Math.floor(rand() * 60), 0, 0);
    if (d > now) d.setDate(d.getDate() - 1);
    const lux = Math.max(40, Math.round(gauss(...p.lux)));
    const db = Math.max(30, Math.round(gauss(...p.db)));
    const ev = evaluate({ lux, db });
    const focus = rand() < 0.6;
    const planned = rand() < 0.65 ? 25 : 50;
    const completed = focus ? rand() < (ev.score >= 70 ? 0.9 : 0.55) : undefined;
    out.push({
      id: `demo-${i}`,
      ts: d.getTime(),
      type: focus ? "focus" : "check",
      place,
      lux,
      db,
      score: ev.score,
      weather: { city: "伦敦", temp: Math.round(gauss(13, 3)), text: rand() < 0.5 ? "多云" : "晴" },
      ...(focus ? {
        plannedMin: planned,
        durationMin: completed ? planned : Math.round(planned * (0.3 + rand() * 0.5)),
        completed,
        alerts: ev.score < 70 ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 1.4),
      } : {}),
    });
  });
  return out.sort((a, b) => a.ts - b.ts);
}
