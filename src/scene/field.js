import * as THREE from 'three';
import { FIELD, KAZAN, TEAMS, RULES } from '../config.js';
import { makeNoiseMap } from './textures.js';
import { fbm2 } from './noise.js';
import { kazanMaterials, kazanBoulders } from './props.js';
import { flagCanvas } from '../data/countries.js';

const flagTex = new Map();
function flagTexture(code) {
  if (!flagTex.has(code)) {
    const t = new THREE.CanvasTexture(flagCanvas(code, 256, 160));
    t.colorSpace = THREE.SRGBColorSpace;
    flagTex.set(code, t);
  }
  return flagTex.get(code);
}

const LINE_Y = 0.03;

function lineMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf4f1e6,
    roughness: 0.9,
    transparent: true,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function addLine(group, mat, x, z, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, LINE_Y, z);
  m.receiveShadow = true;
  group.add(m);
}

function addRing(group, mat, x, z, r, thick = 0.22, a0 = 0, a1 = Math.PI * 2) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - thick / 2, r + thick / 2, 72, 1, a0, a1 - a0), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, LINE_Y, z);
  m.receiveShadow = true;
  group.add(m);
}

// Поле: фототекстура травы + слой с полосами покоса и крупными пятнами, чтобы не было видно тайлинга
function createPitch(group, assets) {
  const L = FIELD.length + 16;
  const W = FIELD.width + 16;
  const maps = assets.grass([74, 124, 46], 0.28, L / 5, W / 5);
  const mat = new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0 });
  mat.normalScale.set(1.6, 1.6);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L, W), mat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);
  group.userData.pitchMaterial = mat;

  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const stripes = 16;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const n = fbm2(x / 90, y / 90, 4, 7) - 0.5;
      const stripe = Math.floor((x / c.width) * stripes) % 2 === 0 ? 1 : 0;
      const dark = stripe * 0.16 + n * 0.5;
      const i = (y * c.width + x) * 4;
      if (dark > 0) {
        img.data[i] = 0;
        img.data[i + 1] = 22;
        img.data[i + 2] = 0;
        img.data[i + 3] = Math.min(0.42, dark) * 255;
      } else {
        img.data[i] = 235;
        img.data[i + 1] = 240;
        img.data[i + 2] = 170;
        img.data[i + 3] = Math.min(0.2, -dark * 0.7) * 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const overlayMap = new THREE.CanvasTexture(c);
  overlayMap.colorSpace = THREE.SRGBColorSpace;
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshStandardMaterial({
      map: overlayMap,
      transparent: true,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = 0.012;
  overlay.receiveShadow = true;
  group.add(overlay);
  group.userData.overlay = overlay;

  const lm = lineMaterial();
  const hl = FIELD.length / 2;
  const hw = FIELD.width / 2;
  const t = 0.24;
  addLine(group, lm, 0, -hw, FIELD.length + t, t);
  addLine(group, lm, 0, hw, FIELD.length + t, t);
  addLine(group, lm, -hl, 0, t, FIELD.width);
  addLine(group, lm, hl, 0, t, FIELD.width);
  addLine(group, lm, 0, 0, t, FIELD.width);
  // круги для розыгрыша и схваток один на один («жекеме-жеке»)
  for (const cx of RULES.duelCircles) {
    addRing(group, lm, cx, 0, RULES.duelRadius);
    addRing(group, lm, cx, 0, 0.5, 1.0);
  }
  // зоны казанов
  for (const s of [-1, 1]) {
    addRing(group, lm, s * KAZAN.x, 0, 12, 0.22);
    addLine(group, lm, s * (KAZAN.x - 22), 0, t, FIELD.width * 0.6);
  }
}

// Профиль казана (тело вращения) — общий для картинки и для физической сетки
function kazanProfile() {
  const { innerR, outerR, height } = KAZAN;
  return [
    new THREE.Vector2(0.001, 0.25),
    new THREE.Vector2(innerR * 0.75, 0.27),
    new THREE.Vector2(innerR * 0.97, 0.45),
    new THREE.Vector2(innerR, height - 0.08),
    new THREE.Vector2(innerR + 0.1, height),
    new THREE.Vector2(innerR + 0.42, height),
    new THREE.Vector2(innerR + 0.55, height - 0.1),
    new THREE.Vector2(outerR - 0.25, 0.3),
    new THREE.Vector2(outerR, 0.0),
  ];
}

export function kazanCollisionMesh() {
  const g = new THREE.LatheGeometry(kazanProfile(), 40);
  return {
    vertices: new Float32Array(g.attributes.position.array),
    indices: new Uint32Array(g.index.array),
  };
}

// Тай-казан: круглая насыпь с чашей внутри
function createKazan(team) {
  const g = new THREE.Group();
  const { innerR, outerR, height } = KAZAN;
  const pts = kazanProfile();
  // каменная кладка на глиняном растворе
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), kazanMaterials().stone);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // цветной обод команды-хозяина
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(innerR + 0.26, 0.13, 12, 64),
    new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.45, metalness: 0.1 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height + 0.03;
  rim.castShadow = true;
  g.add(rim);
  g.userData.rimMat = rim.material;

  // орнаментальный пояс
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(outerR - 0.62, 0.07, 8, 64),
    new THREE.MeshStandardMaterial({ color: team.trim, roughness: 0.5, metalness: 0.2 }),
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = height * 0.55;
  g.add(belt);
  g.userData.beltMat = belt.material;

  // тёмное дно
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(innerR * 0.98, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.26;
  floor.receiveShadow = true;
  g.add(floor);
  g.add(kazanBoulders(outerR, team.id + 3));
  return g;
}

// Флаг на шесте — полотнище колышется (обновляется в update)
function createFlag(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 7, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, metalness: 0.3 }),
  );
  pole.position.y = 3.5;
  pole.castShadow = true;
  g.add(pole);
  const geo = new THREE.PlaneGeometry(2.6, 1.5, 14, 6);
  geo.translate(1.3, 0, 0);
  const cloth = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }),
  );
  cloth.position.y = 6.1;
  cloth.castShadow = true;
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.base = geo.attributes.position.array.slice();
  return g;
}

