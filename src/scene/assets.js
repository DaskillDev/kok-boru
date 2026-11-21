import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Загрузка внешних ассетов (CC0, Poly Haven — см. CREDITS.md):
// HDRI-небо и фототекстуры травы.

const base = import.meta.env.BASE_URL;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Перекрашивает фото сухой травы в нужную палитру, сохраняя фактуру
function tintGrass(img, rgb, keep = 0.3, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size);
  const p = d.data;
  let avg = 0;
  for (let i = 0; i < p.length; i += 16) avg += p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
  avg /= p.length / 16;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / avg;
    // зелёные участки фото остаются сочнее, бурые — суше
    const green = (p[i + 1] - p[i]) / 60;
    const k = Math.min(1.6, Math.max(0.45, lum));
    p[i] = Math.min(255, (rgb[0] * (1 - keep) + p[i] * keep * 1.4) * k * (1 - green * 0.12));
    p[i + 1] = Math.min(255, (rgb[1] * (1 - keep) + p[i + 1] * keep * 1.4) * k * (1 + green * 0.1));
    p[i + 2] = Math.min(255, (rgb[2] * (1 - keep) + p[i + 2] * keep * 1.4) * k);
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

// Находит солнце (самый яркий участок) и цвет горизонта в equirect-HDR
function analyzeSky(tex) {
  const { data, width, height } = tex.image;
  const half = tex.type === THREE.HalfFloatType;
  const get = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1;
  let bx = 0;
  let by = 0;
  const step = 4;
  for (let y = 0; y < height / 2; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const l = get(i) + get(i + 1) + get(i + 2);
      if (l > best) {
        best = l;
        bx = x;
        by = y;
      }
    }
  }
  // строка 0 массива — верх картинки (зенит)
  const u = (bx + 0.5) / width;
  const v = 1 - (by + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = (v - 0.5) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(theta), Math.sin(phi) * Math.cos(theta));

  // средний цвет чуть выше горизонта — для тумана
  const row = Math.floor(height * 0.47);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let x = 0; x < width; x += 8) {
    const i = (row * width + x) * 4;
    const cr = get(i);
    const cg = get(i + 1);
    const cb = get(i + 2);
    if (cr + cg + cb > 30) continue; // не учитываем солнце
    r += cr;
    g += cg;
    b += cb;
    n++;
  }
  const horizon = new THREE.Color(r / n, g / n, b / n);
  return { sunDir, horizon };
}

export async function loadAssets() {
  const [sky, diff, nor, rough] = await Promise.all([
    new HDRLoader().loadAsync(`${base}textures/sky_2k.hdr`),
    loadImage(`${base}textures/grass_diff.jpg`),
    new THREE.TextureLoader().loadAsync(`${base}textures/grass_nor.jpg`),
    new THREE.TextureLoader().loadAsync(`${base}textures/grass_rough.jpg`),
  ]);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  for (const t of [nor, rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
  }
  const withRepeat = (t, r) => {
    const c = t.clone();
    c.repeat.set(r, r);
    c.needsUpdate = true;
    return c;
  };
  return {
    sky,
    skyInfo: analyzeSky(sky),
    // набор PBR-карт травы с заданным тайлингом и палитрой
    grass(rgb, keep, repeatX, repeatY = repeatX) {
      const map = tintGrass(diff, rgb, keep);
      map.repeat.set(repeatX, repeatY);
      const n = withRepeat(nor, 1);
      n.repeat.set(repeatX, repeatY);
      const r = withRepeat(rough, 1);
      r.repeat.set(repeatX, repeatY);
      return { map, normalMap: n, roughnessMap: r };
    },
  };
}
