import { ASSET_BASE } from '../assetBase.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Всадник: модель «rider-kok-boru» — фигура в посадке верхом, собранная из жёстких частей
// (корпус, голова, плечи, предплечья, бёдра, голени), соединённых в суставах. Скелета и анимаций в файле нет:
// движения делаются поворотами частей в суставах. Форма красится кодом в цвета команды.
// Начало координат группы — точка посадки (седло), +Z — вперёд, +Y — вверх, +X — влево от всадника.

const RIDER_SCALE = 1; // модель сделана в метрах под нашего коня
// Материалы модели, которые красятся в цвета команды (остальные остаются как в файле)
const TEAM_PAINT = { 'Madder red jersey': 'color', 'Midnight blue': 'dark', 'Ochre piping': 'trim' };
// Части штатной шапки модели (стёганый шлем) — прячутся под калпаком и тебетеем
const CAP_PARTS = new Set(['Padded riding cap', 'Cap binding', 'Short visor', 'Crown button']);
// Суставы модели
const JOINTS = ['Spine', 'Head', 'Shoulder.R', 'Elbow.R', 'Shoulder.L', 'Elbow.L', 'Hip.R', 'Knee.R', 'Hip.L', 'Knee.L'];

let proto = null;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _c = new THREE.Color();

// three.js при загрузке заменяет в именах точки и пробелы — сравниваем имена без них
const norm = (n) => String(n || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

export async function loadRiderAsset(onProgress) {
  const gltf = await new GLTFLoader().loadAsync(`${ASSET_BASE}models/rider-kok-boru.glb`, onProgress);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const joints = new Map(); // нормализованное имя → узел модели
  scene.traverse((o) => {
    const j = JOINTS.find((n) => norm(n) === norm(o.name));
    if (j && !o.isMesh) joints.set(j, o);
  });
  for (const j of JOINTS) if (!joints.has(j)) throw new Error(`Rider joint not found: ${j}`);

  // Каждая часть тела — десятки мелких деталей. Склеиваем детали одного сустава в одну геометрию,
  // цвет материала записываем в вершины: всадник рисуется за 11 вызовов вместо 38.
  // parts: [{ joint, cap, pieces: [{ geo (в координатах сустава), paint (ключ цвета команды или null), color }] }]
  const parts = [];
  const inv = new THREE.Matrix4();
  for (const [name, node] of joints) {
    const groups = { body: [], cap: [] };
    inv.copy(node.matrixWorld).invert();
    for (const child of node.children) {
      if (!child.isMesh) continue;
      const geo = child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld));
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const m = child.material;
      const isCap = [...CAP_PARTS].some((n) => norm(n) === norm(child.name));
      groups[isCap ? 'cap' : 'body'].push({ geo, paint: TEAM_PAINT[m.name] || null, color: m.color.clone() });
    }
    for (const kind of ['body', 'cap']) if (groups[kind].length) parts.push({ joint: name, cap: kind === 'cap', pieces: groups[kind] });
  }

  // центр кисти в координатах локтя — туда крепятся повод и улак
  const hands = {};
  for (const side of ['R', 'L']) {
    const elbow = joints.get(`Elbow.${side}`);
    const hand = elbow.children.find((c) => c.isMesh && norm(c.name).startsWith('reinhand') /* одинаковые имена загрузчик нумерует */);
    const box = new THREE.Box3().setFromBufferAttribute(hand.geometry.attributes.position);
    hands[side] = box.getCenter(new THREE.Vector3()).applyMatrix4(hand.matrix);
  }

  // пустой каркас из суставов — его копирует каждый всадник
  const rig = new THREE.Group();
  const made = new Map();
  for (const [name, node] of joints) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.copy(node.position);
    o.quaternion.copy(node.quaternion);
    made.set(node, o);
  }
  for (const [, node] of joints) (made.get(node.parent) || rig).add(made.get(node));

  proto = { rig, parts, hands, geos: new Map() };
  return proto;
}

const riderMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.7 });

