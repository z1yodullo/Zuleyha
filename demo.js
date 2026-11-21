/* Generates warm abstract PNG art + demo gallery data (no deps beyond node stdlib) */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

/* ---------- PNG encode ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- palette ---------- */
const PAL = [
  [18, 7, 3], [58, 20, 4], [130, 44, 6], [194, 65, 12],
  [255, 106, 0], [255, 140, 30], [255, 170, 55], [255, 190, 90], [255, 205, 130]
];
function palAt(t) {
  t = Math.max(0, Math.min(1, t)) * (PAL.length - 1);
  const i = Math.floor(t), f = t - i;
  const a = PAL[i], b = PAL[Math.min(PAL.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(12345);

function makeArt(w, h, style) {
  const buf = Buffer.alloc(w * h * 4);
  const blobs = Array.from({ length: 5 + ((style * 3) % 4) }, () => ({
    x: rnd() * w, y: rnd() * h,
    r: (0.18 + rnd() * 0.42) * Math.max(w, h),
    s: 0.25 + rnd() * 0.75,
    hue: 0.3 + rnd() * 0.45
  }));
  const t0 = rnd() * 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      let t;

      if (style % 5 === 0) {            // diagonal dawn
        t = (u * 0.55 + v * 0.45 + Math.sin(v * 6 + t0) * 0.08);
      } else if (style % 5 === 1) {     // sunset horizon
        t = v * 0.9 + Math.sin(u * 4 + t0) * 0.07;
        if (v > 0.62) t += (v - 0.62) * 1.5;
      } else if (style % 5 === 2) {     // radial core
        const dx = u - 0.5, dy = v - 0.5;
        t = Math.sqrt(dx * dx + dy * dy) * 1.5 + Math.sin(Math.atan2(dy, dx) * 5 + t0) * 0.1;
      } else if (style % 5 === 3) {     // waves
        t = 0.5 + Math.sin(u * 5 + Math.sin(v * 3 + t0) * 1.6) * 0.28 + (v - 0.5) * 0.35;
      } else {                          // ember field
        t = 0.35 + Math.sin((u + v) * 4 + t0) * 0.18 + v * 0.3;
      }

      let r = 0, g = 0, b = 0;
      for (const bl of blobs) {
        const dx = x - bl.x, dy = y - bl.y;
        const d = Math.sqrt(dx * dx + dy * dy) / bl.r;
        if (d < 1) {
          const f = (1 - d) * (1 - d) * bl.s;
          const c = palAt(bl.hue);
          r += c[0] * f; g += c[1] * f; b += c[2] * f;
          t += f * 0.35;
        }
      }
      const base = palAt(t);
      r += base[0] * 0.85; g += base[1] * 0.85; b += base[2] * 0.85;

      // glowing ring / sun accent
      const cx = 0.3 + (style % 3) * 0.2, cy = 0.32 + (style % 2) * 0.18;
      const rr = Math.sqrt((u - cx) ** 2 + ((v - cy) * (h / w)) ** 2);
      const ring = Math.exp(-((rr - 0.16) ** 2) / 0.0016);
      const core = Math.exp(-(rr * rr) / 0.012);
      r += 255 * ring * 0.5 + 255 * core * 0.42;
      g += 130 * ring * 0.5 + 165 * core * 0.42;
      b += 25 * ring * 0.4 + 60 * core * 0.4;

      // warm grain + vignette
      const vig = 1 - Math.pow(Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 1.7, 2.4);
      const grain = (rnd() - 0.5) * 13 * (0.35 + 0.65 * Math.max(0.15, vig));
      const k = Math.max(0.15, vig);
      // warm shadows: darkening pulls toward ember brown, never neutral gray
      const wgt = 1 - k;
      r *= k; g *= k * (1 - 0.10 * wgt); b *= k * (1 - 0.26 * wgt);
      // proportional highlight roll-off: keeps hue orange instead of clipping to yellow
      const mx = Math.max(r, g, b);
      if (mx > 255) { const s = 255 / mx; r *= s; g *= s; b *= s; }
      // saturation boost for punchy warm look
      const lum = r * 0.3 + g * 0.55 + b * 0.15;
      r = lum + (r - lum) * 1.22; g = lum + (g - lum) * 1.22; b = lum + (b - lum) * 1.22;
      const mx2 = Math.max(r, g, b);
      if (mx2 > 255) { const s2 = 255 / mx2; r *= s2; g *= s2; b *= s2; }

      const i = (y * w + x) * 4;
      buf[i] = Math.min(255, Math.max(0, r + grain * 1.2));
      buf[i + 1] = Math.min(255, Math.max(0, g + grain * 0.85));
      buf[i + 2] = Math.min(255, Math.max(0, b + grain * 0.6));
      buf[i + 3] = 255;
    }
  }
  return encodePNG(w, h, buf);
}

/* ---------- demo data ---------- */
const DEMO = [
  { t: 'Закат над пустыней', d: 'Последние лучи солнца окрасили небо в цвета угля и мёда. Стоило дождаться всего пять минут.', c: ['nature', 'travel'], w: 1000, h: 700, s: 1 },
  { t: 'Утренний свет в окне', d: 'Тёплый свет сквозь стекло — начало дня, которое не хочется пропускать.', c: ['people'], w: 760, h: 950, s: 0 },
  { t: 'Огни ночного города', d: 'Фонари расплавились в один большой костёр на асфальте.', c: ['night', 'travel'], w: 1000, h: 640, s: 3 },
  { t: 'Рассвет у моря', d: 'Волны подхватили оранжевый и разнесли его по всей бухте.', c: ['nature'], w: 900, h: 900, s: 2 },
  { t: 'Домашний ужин', d: 'Паста, свеча и разговоры допоздна. Идеальный вечер.', c: ['food', 'people'], w: 820, h: 1040, s: 4 },
  { t: 'Пробежка на закате', d: 'Каждый километр давался легче, когда горизонт горел.', c: ['sport', 'nature'], w: 1000, h: 660, s: 1 },
  { t: 'Карта прошлого лета', d: 'Отмеченные точки, где мы были — и куда вернёмся.', c: ['travel'], w: 760, h: 980, s: 3 },
  { t: 'Пламя костра', d: 'Смотреть на огонь — лучший способ ничего не думать.', c: ['night', 'nature'], w: 1000, h: 720, s: 2 },
  { t: 'Портрет в тёплом свете', d: 'Золотой час — лучший фотограф в мире.', c: ['people'], w: 800, h: 1000, s: 0 },
  { t: 'Улочка Старого города', d: 'Камни ещё помнят жару прошлого дня.', c: ['travel', 'night'], w: 1000, h: 680, s: 4 },
  { t: 'Чашка кофе на рассвете', d: 'Аромат, от которого просыпается даже самый сонный.', c: ['food'], w: 900, h: 900, s: 1 },
  { t: 'Сила и ветер', d: 'Тренировка заканчивается там, где заканчивается солнце.', c: ['sport'], w: 780, h: 960, s: 3 }
];

function seedDemo(UPLOAD_DIR, db) {
  const KEY_MAP = {
    people: 'Люди', nature: 'Природа', travel: 'Путешествия',
    food: 'Еда', night: 'Ночь', sport: 'Спорт'
  };
  const ids = {};
  db.categories.forEach(c => {
    ids[c.name] = c.id;
    for (const [k, ru] of Object.entries(KEY_MAP)) if (ru === c.name) ids[k] = c.id;
  });

  const now = Date.now();
  DEMO.forEach((item, i) => {
    const w = item.w, h = item.h;
    const png = makeArt(w, h, item.s);
    const fname = crypto.randomBytes(12).toString('hex') + '.png';
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), png);
    db.media.push({
      id: 'm-demo-' + i,
      kind: 'photo',
      url: '/uploads/' + fname,
      name: 'demo-' + (i + 1) + '.png',
      size: png.length,
      mime: 'image/png',
      title: item.t,
      description: item.d,
      categories: item.c.map(k => ids[k]).filter(Boolean),
      createdAt: now - (DEMO.length - i) * 3600_000
    });
  });
  return db.media.length;
}

module.exports = { seedDemo };
