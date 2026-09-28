// 轻量 SVG 图表（无依赖）：评分趋势折线 + 地点平均分条形图，均带悬停/触摸提示。
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmtDate = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function tooltip(host) {
  let tip = host.querySelector(".chart-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "status");
    host.appendChild(tip);
  }
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.style.opacity = "1";
      const w = tip.offsetWidth, hw = host.clientWidth;
      tip.style.left = `${Math.max(0, Math.min(hw - w, x - w / 2))}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
    },
    hide() { tip.style.opacity = "0"; },
  };
}

export function lineChart(host, points) {
  host.querySelector("svg")?.remove();
  const W = Math.max(260, host.clientWidth), H = 190;
  const m = { t: 16, r: 34, b: 26, l: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": "最近记录的环境评分趋势" });
  host.prepend(svg);
  const x = (i) => m.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => m.t + ih - (v / 100) * ih;

  [0, 50, 100].forEach((v) => {
    el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "grid" }, svg);
    el("text", { x: m.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, svg).textContent = v;
  });
  if (!points.length) return;

  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  el("path", { d: `${d}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, class: "area" }, svg);
  el("path", { d, class: "line" }, svg);

  const last = points[points.length - 1];
  el("circle", { cx: x(points.length - 1), cy: y(last.score), r: 4.5, class: "dot" }, svg);
  el("text", { x: x(points.length - 1) + 8, y: y(last.score) + 4, class: "end-label" }, svg).textContent = last.score;

  el("text", { x: m.l, y: H - 6, class: "tick" }, svg).textContent = fmtDate(points[0].ts);
  if (points.length > 1) el("text", { x: m.l + iw, y: H - 6, class: "tick", "text-anchor": "end" }, svg).textContent = fmtDate(last.ts);

  const cross = el("line", { y1: m.t, y2: m.t + ih, class: "crosshair", opacity: 0 }, svg);
  const hot = el("circle", { r: 5, class: "dot hot", opacity: 0 }, svg);
  const tip = tooltip(host);
  const hit = el("rect", { x: m.l - 10, y: 0, width: iw + 20, height: H, fill: "transparent" }, svg);
  const move = (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = points.length === 1 ? 0 : Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / iw) * (points.length - 1))));
    const p = points[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
    hot.setAttribute("cx", x(i)); hot.setAttribute("cy", y(p.score)); hot.setAttribute("opacity", 1);
    const extra = [p.lux != null ? `${p.lux} lx` : null, p.db != null ? `${p.db} dB` : null].filter(Boolean).join(" · ");
    tip.show(`<b>${p.score} 分</b> · ${p.place}<br><span>${fmtTime(p.ts)}${extra ? "<br>" + extra : ""}</span>`,
      (x(i) / W) * rect.width, (y(p.score) / H) * rect.height);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); hot.setAttribute("opacity", 0); tip.hide(); });
}

export function barChart(host, rows) {
  host.querySelector("svg")?.remove();
  const W = Math.max(260, host.clientWidth);
  const rowH = 34, labelW = 64, valueW = 74;
  const H = rows.length * rowH + 4;
  const iw = W - labelW - valueW;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": "各地点平均环境评分" });
  host.prepend(svg);
  const tip = tooltip(host);
  rows.forEach((r, i) => {
    const cy = i * rowH + rowH / 2;
    const w = Math.max(6, (r.score / 100) * iw);
    el("text", { x: 0, y: cy + 4, class: "bar-label" }, svg).textContent = r.key;
    el("rect", { x: labelW, y: cy - 6, width: iw, height: 12, rx: 6, class: "track" }, svg);
    // 4px 圆角数据端、基线处为直角：用 path 画
    const x0 = labelW, x1 = labelW + w, h = 12, top = cy - 6, rr = Math.min(4, w / 2);
    el("path", { d: `M${x0},${top}H${x1 - rr}Q${x1},${top} ${x1},${top + rr}V${top + h - rr}Q${x1},${top + h} ${x1 - rr},${top + h}H${x0}Z`, class: "bar" }, svg);
    el("text", { x: labelW + iw + 8, y: cy + 4, class: "bar-value" }, svg).textContent = `${Math.round(r.score)} 分`;
    el("text", { x: W, y: cy + 4, class: "bar-n", "text-anchor": "end" }, svg).textContent = `${r.n} 次`;
    const hit = el("rect", { x: 0, y: i * rowH, width: W, height: rowH, fill: "transparent" }, svg);
    const show = () => {
      const rect = svg.getBoundingClientRect();
      const parts = [r.lux != null ? `平均 ${Math.round(r.lux)} lx` : null, r.db != null ? `${Math.round(r.db)} dB` : null].filter(Boolean).join(" · ");
      tip.show(`<b>${r.key}</b> · ${Math.round(r.score)} 分<br><span>${r.n} 条记录${parts ? "<br>" + parts : ""}</span>`, ((x1) / W) * rect.width, (top / H) * rect.height);
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => tip.hide());
  });
}

// 本次专注的环境分曲线：x = 已专注时间，y = 环境分，附 60 分提醒线
export function sessionChart(host, samples, totalSec) {
  host.querySelector("svg")?.remove();
  const W = Math.max(260, host.clientWidth), H = 150;
  const m = { t: 10, r: 12, b: 22, l: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const last = samples[samples.length - 1].t;
  const span = Math.max(60, Math.min(totalSec || last, Math.max(last, 60)));
  const xMax = Math.max(span, last);
  const x = (t) => m.l + (t / xMax) * iw;
  const y = (v) => m.t + ih - (v / 100) * ih;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": "本次专注期间的环境分变化" });
  host.prepend(svg);

  [0, 50, 100].forEach((v) => {
    el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "grid" }, svg);
    el("text", { x: m.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, svg).textContent = v;
  });
  el("line", { x1: m.l, x2: m.l + iw, y1: y(60), y2: y(60), class: "ref" }, svg);
  el("text", { x: m.l + iw, y: y(60) - 5, class: "ref-label", "text-anchor": "end" }, svg).textContent = "提醒线 60";
  el("text", { x: m.l, y: H - 4, class: "tick" }, svg).textContent = "0:00";
  el("text", { x: m.l + iw, y: H - 4, class: "tick", "text-anchor": "end" }, svg).textContent = mmss(xMax);

  // 最多画 240 个点
  const step = Math.max(1, Math.ceil(samples.length / 240));
  const pts = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  el("path", { d: `${d}L${x(pts[pts.length - 1].t)},${y(0)}L${x(pts[0].t)},${y(0)}Z`, class: "area" }, svg);
  el("path", { d, class: "line" }, svg);
  const lp = pts[pts.length - 1];
  el("circle", { cx: x(lp.t), cy: y(lp.score), r: 4.5, class: "dot" }, svg);

  const cross = el("line", { y1: m.t, y2: m.t + ih, class: "crosshair", opacity: 0 }, svg);
  const tip = tooltip(host);
  const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const t = (((e.clientX - r.left) / r.width) * W - m.l) / iw * xMax;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    cross.setAttribute("x1", x(best.t)); cross.setAttribute("x2", x(best.t)); cross.setAttribute("opacity", 1);
    const extra = [best.lux != null ? `${best.lux} lx` : null, best.db != null ? `${best.db} dB` : null].filter(Boolean).join(" · ");
    tip.show(`<b>${best.score} 分</b> · ${mmss(best.t)}${extra ? `<br><span>${extra}</span>` : ""}`, (x(best.t) / W) * r.width, (y(best.score) / H) * r.height);
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); tip.hide(); });
}