// Геометрии частей тела в цветах команды (общие для всех всадников команды)
function teamGeometries(team) {
  const key = `${team.color}:${team.dark}:${team.trim}`;
  if (proto.geos.has(key)) return proto.geos.get(key);
  const list = proto.parts.map((part) => {
    const colored = part.pieces.map((pc) => {
      const g = pc.geo.clone();
      if (pc.paint) _c.set(team[pc.paint]);
      else _c.copy(pc.color);
      // брюки и шапка — тёмный цвет команды, но не в черноту
      if (pc.paint === 'dark') _c.multiplyScalar(0.8);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    return mergeGeometries(colored, false);
  });
  proto.geos.set(key, list);
  return list;
}

const mats = {
  felt: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.75, side: THREE.DoubleSide }),
};

// Калпак: высокая белая войлочная шапка с чёрными отворотами
function createKalpak() {
  const g = new THREE.Group();
  const pts = [
    [0.104, 0.0],
    [0.108, 0.04],
    [0.102, 0.085],
    [0.082, 0.135],
    [0.048, 0.178],
    [0.016, 0.203],
    [0.0, 0.208],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mats.felt);
  crown.scale.set(1, 1, 1.12);
  g.add(crown);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.112, 0.055, 28, 1, true), mats.black);
  brim.position.y = 0.027;
  brim.scale.set(1, 1, 1.12);
  g.add(brim);
  const brimIn = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.109, 0.052, 28, 1, true), mats.felt);
  brimIn.position.y = 0.029;
  brimIn.scale.set(1, 1, 1.12);
  g.add(brimIn);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const from = new THREE.Vector3(Math.cos(a) * 0.109, 0.045, Math.sin(a) * 0.122);
    const to = new THREE.Vector3(Math.cos(a) * 0.05, 0.176, Math.sin(a) * 0.056);
    const seam = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, from.distanceTo(to), 3, 6), mats.black);
    seam.position.copy(from).add(to).multiplyScalar(0.5);
    seam.quaternion.setFromUnitVectors(Y, to.clone().sub(from).normalize());
    g.add(seam);
  }
  const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mats.black);
  tassel.position.y = 0.212;
  g.add(tassel);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// Тебетей: меховой околыш и цветная войлочная тулья — как у современных команд
function createTebetey() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 });
  const top = new THREE.MeshStandardMaterial({ color: 0xe9c23a, roughness: 0.8 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 10, 28), fur);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.12, 1.25);
  rim.position.y = 0.04;
  g.add(rim);
  const crownPts = [[0.11, 0.03], [0.115, 0.09], [0.1, 0.14], [0.06, 0.17], [0.0, 0.18]].map(([r, y]) => new THREE.Vector2(r, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(crownPts, 24), top);
  crown.scale.set(1, 1, 1.12);
  g.add(crown);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

const numberMats = new Map();
// Номер игрока: белые цифры с тёмной обводкой на прозрачном фоне
function numberMaterial(n) {
  if (numberMats.has(n)) return numberMats.get(n);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '900 96px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(10,14,22,0.9)';
  ctx.strokeText(String(n), 64, 70);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({
    map: t,
    transparent: true,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  numberMats.set(n, m);
  return m;
}

const blanketMats = new Map();
// Материал попоны: сукно в цвет команды с орнаментальной каймой по нижнему краю и бокам
export function blanketMaterial(team) {
  const key = `${team.color}:${team.dark}:${team.trim}`;
  if (blanketMats.has(key)) return blanketMats.get(key);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const base = `#${new THREE.Color(team.color).getHexString()}`;
  const dark = `#${new THREE.Color(team.dark).getHexString()}`;
  const trim = `#${new THREE.Color(team.trim).getHexString()}`;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);
  // фактура сукна
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 1);
  }
  // кайма: v=0 и v=1 — нижние края по бокам коня
  for (const y0 of [0, 216]) {
    ctx.fillStyle = dark;
    ctx.fillRect(0, y0, 512, 40);
    ctx.fillStyle = trim;
    ctx.fillRect(0, y0 + (y0 ? 0 : 34), 512, 6);
    for (let x = 0; x < 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 16, y0 + 8);
      ctx.lineTo(x + 28, y0 + 20);
      ctx.lineTo(x + 16, y0 + 32);
      ctx.lineTo(x + 4, y0 + 20);
      ctx.closePath();
      ctx.fill();
    }
  }
  // боковые (передний и задний) края
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, 8, 256);
  ctx.fillRect(504, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  blanketMats.set(key, m);
  return m;
}