// Ограждение: столбики и жерди
function createFence(group) {
  const hl = FIELD.length / 2 + FIELD.margin + 1.2;
  const hw = FIELD.width / 2 + FIELD.margin + 1.2;
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  const posts = [];
  const step = 5;
  for (let x = -hl; x <= hl + 0.01; x += (hl * 2) / Math.round((hl * 2) / step)) {
    posts.push([x, -hw], [x, hw]);
  }
  for (let z = -hw; z <= hw + 0.01; z += (hw * 2) / Math.round((hw * 2) / step)) {
    posts.push([-hl, z], [hl, z]);
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 8), wood, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach(([x, z], i) => {
    m.makeTranslation(x, 0.75, z);
    pm.setMatrixAt(i, m);
  });
  pm.castShadow = true;
  group.add(pm);
  for (const y of [0.7, 1.25]) {
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, hl * 2, 6), wood);
      a.rotation.z = Math.PI / 2;
      a.position.set(0, y, s * hw);
      a.castShadow = true;
      group.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, hw * 2, 6), wood);
      b.rotation.x = Math.PI / 2;
      b.position.set(s * hl, y, 0);
      b.castShadow = true;
      group.add(b);
    }
  }
}

export function createField(scene, assets) {
  const group = new THREE.Group();
  createPitch(group, assets);
  createFence(group);

  const flags = [];
  const sides = []; // { s, kazan, flags } — по одному на каждый край поля
  for (const s of [-1, 1]) {
    const x = s * KAZAN.x;
    const kazan = createKazan(TEAMS[0]);
    kazan.position.set(x, 0, 0);
    group.add(kazan);
    const mine = [];
    for (const sz of [-1, 1]) {
      const f = createFlag(0xffffff);
      f.position.set(x + s * 5.5, 0, sz * 7);
      group.add(f);
      flags.push(f);
      mine.push(f);
    }
    sides.push({ s, kazan, flags: mine });
  }
  // Казан на краю s принадлежит команде, которая атакует в противоположную сторону.
  // После каждого периода команды меняются казанами — перекрашиваем обод и флаги.
  function setSides() {
    for (const side of sides) {
      const team = TEAMS.find((t) => t.attackDir === -side.s);
      side.kazan.userData.rimMat.color.set(team.color);
      side.kazan.userData.beltMat.color.set(team.trim);
      for (const f of side.flags) {
        const m = f.userData.cloth.material;
        m.map = flagTexture(team.code);
        m.color.set(0xffffff);
        m.needsUpdate = true;
      }
    }
  }
  setSides();
  scene.add(group);

  function update(time) {
    for (const f of flags) {
      const cloth = f.userData.cloth;
      const base = f.userData.base;
      const arr = cloth.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i];
        arr[i + 2] = Math.sin(x * 2.2 - time * 5 + f.position.z) * 0.16 * (x / 2.6);
        arr[i + 1] = base[i + 1] + Math.sin(x * 1.4 - time * 3.3) * 0.05 * x;
      }
      cloth.geometry.attributes.position.needsUpdate = true;
      cloth.geometry.computeVertexNormals();
    }
  }

  return { group, update, setSides };
}

