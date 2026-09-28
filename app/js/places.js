// 具体地点：用 OpenStreetMap（Overpass API，免费、无需 key）找出附近有名字的地点，
// 比如某家咖啡店、某个图书馆。地点和位置只保存在本机。

export const CATEGORIES = [
  { key: "library", name: "图书馆", icon: "📚" },
  { key: "cafe", name: "咖啡馆", icon: "☕" },
  { key: "classroom", name: "教室", icon: "🏫" },
  { key: "dorm", name: "宿舍", icon: "🛏️" },
  { key: "home", name: "家", icon: "🏠" },
  { key: "cowork", name: "共享办公", icon: "💼" },
  { key: "other", name: "其他", icon: "📍" },
];
export const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

const OVERPASS = "https://overpass-api.de/api/interpreter";

function osmCategory(tags) {
  const a = tags.amenity, o = tags.office, b = tags.building;
  if (a === "library") return "library";
  if (a === "cafe") return "cafe";
  if (a === "university" || a === "college" || a === "school" || b === "university") return "classroom";
  if (a === "coworking_space" || o === "coworking") return "cowork";
  if (b === "dormitory") return "dorm";
  return "other";
}

export function distance(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("浏览器不支持定位"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e && e.code === 1 ? "没有获取定位权限" : "暂时无法定位")),
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
}

// 返回附近 250 米内有名字的地点，按距离排序
export async function nearbyPlaces(pos) {
  const r = 250;
  const q = `[out:json][timeout:12];(
    nwr(around:${r},${pos.lat},${pos.lon})["amenity"~"^(cafe|library|university|college|school|coworking_space|restaurant|fast_food|community_centre|arts_centre)$"]["name"];
    nwr(around:${r},${pos.lat},${pos.lon})["office"="coworking"]["name"];
    nwr(around:${r},${pos.lat},${pos.lon})["building"~"^(university|dormitory|library)$"]["name"];
  );out center 40;`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const seen = new Set();
    return data.elements
      .map((e) => {
        const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
        const name = e.tags["name:zh"] || e.tags.name;
        return { osmId: `${e.type}/${e.id}`, name, category: osmCategory(e.tags), lat, lon, dist: Math.round(distance(pos, { lat, lon })) };
      })
      .filter((p) => p.name && p.lat != null && !seen.has(p.name) && seen.add(p.name))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12);
  } finally {
    clearTimeout(t);
  }
}

// 演示模式：虚构的附近地点
export function demoNearby() {
  return [
    { osmId: "demo/n1", name: "学校图书馆 · 三楼自习区", category: "library", lat: 51.5247, lon: -0.1340, dist: 40 },
    { osmId: "demo/n2", name: "街角咖啡馆", category: "cafe", lat: 51.5215, lon: -0.1312, dist: 120 },
    { osmId: "demo/n3", name: "教学楼 A204", category: "classroom", lat: 51.5222, lon: -0.1368, dist: 150 },
    { osmId: "demo/n4", name: "新开的共享自习室", category: "cowork", lat: 51.5256, lon: -0.1385, dist: 210 },
  ];
}
