// 个性化评分：每个人对噪音的偏好不同。有人需要绝对安静，
// 有人在咖啡馆的背景声里反而更专注（适度噪音对创造性任务的影响，见 Mehta et al., 2012）。
// 用户每次专注后反馈状态（1 😣 / 2 😐 / 3 😊），积累足够后，
// 用"状态好"那几次的噪音水平，平移通用噪音曲线。

export const NEED = 5;      // 至少 5 次反馈
export const NEED_GOOD = 3; // 其中至少 3 次"状态好"
const BASE = 40;            // 通用标准下，噪音满分区的中心（约 38–42 dB）

const quantile = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

export function learnPreference(records) {
  const fb = records.filter((r) => r.type === "focus" && r.feedback && r.db != null);
  const good = fb.filter((r) => r.feedback === 3).map((r) => r.db);
  const counts = { 1: 0, 2: 0, 3: 0 };
  fb.forEach((r) => counts[r.feedback]++);
  const ready = fb.length >= NEED && good.length >= NEED_GOOD;
  if (!ready) {
    return { ready, n: fb.length, counts, need: Math.max(NEED - fb.length, NEED_GOOD - good.length, 1), points: fb };
  }
  const median = quantile(good, 0.5);
  return {
    ready,
    n: fb.length,
    counts,
    median: Math.round(median),
    range: [Math.round(quantile(good, 0.25)), Math.round(quantile(good, 0.75))],
    // 限制在 -8 ~ +18 dB，避免少量数据把标准带偏太多
    shift: Math.max(-8, Math.min(18, Math.round(median - BASE))),
    points: fb,
  };
}
