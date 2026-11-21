import * as THREE from 'three';
import { mulberry32, tileNoise } from './noise.js';

// Детальные модели окружения, собранные кодом:
//  — юрта: войлок со складками между решёткой-кереге, ремни-бау, жерди-уук под войлоком,
//    түндүк, резная дверь;
//  — казан: каменная кладка на глине, отдельные валуны у основания;
//  — фактуры для них рисуются на canvas.

const canvasTex = (c, srgb = true, repeat = [1, 1]) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
};

// ---------- войлок ----------
function feltTextures() {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const b = document.createElement('canvas');
  b.width = w;
  b.height = h;
  const bctx = b.getContext('2d');
  const bimg = bctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // волокна войлока: мелкий шум + крупные пятна, к низу — грязнее
      const n1 = tileNoise((x / w) * 64, (y / h) * 32, 64, 3);
      const n2 = tileNoise((x / w) * 8, (y / h) * 4, 8, 9);
      const dirt = Math.max(0, (y / h - 0.72) * 2.6);
      const v = 228 - n1 * 22 - n2 * 18 - dirt * 60;
      const i = (y * w + x) * 4;
      img.data[i] = v + 6;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 14 - dirt * 10;
      img.data[i + 3] = 255;
      const bv = 128 + (n1 - 0.5) * 120;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bv;
      bimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  // швы между кусками войлока
  ctx.strokeStyle = 'rgba(120,100,80,0.35)';
  bctx.strokeStyle = 'rgba(40,40,40,0.8)';
  ctx.lineWidth = bctx.lineWidth = 3;
  for (const y of [h * 0.33, h * 0.66]) {
    for (const k of [ctx, bctx]) {
      k.beginPath();
      k.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) k.lineTo(x, y + Math.sin(x * 0.05) * 3);
      k.stroke();
    }
  }
  return { map: canvasTex(c, true, [3, 1]), bump: canvasTex(b, false, [3, 1]) };
}

// ---------- орнаментальная полоса (бау) ----------
function bandTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8f1d1a';
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = '#e8b64a';
  ctx.fillRect(0, 0, 1024, 7);
  ctx.fillRect(0, 89, 1024, 7);
  ctx.strokeStyle = '#f4e3b8';
  ctx.lineWidth = 6;
  for (let x = 0; x < 1024; x += 64) {
    const cx = x + 32;
    const cy = 48;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 24);
    ctx.lineTo(cx, cy - 2);
    ctx.bezierCurveTo(cx, cy - 26, cx - 26, cy - 26, cx - 22, cy - 6);
    ctx.bezierCurveTo(cx - 20, cy + 4, cx - 10, cy + 2, cx - 10, cy - 6);
    ctx.moveTo(cx, cy - 2);
    ctx.bezierCurveTo(cx, cy - 26, cx + 26, cy - 26, cx + 22, cy - 6);
    ctx.bezierCurveTo(cx + 20, cy + 4, cx + 10, cy + 2, cx + 10, cy - 6);
    ctx.stroke();
  }
  return canvasTex(c, true, [4, 1]);
}

// ---------- резная дверь ----------
function doorTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9b3a1c';
  ctx.fillRect(0, 0, 256, 384);
  ctx.strokeStyle = '#e9b24a';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 228, 356);
  ctx.strokeRect(36, 36, 184, 140);
  ctx.strokeRect(36, 200, 184, 148);
  ctx.lineWidth = 5;
  for (const [x, y] of [[128, 106], [128, 274]]) {
    ctx.beginPath();
    ctx.moveTo(x, y + 40);
    ctx.bezierCurveTo(x - 60, y + 10, x - 50, y - 50, x, y - 20);
    ctx.bezierCurveTo(x + 50, y - 50, x + 60, y + 10, x, y + 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTex(c);
}

let shared = null;
function yurtMaterials() {
  if (shared) return shared;
  const felt = feltTextures();
  shared = {
    felt: new THREE.MeshStandardMaterial({ map: felt.map, bumpMap: felt.bump, bumpScale: 1.6, roughness: 0.97 }),
    roof: new THREE.MeshStandardMaterial({ map: felt.map, bumpMap: felt.bump, bumpScale: 1.6, roughness: 0.97, color: 0xf2ece0 }),
    band: new THREE.MeshStandardMaterial({ map: bandTexture(), roughness: 0.8 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: 0.9 }),
    ropeLight: new THREE.MeshStandardMaterial({ color: 0xd8c7a6, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.75 }),
    door: new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.65 }),
  };
  return shared;
}