export class RiderFigure {
  constructor(team, number = 0) {
    if (!proto) throw new Error('Rider asset is not loaded');
    const g = (this.group = new THREE.Group());
    const rig = (this.rig = proto.rig.clone(true));
    rig.scale.setScalar(RIDER_SCALE);
    g.add(rig);

    const J = {};
    rig.traverse((o) => {
      if (JOINTS.includes(o.name)) J[o.name] = o;
    });

    // части тела
    this.meshes = [];
    this.capMeshes = [];
    const geos = teamGeometries(team);
    proto.parts.forEach((part, i) => {
      const m = new THREE.Mesh(geos[i], riderMat);
      m.castShadow = true;
      m.receiveShadow = true;
      J[part.joint].add(m);
      this.meshes.push(m);
      if (part.cap) this.capMeshes.push(m);
    });

    // кисти: точки, к которым тянутся повод и улак
    const hand = (side) => {
      const o = new THREE.Object3D();
      o.position.copy(proto.hands[side]);
      J[`Elbow.${side}`].add(o);
      return o;
    };
    // имена — как у прежней скелетной модели, чтобы остальной код не менялся
    this.bones = {
      spine: J.Spine,
      head: J.Head,
      rArm: J['Shoulder.R'],
      rFore: J['Elbow.R'],
      lArm: J['Shoulder.L'],
      lFore: J['Elbow.L'],
      rHand: hand('R'),
      lHand: hand('L'),
    };

    // --- голова: группа в макушке; вид «от первого лица» прячет её целиком ---
    const holder = (this.head = new THREE.Group());
    holder.position.set(0, 0.19, 0);
    for (const c of [...J.Head.children]) {
      c.position.y -= 0.19;
      holder.add(c);
    }
    J.Head.add(holder);
    // головные уборы: шлем — штатная шапка модели, калпак и тебетей надеваются вместо неё
    this.hats = { kalpak: createKalpak(), tebetey: createTebetey() };
    for (const h of Object.values(this.hats)) {
      h.position.set(0, -0.085, -0.005);
      h.scale.setScalar(1.08);
      holder.add(h);
    }
    this.hats.kalpak.rotation.x = -0.08;
    this.setHat('kalpak');

    // --- номер на спине ---
    if (number) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), numberMaterial(number));
      plate.position.set(0, 0.36, -0.135);
      plate.rotation.y = Math.PI; // лицом назад
      plate.rotation.x = 0.06;
      J.Spine.add(plate);
    }

    this.base = new Map();
    for (const bn of [J.Spine, J.Head, J['Shoulder.R'], J['Elbow.R'], J['Shoulder.L'], J['Elbow.L']]) this.base.set(bn, bn.quaternion.clone());

    this._armX = 0;
    this._armZ = 0;
    this._foreX = 0;
    this._lean = 0;
    this._roll = 0;
    this.swing = 0; // таймер анимации броска
  }

  // Поворот части вокруг оси, заданной в системе координат всадника (X — влево, Y — вверх, Z — вперёд)
  _w(bn, axis, angle) {
    if (!angle) return;
    this.group.getWorldQuaternion(_q);
    _ax.copy(axis).applyQuaternion(_q);
    _q.setFromAxisAngle(_ax, angle);
    bn.parent.getWorldQuaternion(_pq);
    // q_local' = P⁻¹ · R · P · q_local
    bn.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pq.invert());
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
      ax = THREE.MathUtils.lerp(-2.2, 0.9, Math.min(t * 1.8, 1));
      az = 0.1;
      fx = 0.5;
    } else if (state.charge >= 0) {
      ax = -0.6 - state.charge * 1.7; // замах: рука вверх-назад
      az = 0.2;
      fx = 0.3;
    } else if (state.tug) {
      // борьба: рука вытянута вбок, к туше; на рывке — резко на себя
      const pullIn = Math.max(0, state.tugHeave || 0);
      const left = (state.tugSide || 0) < 0; // соперник слева — тянется левая рука, правая остаётся внизу
      ax = left ? 0.5 : 0.25;
      az = left ? 0.2 : 1.3 - pullIn * 0.45;
      fx = left ? 0.6 : 0.1 + pullIn * 0.9;
    } else if ((state.reach || 0) > 0.05) {
      // тянется к лежащему улаку: рука вниз и в сторону
      ax = 0.5 + state.reach * 0.4;
      az = 0.35 + state.reach * 0.55;
      fx = 0.15;
    } else if (state.carrying) {
      ax = 0.75; // рука опущена к улаку у стремени
      az = 0.3;
      fx = 1.0;
    } else {
      ax = 0;
      az = 0;
      fx = 0;
    }
    const k = 1 - Math.exp(-dt * (this.swing > 0 ? 30 : 12));
    this._armX += (ax - this._armX) * k;
    this._armZ += (az - this._armZ) * k;
    this._foreX += (fx - this._foreX) * k;
    // борьба: наклон к сопернику (сильнее, когда дёрнули нас), после проигранного рывка — отшатывается
    const ts = state.tugSide || 0;
    const tugRoll = state.tug ? ts * (0.6 - (state.tugHeave || 0) * 0.35) : -ts * (state.tugRecoil || 0) * 0.5;
    this._tugRoll = (this._tugRoll || 0) + (tugRoll - (this._tugRoll || 0)) * (1 - Math.exp(-dt * 14));
    // соперник слева — тянется левой рукой, правая остаётся у повода
    const lz = state.tug && ts < 0 ? 1.3 - Math.max(0, state.tugHeave || 0) * 0.45 : 0;
    this._lArmZ = (this._lArmZ || 0) + (lz - (this._lArmZ || 0)) * k;

    this._t = (this._t || 0) + dt;
    // на разгоне корпус отстаёт назад, при торможении — подаётся вперёд
    const inertia = THREE.MathUtils.clamp(-(state.accel || 0) * 0.014, -0.12, 0.2);
    const jolt = state.jolt || 0;
    const lean = 0.1 + state.speed01 * 0.32 + inertia + jolt * 0.12;
    this._lean += (lean - this._lean) * (1 - Math.exp(-dt * 6));
    this._reach = (this._reach || 0) + ((state.reach || 0) - (this._reach || 0)) * (1 - Math.exp(-dt * 7));
    // свешивается с седла вправо и вперёд, как настоящие чабандесы при подборе туши
    // наклон в сторону улака: +1 — вправо, −1 — влево
    this._side = (this._side || 1) + ((state.reachSide || 1) - (this._side || 1)) * (1 - Math.exp(-dt * 5));
    this._roll += (-state.turn * 0.16 + this._reach * 0.75 * this._side - this._roll) * (1 - Math.exp(-dt * 6));
    this._lean += this._reach * 0.35 * (1 - Math.exp(-dt * 6));

    // сброс к базовой позе и наложение поворотов
    for (const [bn, q] of this.base) bn.quaternion.copy(q);
    const B = this.bones;
    this._w(B.spine, X, this._lean);
    this._w(B.spine, Z, this._roll + this._tugRoll + Math.sin(this._t * 17) * 0.2 * jolt);
    // голова держит горизонт: не наклоняется вместе с корпусом
    this._w(B.head, Z, -Math.sin(this._t * 17 + 0.8) * 0.15 * jolt);
    this._w(B.head, X, -this._lean * 0.75);
    if (this._lArmZ > 0.01) {
      this._w(B.lArm, X, 0.25 * this._lArmZ);
      this._w(B.lArm, Z, this._lArmZ);
    }
    this._w(B.rArm, X, this._armX);
    this._w(B.rArm, Z, -this._armZ);
    this._w(B.rFore, X, this._foreX);
  }

  // kalpak | tebetey | helmet (шлем — штатная стёганая шапка модели)
  setHat(type) {
    const t = this.hats[type] ? type : type === 'helmet' ? 'helmet' : 'kalpak';
    for (const [k, h] of Object.entries(this.hats)) h.visible = k === t;
    for (const m of this.capMeshes) m.visible = t === 'helmet';
  }

  // Перекраска формы под команду (после выбора стран)
  setTeam(team) {
    const geos = teamGeometries(team);
    this.meshes.forEach((m, i) => (m.geometry = geos[i]));
  }

  playThrow() {
    this.swing = 0.35;
  }
}
