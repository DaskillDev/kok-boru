import * as THREE from 'three';
import { FIELD, KAZAN, TEAMS } from '../config.js';
import { grassTexture, makeNoiseMap } from './textures.js';

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

// Поле: скошенная трава полосами + разметка
function createPitch(group) {
  const L = FIELD.length + 16;
  const W = FIELD.width + 16;
  // текстура с полосами покоса: рисуем траву и затемняем каждую вторую полосу
  const src = grassTexture({ base: [78, 132, 50], variance: 30, seed: 4 });
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 1024, 1024);
  ctx.fillStyle = 'rgba(0,30,0,0.13)';
  ctx.fillRect(0, 0, 512, 1024);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(L / 16, W / 16);
  map.anisotropy = 16;
  const bump = makeNoiseMap(256, 12, 1);
  bump.repeat.set(L / 4, W / 4);
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.95, metalness: 0 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L, W), mat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  const lm = lineMaterial();
  const hl = FIELD.length / 2;
  const hw = FIELD.width / 2;
  const t = 0.24;
  addLine(group, lm, 0, -hw, FIELD.length + t, t);
  addLine(group, lm, 0, hw, FIELD.length + t, t);
  addLine(group, lm, -hl, 0, t, FIELD.width);
  addLine(group, lm, hl, 0, t, FIELD.width);
  addLine(group, lm, 0, 0, t, FIELD.width);
  addRing(group, lm, 0, 0, 9);
  addRing(group, lm, 0, 0, 0.5, 1.0);
  // зоны казанов
  for (const s of [-1, 1]) {
    addRing(group, lm, s * KAZAN.x, 0, 12, 0.22);
    addLine(group, lm, s * (KAZAN.x - 22), 0, t, FIELD.width * 0.6);
  }
}

// Тай-казан: круглая насыпь с чашей внутри
function createKazan(team) {
  const g = new THREE.Group();
  const { innerR, outerR, height } = KAZAN;
  const pts = [
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
  const rough = makeNoiseMap(256, 31, 6);
  const clay = new THREE.MeshStandardMaterial({
    color: 0xb9a184,
    roughness: 0.92,
    bumpMap: rough,
    bumpScale: 1.2,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), clay);
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

  // орнаментальный пояс
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(outerR - 0.62, 0.07, 8, 64),
    new THREE.MeshStandardMaterial({ color: team.trim, roughness: 0.5, metalness: 0.2 }),
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = height * 0.55;
  g.add(belt);

  // тёмное дно
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(innerR * 0.98, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.26;
  floor.receiveShadow = true;
  g.add(floor);
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

export function createField(scene) {
  const group = new THREE.Group();
  createPitch(group);
  createFence(group);

  const flags = [];
  for (const team of TEAMS) {
    // казан команды стоит на её стороне (противоположной направлению атаки)
    const x = -KAZAN.x * team.attackDir;
    const kazan = createKazan(team);
    kazan.position.set(x, 0, 0);
    group.add(kazan);
    for (const sz of [-1, 1]) {
      const f = createFlag(team.color);
      f.position.set(x - team.attackDir * 5.5, 0, sz * 7);
      group.add(f);
      flags.push(f);
    }
  }
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

  return { group, update };
}