// Юрта радиусом R: стены с провисанием войлока между рейками кереге, купол на жердях
export function createDetailedYurt(seed = 1) {
  const M = yurtMaterials();
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const R = 3.3;
  const wallH = 1.85;
  const segs = 96;

  // стены: войлок прогибается между рейками решётки (24 ячейки по кругу)
  const wall = new THREE.CylinderGeometry(R, R * 1.03, wallH, segs, 6, true);
  const p = wall.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(z, x);
    const sag = Math.pow(Math.abs(Math.sin(a * 12)), 0.6) * 0.035 + (rnd() - 0.5) * 0.008;
    const bulge = 1 - sag / R - Math.sin((y / wallH + 0.5) * Math.PI) * 0.004;
    p.setX(i, x * bulge);
    p.setZ(i, z * bulge);
  }
  wall.computeVertexNormals();
  const wallMesh = new THREE.Mesh(wall, M.felt);
  wallMesh.position.y = wallH / 2;
  g.add(wallMesh);

  // купол: под войлоком проступают жерди-уук (48 штук)
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = R * 1.04 * Math.cos(t * Math.PI * 0.46) * (1 - t * 0.08) + 0.02;
    const y = wallH + Math.sin(t * Math.PI * 0.5) * 1.7;
    pts.push(new THREE.Vector2(Math.max(r, 0.58), y));
  }
  const roof = new THREE.LatheGeometry(pts, 144);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const z = rp.getZ(i);
    const y = rp.getY(i);
    const a = Math.atan2(z, x);
    const ridge = Math.pow(Math.abs(Math.cos(a * 24)), 8) * 0.03 * Math.min(1, (y - wallH) * 2);
    const k = 1 + ridge / Math.max(Math.hypot(x, z), 0.5);
    rp.setX(i, x * k);
    rp.setZ(i, z * k);
    rp.setY(i, y + ridge * 0.6);
  }
  roof.computeVertexNormals();
  g.add(new THREE.Mesh(roof, M.roof));

  // орнаментальная полоса и ремни-бау, стягивающие стены
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.012, R * 1.012, 0.42, segs, 1, true), M.band);
  band.position.y = wallH - 0.32;
  g.add(band);
  for (const y of [0.35, 0.95]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(R * 1.018, 0.028, 6, 96), M.ropeLight);
    tie.rotation.x = Math.PI / 2;
    tie.position.y = y;
    g.add(tie);
  }
  const eave = new THREE.Mesh(new THREE.TorusGeometry(R * 1.05, 0.06, 8, 96), M.rope);
  eave.rotation.x = Math.PI / 2;
  eave.position.y = wallH + 0.02;
  g.add(eave);

  // радиальные верёвки по куполу (бастырык)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const curve = new THREE.CatmullRomCurve3(
      pts.map((v) => new THREE.Vector3(Math.cos(a) * (v.x + 0.025), v.y + 0.02, Math.sin(a) * (v.x + 0.025))),
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 5, false), M.rope));
  }

  // түндүк: кольцо и крестовины
  const tunduk = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.085, 10, 32), M.wood);
  tunduk.rotation.x = Math.PI / 2;
  tunduk.position.y = wallH + 1.72;
  g.add(tunduk);
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 1.1, 3, 6), M.wood);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = (i * Math.PI) / 3;
    bar.position.y = wallH + 1.76;
    g.add(bar);
  }
  // приоткрытый войлочный клапан на түндүке
  const flap = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24, 0, Math.PI), M.roof);
  flap.rotation.x = -Math.PI / 2 + 0.5;
  flap.position.set(0, wallH + 1.74, -0.1);
  g.add(flap);

  // резная дверь в раме
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.7, 0.12), M.wood);
  frame.position.set(0, 0.85, R - 0.01);
  g.add(frame);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.5), M.door);
  door.position.set(0, 0.82, R + 0.065);
  g.add(door);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.35), M.wood);
  sill.position.set(0, 0.06, R + 0.1);
  g.add(sill);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ---------- казан: каменная кладка на глине ----------
