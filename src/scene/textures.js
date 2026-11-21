import * as THREE from 'three';
import { tileNoise, mulberry32 } from './noise.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(c, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Трава: несколько октав тайлящегося шума + мелкие «травинки»
export function grassTexture({ base = [86, 128, 52], variance = 34, size = 512, seed = 3 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 1;
      let tot = 0;
      for (let o = 0; o < 4; o++) {
        const p = 4 << o;
        n += amp * tileNoise((x / size) * p, (y / size) * p, p, seed + o);
        tot += amp;
        amp *= 0.55;
      }
      n = n / tot - 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = base[0] + n * variance * 0.9;
      img.data[i + 1] = base[1] + n * variance;
      img.data[i + 2] = base[2] + n * variance * 0.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed * 7);
  for (let k = 0; k < size * 9; k++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const l = 2 + rnd() * 5;
    const light = rnd() > 0.5;
    ctx.strokeStyle = light
      ? `rgba(${base[0] + 50},${base[1] + 60},${base[2] + 20},0.35)`
      : `rgba(${base[0] - 40},${base[1] - 40},${base[2] - 25},0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 2, y - l);
    ctx.stroke();
  }
  return c;
}

export function makeGrassMap(opts, repeat) {
  return finish(grassTexture(opts), { repeat });
}

// Карта шероховатости/бампа из того же шума
export function makeNoiseMap(size = 256, seed = 9, repeat = 1) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v =
        0.6 * tileNoise((x / size) * 16, (y / size) * 16, 16, seed) +
        0.4 * tileNoise((x / size) * 64, (y / size) * 64, 64, seed + 1);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 90 + v * 140;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, { repeat, srgb: false });
}

// Войлок юрты с орнаментальной полосой (кыргызский «кочкор мүйүз» в упрощённом виде)
export function yurtWallTexture() {
  const w = 1024;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece4d3';
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(11);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(120,100,70,${rnd() * 0.06})`;
    ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 1 + rnd() * 3);
  }
  // орнамент
  const top = 30;
  const bh = 70;
  ctx.fillStyle = '#9b2320';
  ctx.fillRect(0, top, w, bh);
  ctx.fillStyle = '#e8b64a';
  ctx.fillRect(0, top - 6, w, 6);
  ctx.fillRect(0, top + bh, w, 6);
  ctx.strokeStyle = '#f2dfb0';
  ctx.lineWidth = 6;
  const step = 64;
  for (let x = 0; x < w; x += step) {
    const cx = x + step / 2;
    const cy = top + bh / 2;
    ctx.beginPath();
    // бараньи рога — две спирали
    ctx.moveTo(cx, cy + 22);
    ctx.lineTo(cx, cy - 4);
    ctx.bezierCurveTo(cx, cy - 26, cx - 26, cy - 26, cx - 22, cy - 6);
    ctx.bezierCurveTo(cx - 20, cy + 4, cx - 10, cy + 2, cx - 10, cy - 6);
    ctx.moveTo(cx, cy - 4);
    ctx.bezierCurveTo(cx, cy - 26, cx + 26, cy - 26, cx + 22, cy - 6);
    ctx.bezierCurveTo(cx + 20, cy + 4, cx + 10, cy + 2, cx + 10, cy - 6);
    ctx.stroke();
  }
  // нижняя кайма
  ctx.fillStyle = '#5d3a22';
  ctx.fillRect(0, h - 22, w, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.anisotropy = 8;
  return t;
}

// Узор для попоны/чапана: полоса с ромбами
export function ornamentStripTexture(fg = '#f0c24a', bg = '#7a1b16') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, 256, 6);
  ctx.fillRect(0, 58, 256, 6);
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + 16, 12);
    ctx.lineTo(x + 30, 32);
    ctx.lineTo(x + 16, 52);
    ctx.lineTo(x + 2, 32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.fillRect(x + 12, 28, 8, 8);
    ctx.fillStyle = fg;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Мех/шкура улака
export function furTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a7360';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(5);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const s = rnd();
    ctx.strokeStyle = s > 0.5 ? 'rgba(60,45,35,0.35)' : 'rgba(200,180,150,0.3)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1 + rnd() * 2, y + 4 + rnd() * 5);
    ctx.stroke();
  }
  return finish(c, { repeat: 2 });
}
