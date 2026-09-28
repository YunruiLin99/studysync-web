// 学习环境评分模型
// 光线与噪音同等重要（各占一半），并考虑短板效应。室外天气只作为建议的上下文，不计入分数：
// 室外温度并不等于室内温度，把它算进分数会误导用户。

// 分段线性插值：points = [[x, score], ...]，x 递增
function piecewise(x, points) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

// 阅读、书写的桌面照度建议约 500 lx（参考 EN 12464-1），300–750 lx 视为理想区间；
// 过亮会带来眩光，适当扣分。
export function lightScore(lux) {
  return Math.round(piecewise(lux, [[0, 5], [50, 25], [150, 60], [300, 95], [400, 100], [750, 100], [1500, 80], [2000, 70]]));
}

// WHO 建议教室背景噪声不超过 35 dB(A)；55 dB 以上已明显干扰阅读理解。
// shift：个性化偏移（dB）。偏好稍有背景声的用户，整条曲线向右平移。
export function noiseScore(db, shift = 0) {
  return Math.round(piecewise(db - shift, [[30, 100], [38, 100], [45, 88], [55, 62], [65, 32], [75, 10]]));
}

export function lightLevel(lux) {
  if (lux < 250) return "dim";
  if (lux <= 750) return "good";
  return "glare";
}

export function noiseLevel(db, shift = 0) {
  if (db - shift <= 45) return "quiet";
  if (db - shift <= 55) return "moderate";
  return "noisy";
}

export const LIGHT_LABEL = { dim: "偏暗", good: "适宜", glare: "偏强" };
export const NOISE_LABEL = { quiet: "安静", moderate: "有些嘈杂", noisy: "嘈杂" };

// lux / db 可以为 null（对应传感器未授权）
// opts.noiseShift：个性化噪音偏移（见 personal.js），默认 0 = 通用标准
export function evaluate({ lux, db }, { noiseShift = 0 } = {}) {
  const parts = [];
  if (lux != null) parts.push(lightScore(lux));
  if (db != null) parts.push(noiseScore(db, noiseShift));
  if (!parts.length) return null;
  // 短板效应：一项很差时，另一项再好也救不回来。总分 = 平均分，但不超过最低项 + 15。
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  const score = Math.round(Math.min(mean, Math.min(...parts) + 15));
  return {
    score,
    partial: parts.length < 2,
    status: statusOf(score),
    light: lux != null ? { lux, level: lightLevel(lux), score: lightScore(lux) } : null,
    noise: db != null ? { db, level: noiseLevel(db, noiseShift), score: noiseScore(db, noiseShift) } : null,
  };
}

export function statusOf(score) {
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

export const STATUS_TEXT = {
  good: { title: "适合专注", icon: "✓" },
  fair: { title: "还可以，有提升空间", icon: "!" },
  poor: { title: "不太适合学习", icon: "✕" },
};

// 生成 1–3 条具体、可执行的建议，按影响排序
export function advise(result, weather, now = new Date()) {
  const tips = [];
  if (!result) return tips;
  const { light, noise } = result;
  const hour = now.getHours();

  if (light?.level === "dim") {
    const cloudy = weather && (weather.kind === "cloud" || weather.kind === "rain" || weather.kind === "fog" || weather.kind === "snow");
    tips.push({
      weight: 100 - light.score,
      text: weather && weather.isDay && cloudy
        ? `光线偏暗（约 ${light.lux} lx）。外面${weather.text}，窗边自然光也不够，建议打开台灯，桌面照度最好在 300–500 lx。`
        : `光线偏暗（约 ${light.lux} lx）。打开台灯或坐到光源附近，桌面照度最好在 300–500 lx。`,
    });
  } else if (light?.level === "glare") {
    tips.push({ weight: 100 - light.score, text: `光线偏强（约 ${light.lux} lx），容易产生眩光。拉上半边窗帘，或把屏幕调离直射光。` });
  }

  if (noise?.level === "noisy") {
    tips.push({ weight: 100 - noise.score, text: `环境嘈杂（约 ${noise.db} dB）。戴上降噪耳机，或换到图书馆静音区等更安静的地方。` });
  } else if (noise?.level === "moderate") {
    tips.push({ weight: 100 - noise.score, text: `有些嘈杂（约 ${noise.db} dB）。做需要深度思考的任务时，可以戴上耳机或播放白噪音。` });
  }

  if (hour >= 23 || hour < 5) {
    tips.push({ weight: 30, text: "已经很晚了。长时间熬夜会影响第二天的效率，考虑今天先到这里。" });
  }

  if (weather) {
    if (weather.temp >= 30) tips.push({ weight: 15, text: `室外 ${Math.round(weather.temp)}°C，比较热。注意室内通风，记得补水。` });
    else if (weather.temp <= 3) tips.push({ weight: 12, text: `室外只有 ${Math.round(weather.temp)}°C。如果室内也偏冷，手脚冰凉会让人难以专注，注意保暖。` });
    else if (weather.kind === "clear" && weather.isDay && result.status === "good") {
      tips.push({ weight: 5, text: "外面天气不错。每专注 25–50 分钟，可以出去走几分钟，晒晒太阳。" });
    }
  }

  if (!tips.length) tips.push({ weight: 0, text: "光线和安静程度都在理想区间，直接开始吧。" });
  return tips.sort((a, b) => b.weight - a.weight).slice(0, 3).map((t) => t.text);
}

// 专注中用的一句话提醒：指出当前最拖后腿的因素
export function mainIssue(result) {
  if (!result) return null;
  const c = [];
  if (result.light && result.light.level !== "good") c.push({ s: result.light.score, text: result.light.level === "dim" ? `光线偏暗（${result.light.lux} lx）` : `光线偏强（${result.light.lux} lx）` });
  if (result.noise && result.noise.level !== "quiet") c.push({ s: result.noise.score, text: `噪音偏高（${result.noise.db} dB）` });
  c.sort((a, b) => a.s - b.s);
  return c[0]?.text ?? null;
}
