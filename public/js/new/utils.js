// utils.js

export function radToDeg(r) { return r * 180 / Math.PI; }
export function degToRad(d) { return d * Math.PI / 180; }
export function radToVector(r) {
  return { x: Math.cos(r), y: Math.sin(r), z: 0 };
}
export function angleValueToRad(value) {
  if (typeof value === "number") return value;
  if (value && typeof value.x === "number" && typeof value.y === "number") {
    return Math.atan2(value.y, value.x);
  }
  return 0;
}
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest-path angle interpolation (radians)
export function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  let diff = (b - a) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}

export function randId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