// Живая трава на поле: пучки (InstancedMesh), качаются от ветра в вершинном шейдере
export function createFieldGrass(scene) {
  const blade = new THREE.PlaneGeometry(0.018, 0.2, 1, 2);
  blade.translate(0, 0.1, 0);
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const b = blade.clone();
    const pos = b.attributes.position;
    // изгиб травинки
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      pos.setZ(k, pos.getZ(k) + y * y * 1.2);
      pos.setX(k, pos.getX(k) * (1 - y * 3.5)); // к кончику травинка сужается
    }
    b.rotateY((i / 9) * Math.PI * 2 + Math.random());
    b.rotateZ((Math.random() - 0.5) * 0.4);
    b.scale(1, 0.6 + Math.random() * 0.7, 1);
    b.translate((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
    parts.push(b.toNonIndexed());
  }
  const pos = [];
  const nor = [];
  for (const g of parts) {
    g.computeVertexNormals();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // нормали «вверх» — трава освещается как газон, без чёрных изнанок
  const up = new Float32Array(pos.length);
  for (let i = 0; i < up.length; i += 3) up[i + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(up, 3));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21) + 0.5 * sin(uTime * 3.1 + ip.x * 0.9);
        transformed.x += w * 0.05 * transformed.y * transformed.y * 25.0;
        transformed.z += w * 0.025 * transformed.y * transformed.y * 25.0;`,
      );
  };

  const L = FIELD.length + 14;
  const W = FIELD.width + 14;
  const count = 34000;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  while (n < count) {
    p.set((Math.random() - 0.5) * L, 0, (Math.random() - 0.5) * W);
    // не растёт в казанах
    if (Math.min(Math.hypot(p.x - KAZAN.x, p.z), Math.hypot(p.x + KAZAN.x, p.z)) < KAZAN.outerR + 0.3) continue;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.28);
    const k = 0.8 + Math.random() * 0.6;
    sc.set(k, k * (0.7 + Math.random() * 0.6), k);
    m.compose(p, q, sc);
    mesh.setMatrixAt(n, m);
    const v = fbm2(p.x * 0.05, p.z * 0.05, 3, 4);
    c.setHSL(0.2 + v * 0.06, 0.45 + v * 0.15, 0.36 + v * 0.16);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    update(time) {
      uTime.value = time;
    },
  };
}
