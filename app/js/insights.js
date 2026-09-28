// 从历史记录里提炼结论：去哪学、什么时候学、专注了多久。
// 样本太少时不下结论，避免误导。

const DAY = 24 * 3600 * 1000;
const MIN_SAMPLES = 2;

export const PERIODS = [
  { key: "morning", name: "上午", from: 5, to: 12 },
  { key: "afternoon", name: "下午", from: 12, to: 18 },
  { key: "evening", name: "晚上", from: 18, to: 23 },
  { key: "late", name: "深夜", from: 23, to: 5 },
];

export function periodOf(ts) {
  const h = new Date(ts).getHours();
  return PERIODS.find((p) => (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to));
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

function groupAvg(records, keyFn) {
  const m = new Map();
  records.forEach((r) => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return [...m.entries()].map(([key, rs]) => ({
    key,
    n: rs.length,
    score: avg(rs.map((r) => r.score)),
    db: avg(rs.filter((r) => r.db != null).map((r) => r.db)),
    lux: avg(rs.filter((r) => r.lux != null).map((r) => r.lux)),
  }));
}

export function computeInsights(all, now = Date.now()) {
  // 没开环境监测的专注记录没有评分：计入专注时长，但不参与评分统计
  const records = all.filter((r) => r.score != null);
  const week = records.filter((r) => now - r.ts <= 7 * DAY);
  const focusWeek = all.filter((r) => now - r.ts <= 7 * DAY && r.type === "focus");
  const focusMin = focusWeek.reduce((a, r) => a + (r.durationMin || 0), 0);
  const deepMin = focusWeek.filter((r) => r.score >= 80).reduce((a, r) => a + (r.durationMin || 0), 0);
  const completion = focusWeek.length ? focusWeek.filter((r) => r.completed).length / focusWeek.length : null;

  const byPlace = groupAvg(records, (r) => r.place).sort((a, b) => b.score - a.score);
  const byPeriod = groupAvg(records, (r) => periodOf(r.ts).key)
    .map((g) => ({ ...g, name: PERIODS.find((p) => p.key === g.key).name }))
    .sort((a, b) => b.score - a.score);

  const placesOk = byPlace.filter((p) => p.n >= MIN_SAMPLES);
  const periodsOk = byPeriod.filter((p) => p.n >= MIN_SAMPLES);

  const findings = [];
  if (placesOk.length >= 2) {
    const best = placesOk[0], worst = placesOk[placesOk.length - 1];
    const gap = Math.round(best.score - worst.score);
    if (gap >= 8) {
      const why = worst.db - best.db >= 6 ? `，主要差在噪音（平均 ${Math.round(worst.db)} dB vs ${Math.round(best.db)} dB）`
        : best.lux - worst.lux >= 120 ? `，主要差在光线（平均 ${Math.round(worst.lux)} lx vs ${Math.round(best.lux)} lx）` : "";
      findings.push(`你在<b>${best.key}</b>的环境分比<b>${worst.key}</b>平均高 ${gap} 分${why}。需要深度专注的任务，优先安排在${best.key}。`);
    }
  }
  if (periodsOk.length >= 2) {
    const best = periodsOk[0], worst = periodsOk[periodsOk.length - 1];
    if (best.score - worst.score >= 8) findings.push(`<b>${best.name}</b>是你环境最好的时段（平均 ${Math.round(best.score)} 分），<b>${worst.name}</b>最差（${Math.round(worst.score)} 分）。`);
  }
  const focusAll = records.filter((r) => r.type === "focus");
  const good = focusAll.filter((r) => r.score >= 80), bad = focusAll.filter((r) => r.score < 60);
  if (good.length >= MIN_SAMPLES && bad.length >= MIN_SAMPLES) {
    const rg = good.filter((r) => r.completed).length / good.length;
    const rb = bad.filter((r) => r.completed).length / bad.length;
    if (rg - rb >= 0.15) findings.push(`环境分 80 以上时，你的专注完成率是 <b>${Math.round(rg * 100)}%</b>；低于 60 分时只有 <b>${Math.round(rb * 100)}%</b>。先调整环境，再开始计时。`);
  }
  const dorm = byPlace.find((p) => p.n >= MIN_SAMPLES && p.lux != null && p.lux < 250);
  if (dorm && findings.length < 3) findings.push(`${dorm.key}的平均光线只有 ${Math.round(dorm.lux)} lx，低于建议的 300 lx。加一盏台灯，是提升这里环境分最便宜的办法。`);

  return {
    count: all.length,
    focusMin,
    deepMin,
    completion,
    weekAvg: avg(week.map((r) => r.score)),
    bestPlace: placesOk[0] || null,
    bestPeriod: periodsOk[0] || null,
    byPlace,
    byPeriod,
    findings,
    trend: [...records].sort((a, b) => a.ts - b.ts).slice(-20),
  };
}
