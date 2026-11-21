import * as THREE from 'three';
import { ornamentStripTexture } from '../scene/textures.js';

// Всадник из скруглённых примитивов (Capsule / Lathe / Sphere):
// чапан в цвет команды, пояс, сапоги, белый калпак.
// Начало координат — точка посадки (седло), +Z — вперёд, +Y — вверх.

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function limb(a, b, radius, mat) {
  _a.set(...a);
  _b.set(...b);
  const len = _a.distanceTo(_b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 6, 14), mat);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _b.clone().sub(_a).normalize());
  return m;
}

const sharedMats = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.65 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.45 }),
  felt: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.7, side: THREE.DoubleSide }),
  leather: new THREE.MeshStandardMaterial({ color: 0x4a2d1a, roughness: 0.55 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.8 }),
};

const teamMats = new Map();
function getTeamMats(team) {
  if (teamMats.has(team.id)) return teamMats.get(team.id);
  const trimCss = `#${new THREE.Color(team.trim).getHexString()}`;
  const darkCss = `#${new THREE.Color(team.dark).getHexString()}`;
  const strip = ornamentStripTexture(trimCss, darkCss);
  const m = {
    chapan: new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.6 }),
    pants: new THREE.MeshStandardMaterial({ color: team.dark, roughness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: team.trim, roughness: 0.4, metalness: 0.35 }),
    cloth: new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.75, side: THREE.DoubleSide }),
    strip: new THREE.MeshStandardMaterial({ map: strip, roughness: 0.6, side: THREE.DoubleSide }),
  };
  teamMats.set(team.id, m);
  return m;
}

