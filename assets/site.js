// 介绍页：评分曲线（直接复用 App 的评分函数，保证说明和实现一致）+ 桌面端嵌入演示
import { lightScore, noiseScore } from "../app/js/score.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
};

function curve(host, { fn, xMin, xMax, step, xTicks, unit, band, label }) {
  host.innerHTML = "";
  const W = Math.max(280, host.clientWidth), H = 200;
  const m = { t: 14, r: 12, b: 34, l: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (v) => m.l + ((v - xMin) / (xMax - xMin)) * iw;
  const y = (v) => m.t + ih - (v / 100) * ih;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart", role: "img", "aria-label": label }, host);

  if (band) {
    el("rect", { x: x(band[0]), y: m.t, width: x(band[1]) - x(band[0]), height: ih, class: "band" }, svg);
    el("text", { x: (x(band[0]) + x(band[1])) / 2, y: m.t + 14, class: "band-label", "text-anchor": "middle" }, svg).textContent = "理想区间";
  }
  [0, 50, 100].forEach((v) => {
    el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "grid" }, svg);
    el("text", { x: m.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, svg).textContent = v;
  });
  xTicks.forEach((v) => {
    el("text", { x: x(v), y: H - 16, class: "tick", "text-anchor": "middle" }, svg).textContent = v;
  });
  el("text", { x: m.l + iw, y: H - 2, class: "axis-title", "text-anchor": "end" }, svg).textContent = unit;

  const pts = [];
  for (let v = xMin; v <= xMax; v += step) pts.push([v, fn(v)]);
  const d = pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
  el("path", { d: `${d}L${x(xMax)},${y(0)}L${x(xMin)},${y(0)}Z`, class: "area" }, svg);
  el("path", { d, class: "line" }, svg);

  // 悬停读数
  const cross = el("line", { y1: m.t, y2: m.t + ih, class: "crosshair", opacity: 0 }, svg);
  const dot = el("circle", { r: 5, class: "dot", opacity: 0 }, svg);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  host.appendChild(tip);
  const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const raw = xMin + ((px - m.l) / iw) * (xMax - xMin);
    const v = Math.max(xMin, Math.min(xMax, Math.round(raw / step) * step));
    const s = fn(v);
    cross.setAttribute("x1", x(v)); cross.setAttribute("x2", x(v)); cross.setAttribute("opacity", 1);
    dot.setAttribute("cx", x(v)); dot.setAttribute("cy", y(s)); dot.setAttribute("opacity", 1);
    tip.textContent = `${v} ${unit} → ${s} 分`;
    tip.style.opacity = 1;
    const left = (x(v) / W) * r.width - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(r.width - tip.offsetWidth, left))}px`;
    tip.style.top = `${Math.max(0, (y(s) / H) * r.height - 38)}px`;
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); tip.style.opacity = 0; });
}

function drawCurves() {
  curve(document.getElementById("curve-light"), {
    fn: lightScore, xMin: 0, xMax: 2000, step: 10, xTicks: [0, 300, 750, 1500, 2000], unit: "lx", band: [300, 750], label: "光线照度与光线分的关系曲线",
  });
  curve(document.getElementById("curve-noise"), {
    fn: noiseScore, xMin: 25, xMax: 80, step: 1, xTicks: [30, 38, 45, 55, 65, 80], unit: "dB", band: [25, 38], label: "噪音分贝与噪音分的关系曲线",
  });
}

drawCurves();
let t;
window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawCurves, 150); });

// 只在桌面宽屏加载右侧的嵌入演示，手机上直接点按钮进入
const frame = document.getElementById("phone-frame");
if (frame && matchMedia("(min-width: 900px)").matches) frame.src = frame.dataset.src;
