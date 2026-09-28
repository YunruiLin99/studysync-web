// 天气：浏览器定位 → Open-Meteo（免费、无需 API key，不存在密钥泄露问题）
// 定位被拒绝时，可以手动搜索城市；再不行默认显示伦敦。

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const LONDON = { lat: 51.5074, lon: -0.1278, city: "伦敦" };

// WMO 天气代码 → 文案 / 类型 / 图标
function describe(code, isDay) {
  const map = [
    [[0], "晴", "clear", isDay ? "☀️" : "🌙"],
    [[1], "大部晴朗", "clear", isDay ? "🌤️" : "🌙"],
    [[2], "多云", "cloud", "⛅"],
    [[3], "阴天", "cloud", "☁️"],
    [[45, 48], "有雾", "fog", "🌫️"],
    [[51, 53, 55, 56, 57], "毛毛雨", "rain", "🌦️"],
    [[61, 63, 65, 66, 67, 80, 81, 82], "下雨", "rain", "🌧️"],
    [[71, 73, 75, 77, 85, 86], "下雪", "snow", "🌨️"],
    [[95, 96, 99], "雷雨", "rain", "⛈️"],
  ];
  const hit = map.find(([codes]) => codes.includes(code));
  return hit ? { text: hit[1], kind: hit[2], icon: hit[3] } : { text: "未知", kind: "cloud", icon: "☁️" };
}

async function getJSON(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { timeout: 8000, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

async function cityName(lat, lon) {
  try {
    const d = await getJSON(`${REVERSE}?latitude=${lat}&longitude=${lon}&localityLanguage=zh`, 6000);
    return d.city || d.locality || d.principalSubdivision || null;
  } catch {
    return null;
  }
}

export async function fetchWeatherAt({ lat, lon, city }) {
  const q = `${FORECAST}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day,relative_humidity_2m&timezone=auto`;
  const d = await getJSON(q);
  const c = d.current;
  const isDay = c.is_day === 1;
  return {
    city: city || (await cityName(lat, lon)) || "当前位置",
    temp: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    code: c.weather_code,
    isDay,
    ...describe(c.weather_code, isDay),
  };
}

// 自动流程：先定位；失败时返回伦敦天气，并标记 located=false，界面据此提示手动选城市
export async function autoWeather() {
  try {
    const pos = await locate();
    return { ...(await fetchWeatherAt(pos)), located: true };
  } catch (e) {
    const w = await fetchWeatherAt(LONDON);
    return { ...w, located: false, reason: e && e.code === 1 ? "denied" : "unavailable" };
  }
}

export async function searchCity(name) {
  const d = await getJSON(`${GEOCODE}?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`);
  const r = d.results && d.results[0];
  if (!r) throw new Error("没有找到这个城市");
  return fetchWeatherAt({ lat: r.latitude, lon: r.longitude, city: r.name });
}

export function demoWeather() {
  return { city: "伦敦", temp: 13, humidity: 72, code: 2, isDay: true, located: true, ...describe(2, true) };
}