// Попона: полотно, облегающее спину коня (эллиптическое сечение)
function drapeGeometry(rx, ry, phiMax, z0, z1, phiMin = -phiMax, segs = 20, uRepeat = 1) {
  const pos = [];
  const uv = [];
  const idx = [];
  const zs = 6;
  for (let j = 0; j <= zs; j++) {
    const z = z0 + ((z1 - z0) * j) / zs;
    for (let i = 0; i <= segs; i++) {
      const phi = phiMin + ((phiMax - phiMin) * i) / segs;
      pos.push(rx * Math.sin(phi), ry * Math.cos(phi) - ry, z);
      uv.push((j / zs) * uRepeat, i / segs);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < zs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Седло с попоной в цветах команды
export function createTack(team) {
  const tm = getTeamMats(team);
  const g = new THREE.Group();
  const rx = 0.325;
  const ry = 0.37;
  const cloth = new THREE.Mesh(drapeGeometry(rx, ry, 1.7, -0.5, 0.46), tm.cloth);
  g.add(cloth);
  // орнаментальные каймы по нижним краям
  for (const s of [-1, 1]) {
    const edge = new THREE.Mesh(
      drapeGeometry(rx + 0.008, ry + 0.008, s * 1.72, -0.51, 0.47, s * 1.42, 4, 4),
      tm.strip,
    );
    g.add(edge);
  }
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), sharedMats.leather);
  saddle.scale.set(0.95, 0.3, 1.25);
  saddle.position.set(0, 0.01, -0.05);
  g.add(saddle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), sharedMats.leather);
  pommel.scale.set(1, 1.3, 0.8);
  pommel.position.set(0, 0.11, 0.3);
  g.add(pommel);
  const cantle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), sharedMats.leather);
  cantle.scale.set(1.15, 0.6, 0.45);
  cantle.position.set(0, 0.08, -0.3);
  g.add(cantle);
  // подпруга
  const girth = new THREE.Mesh(drapeGeometry(rx + 0.012, ry + 0.012, 2.3, 0.05, 0.14), sharedMats.leather);
  g.add(girth);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export class RiderFigure {
  constructor(team) {
    const tm = getTeamMats(team);
    const g = (this.group = new THREE.Group());

    // --- корпус (наклоняется отдельно от ног) ---
    const torso = (this.torso = new THREE.Group());
    torso.position.y = 0.1;
    g.add(torso);

    const chapanPts = [
      [0.0, -0.1],
      [0.26, -0.09],
      [0.305, -0.04],
      [0.285, 0.06],
      [0.235, 0.17],
      [0.245, 0.3],
      [0.27, 0.43],
      [0.265, 0.52],
      [0.2, 0.6],
      [0.1, 0.645],
      [0.075, 0.67],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const chapan = new THREE.Mesh(new THREE.LatheGeometry(chapanPts, 28), tm.chapan);
    chapan.scale.set(1.12, 1, 0.82);
    torso.add(chapan);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.238, 0.03, 10, 32), tm.trim);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.12, 0.82, 1.25);
    belt.position.y = 0.185;
    torso.add(belt);

    // запа́х чапана — отделка спереди
    const lapel = limb([0.07, 0.6, 0.165], [-0.05, 0.2, 0.2], 0.022, tm.trim);
    torso.add(lapel);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.026, 8, 24), tm.trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.655;
    torso.add(collar);

    // шея и голова
    torso.add(limb([0, 0.62, 0], [0, 0.74, 0.01], 0.06, sharedMats.skin));
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.84, 0.015);
    torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 18), sharedMats.skin);
    skull.scale.set(0.95, 1.12, 1.0);
    head.add(skull);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), sharedMats.skin);
    nose.scale.set(0.9, 1.2, 1.2);
    nose.position.set(0, -0.015, 0.122);
    head.add(nose);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), sharedMats.hair);
      eye.position.set(s * 0.047, 0.022, 0.108);
      head.add(eye);
      const brow = limb([s * 0.02, 0.05, 0.112], [s * 0.075, 0.048, 0.1], 0.007, sharedMats.hair);
      head.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), sharedMats.skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 0.12, 0, 0);
      head.add(ear);
    }
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.128, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), sharedMats.hair);
    hair.scale.set(0.97, 1.1, 1.02);
    hair.position.set(0, 0.005, -0.012);
    hair.rotation.x = -0.35;
    head.add(hair);

    // калпак: высокая войлочная шапка с чёрными отворотами
    const kalpak = new THREE.Group();
    kalpak.position.y = 0.075;
    head.add(kalpak);
    const crownPts = [
      [0.142, 0.0],
      [0.146, 0.05],
      [0.136, 0.11],
      [0.108, 0.175],
      [0.062, 0.23],
      [0.02, 0.262],
      [0.0, 0.268],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    kalpak.add(new THREE.Mesh(new THREE.LatheGeometry(crownPts, 24), sharedMats.felt));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.07, 24, 1, true), sharedMats.black);
    brim.position.y = 0.035;
    kalpak.add(brim);
    const brimIn = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.146, 0.066, 24, 1, true), sharedMats.felt);
    brimIn.position.y = 0.037;
    kalpak.add(brimIn);
    for (let i = 0; i < 4; i++) {
      // чёрные швы-узоры по тулье
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const seam = limb(
        [Math.cos(a) * 0.147, 0.06, Math.sin(a) * 0.147],
        [Math.cos(a) * 0.07, 0.225, Math.sin(a) * 0.07],
        0.006,
        sharedMats.black,
      );
      kalpak.add(seam);
    }
    const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), sharedMats.black);
    tassel.position.y = 0.275;
    kalpak.add(tassel);

    // левая рука — держит повод
    torso.add(limb([-0.27, 0.55, 0], [-0.31, 0.3, 0.1], 0.066, tm.chapan));
    torso.add(limb([-0.31, 0.3, 0.1], [-0.14, 0.2, 0.36], 0.058, tm.chapan));
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), sharedMats.skin);
    lHand.position.set(-0.12, 0.19, 0.4);
    torso.add(lHand);
    torso.add(limb([-0.14, 0.2, 0.36], [-0.135, 0.195, 0.38], 0.064, tm.trim)); // манжета

    // правая рука — подвижная (повод / улак / замах / бросок)
    const arm = (this.arm = new THREE.Group());
    arm.position.set(0.28, 0.55, 0);
    torso.add(arm);
    arm.add(limb([0, 0, 0], [0.01, -0.27, 0.02], 0.066, tm.chapan));
    const fore = (this.forearm = new THREE.Group());
    fore.position.set(0.01, -0.27, 0.02);
    arm.add(fore);
    fore.add(limb([0, 0, 0], [0, -0.25, 0], 0.058, tm.chapan));
    fore.add(limb([0, -0.24, 0], [0, -0.265, 0], 0.064, tm.trim));
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.054, 12, 10), sharedMats.skin);
    rHand.position.set(0, -0.31, 0);
    fore.add(rHand);
    this.hand = rHand;

    // --- ноги ---
    for (const s of [-1, 1]) {
      const hip = [s * 0.13, 0.08, -0.02];
      const knee = [s * 0.36, -0.14, 0.27];
      const ankle = [s * 0.39, -0.62, 0.16];
      g.add(limb(hip, knee, 0.095, tm.pants));
      g.add(limb(knee, [s * 0.385, -0.4, 0.2], 0.075, tm.pants));
      g.add(limb([s * 0.385, -0.36, 0.2], ankle, 0.07, sharedMats.boot));
      const foot = limb(ankle, [s * 0.4, -0.66, 0.33], 0.058, sharedMats.boot);
      g.add(foot);
      // пола чапана поверх бедра
      const flap = limb([s * 0.17, 0.07, 0.0], [s * 0.33, -0.1, 0.2], 0.105, tm.chapan);
      flap.scale.set(1, 1, 0.75);
      g.add(flap);
      // стремя
      const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), tm.trim);
      stirrup.position.set(s * 0.4, -0.63, 0.24);
      stirrup.rotation.y = Math.PI / 2;
      g.add(stirrup);
    }

    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    this._armX = -0.9;
    this._armZ = 0;
    this._foreX = -0.6;
    this.swing = 0; // таймер анимации броска
  }

  // state: { carrying, charge (0..1 или -1), speed01, turn }
  update(dt, state) {
    let ax;
    let az;
    let fx;
    if (this.swing > 0) {
      // бросок: рука идёт сверху вперёд
      this.swing -= dt;
      const t = 1 - Math.max(this.swing, 0) / 0.35;
      ax = THREE.MathUtils.lerp(2.3, -1.9, Math.min(t * 1.8, 1));
      az = 0.15;
      fx = -0.2;
    } else if (state.charge >= 0) {
      ax = 0.4 + state.charge * 1.9; // замах назад-вверх
      az = 0.25;
      fx = -0.5;
    } else if (state.carrying) {
      ax = 0.15;
      az = 0.42;
      fx = -0.25;
    } else {
      ax = -0.85;
      az = -0.12;
      fx = -0.75;
    }
    const k = 1 - Math.exp(-dt * (this.swing > 0 ? 30 : 12));
    this._armX += (ax - this._armX) * k;
    this._armZ += (az - this._armZ) * k;
    this._foreX += (fx - this._foreX) * k;
    this.arm.rotation.set(this._armX, 0, this._armZ);
    this.forearm.rotation.x = this._foreX;

    // посадка: наклон вперёд на скорости, крен в повороте
    const lean = 0.08 + state.speed01 * 0.3;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * (1 - Math.exp(-dt * 6));
    this.torso.rotation.z += (-state.turn * 0.18 - this.torso.rotation.z) * (1 - Math.exp(-dt * 6));
    this.head.rotation.x = -this.torso.rotation.x * 0.7;
  }

  playThrow() {
    this.swing = 0.35;
  }
}