function stoneTextures() {
  // каменная кладка: диаграмма Вороного — камни неровной формы, между ними глиняный раствор
  const w = 512;
  const h = 256;
  const cols = 14;
  const rows = 6;
  const rnd = mulberry32(5);
  const pts = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      pts.push({
        x: ((i + 0.5 + (rnd() - 0.5) * 0.7) / cols) * w,
        y: ((j + 0.5 + (rnd() - 0.5) * 0.6) / rows) * h,
        tone: 0.7 + rnd() * 0.45,
        hue: rnd(),
      });
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const b = document.createElement('canvas');
  b.width = w;
  b.height = h;
  const img = c.getContext('2d').createImageData(w, h);
  const bimg = b.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      let best = null;
      for (const p of pts) {
        // бесшовность по горизонтали и вертикали
        let dx = Math.abs(x - p.x);
        let dy = Math.abs(y - p.y);
        dx = Math.min(dx, w - dx);
        dy = Math.min(dy, h - dy);
        const d = dx * dx + dy * dy * 1.6;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = p;
        } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1); // расстояние до шва
      const n = tileNoise((x / w) * 32, (y / h) * 16, 32, 7);
      const i = (y * w + x) * 4;
      if (edge < 3.2) {
        // раствор: тёмная глина
        const v = 92 + n * 30;
        img.data[i] = v * 1.12;
        img.data[i + 1] = v * 0.95;
        img.data[i + 2] = v * 0.72;
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = 40 + edge * 12;
      } else {
        const t = best.tone * (0.88 + n * 0.24);
        img.data[i] = (150 + best.hue * 35) * t;
        img.data[i + 1] = (140 + best.hue * 22) * t;
        img.data[i + 2] = (124 + best.hue * 8) * t;
        // камень выпуклый: светлее к центру
        const bump = Math.min(255, 120 + Math.min(edge, 18) * 7 + n * 40);
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bump;
      }
      img.data[i + 3] = bimg.data[i + 3] = 255;
    }
  }
  c.getContext('2d').putImageData(img, 0, 0);
  b.getContext('2d').putImageData(bimg, 0, 0);
  return { map: canvasTex(c, true, [9, 2.2]), bump: canvasTex(b, false, [9, 2.2]) };
}

let stoneShared = null;
export function kazanMaterials() {
  if (stoneShared) return stoneShared;
  const st = stoneTextures();
  stoneShared = {
    stone: new THREE.MeshStandardMaterial({ map: st.map, bumpMap: st.bump, bumpScale: 2.2, roughness: 0.93, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8a8076, roughness: 0.95, flatShading: true }),
  };
  return stoneShared;
}

// Валуны у подножия казана
export function kazanBoulders(outerR, seed = 3) {
  const rnd = mulberry32(seed);
  const n = 26;
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + rnd() * 0.5;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, kazanMaterials().rock, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
    const r = outerR - 0.05 + rnd() * 0.35;
    const k = 0.14 + rnd() * 0.18;
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    s.set(k * (1 + rnd() * 0.5), k, k * (1 + rnd() * 0.5));
    m.compose(new THREE.Vector3(Math.cos(a) * r, k * 0.35, Math.sin(a) * r), q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.08, 0.08 + rnd() * 0.08, 0.4 + rnd() * 0.15));
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- шерсть улака: оболочки с «волосками» ----------
export function furShells(baseGeo, layers = 6, length = 0.035) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(17);
  for (let i = 0; i < size * size; i++) {
    const v = rnd();
    const tone = 90 + rnd() * 90;
    img.data[i * 4] = tone * 1.05;
    img.data[i * 4 + 1] = tone * 0.9;
    img.data[i * 4 + 2] = tone * 0.75;
    img.data[i * 4 + 3] = v * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTex(c, true, [6, 6]);
  tex.magFilter = THREE.NearestFilter;
  const g = new THREE.Group();
  for (let l = 1; l <= layers; l++) {
    const t = l / layers;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.35 + t * 0.55, // чем дальше от кожи, тем реже волоски
      roughness: 1,
      color: new THREE.Color().setScalar(0.7 + t * 0.35),
    });
    const m = new THREE.Mesh(baseGeo, mat);
    m.scale.setScalar(1 + (length * t) / 0.22);
    m.castShadow = l === 1;
    g.add(m);
  }
  return g;
}
