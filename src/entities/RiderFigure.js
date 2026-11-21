import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ornamentStripTexture } from '../scene/textures.js';

// Всадник: скелетная модель человека (скан «Typing-japanese-man», CC-BY 4.0 — см. CREDITS.md)
// со скелетом Mixamo. Сидячая поза берётся из клипа модели и доводится до посадки верхом
// поворотами костей; рубашка перекрашивается в цвет команды; на голову надевается калпак.
// Начало координат группы — точка посадки (седло), +Z — вперёд, +Y — вверх.

const RIDER_HEIGHT = 1.74; // рост в метрах
const POSE_TIME = 1.0; // момент клипа, из которого берётся базовая сидячая поза

let proto = null;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _v = new THREE.Vector3();

function bone(root, name) {
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.isBone && o.name.replace(":", "").startsWith(`mixamorig${name}_`)) hit = o;
  });
  if (!hit) throw new Error(`Rider bone not found: ${name}`);
  return hit;
}

export async function loadRiderAsset() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/typing-japanese-man.glb`);
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.material.roughness = 0.85;
  mesh.material.metalness = 0;
  mesh.material.envMapIntensity = 0.7;

  // рост в исходных единицах — по Т-позе
  gltf.scene.updateMatrixWorld(true);
  const top = bone(gltf.scene, 'HeadTop_End').getWorldPosition(new THREE.Vector3());
  const toe = bone(gltf.scene, 'LeftToeBase').getWorldPosition(new THREE.Vector3());
  const scale = RIDER_HEIGHT / (top.y - toe.y + 0.02);

  proto = { scene: gltf.scene, clip: gltf.animations[0], scale, image: mesh.material.map.image, teamMaps: new Map() };
  return proto;
}

// Перекрашивает белую рубашку на текстуре в цвет команды, сохраняя складки и тени
function jerseyTexture(team) {
  const key = `${team.color}:${team.dark}`;
  if (proto.teamMaps.has(key)) return proto.teamMaps.get(key);
  const img = proto.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const col = new THREE.Color(team.color).convertLinearToSRGB();
  const dark = new THREE.Color(team.dark).convertLinearToSRGB();
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Области текстуры (в долях её размера): где лежат брюки, а где лицо — его не трогаем
  const W = c.width;
  const H = c.height;
  const inPants = (x, y) => (y < 0.39 && x < 0.7) || (x > 0.22 && x < 0.435 && y >= 0.17 && y < 0.705);
  const inFace = (x, y) => x > 0.19 && x < 0.34 && y > 0.775 && y < 0.93;
  for (let i = 0; i < p.length; i += 4) {
    const px = ((i / 4) % W) / W;
    const py = Math.floor(i / 4 / W) / H;
    if (inFace(px, py)) continue;
    const r = p[i];
    const g = p[i + 1];
    const b = p[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const lum = r * 0.3 + g * 0.59 + b * 0.11;
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    // рубашка: светлая и почти бесцветная
    const shirt = (1 - sm(0.07, 0.17, sat)) * sm(125, 175, lum);
    if (shirt > 0.01) {
      const shade = Math.pow(lum / 245, 1.6);
      p[i] = r + (col.r * 255 * shade - r) * shirt;
      p[i + 1] = g + (col.g * 255 * shade - g) * shirt;
      p[i + 2] = b + (col.b * 255 * shade - b) * shirt;
      continue;
    }
    // брюки: бежевые → тёмные в тон команды
    // всё в области брюк, кроме рыжего ремня
    if (inPants(px, py) && !(sat > 0.42 && r > 120)) {
      const k = lum / 190;
      p[i] = dark.r * 255 * k * 0.9 + 12;
      p[i + 1] = dark.g * 255 * k * 0.9 + 12;
      p[i + 2] = dark.b * 255 * k * 0.9 + 14;
    }
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // как у текстур glTF
  t.anisotropy = 8;
  proto.teamMaps.set(key, t);
  return t;
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

// Защитный шлем
function createHelmet() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.35, metalness: 0.2 }),
  );
  shell.scale.set(1, 1, 1.15);
  shell.position.y = 0.03;
  g.add(shell);
  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.11, 0.015, 20, 1, false, -Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5 }),
  );
  visor.position.set(0, 0.04, 0.09);
  g.add(visor);
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
    const model = (this.model = cloneSkinned(proto.scene));
    const rig = (this.rig = new THREE.Group());
    rig.scale.setScalar(proto.scale);
    rig.add(model);
    g.add(rig);

    model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = o.material.clone();
        o.material.map = jerseyTexture(team);
        this.mesh = o;
      }
    });

    const b = (n) => bone(model, n);
    this.bones = {
      hips: b('Hips'),
      spine: b('Spine'),
      spine2: b('Spine2'),
      neck: b('Neck'),
      head: b('Head'),
      headTop: b('HeadTop_End'),
      lArm: b('LeftArm'),
      lFore: b('LeftForeArm'),
      rArm: b('RightArm'),
      rFore: b('RightForeArm'),
      rHand: b('RightHand'),
      lHand: b('LeftHand'),
      lUpLeg: b('LeftUpLeg'),
      lLeg: b('LeftLeg'),
      lFoot: b('LeftFoot'),
      rUpLeg: b('RightUpLeg'),
      rLeg: b('RightLeg'),
      rFoot: b('RightFoot'),
    };

    // --- калпак: крепится к кости головы, ориентация — по Т-позе ---
    g.updateMatrixWorld(true);
    const headBone = this.bones.head;
    const holder = (this.head = new THREE.Group());
    const ws = headBone.getWorldScale(new THREE.Vector3());
    holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
    holder.quaternion.copy(headBone.getWorldQuaternion(new THREE.Quaternion()).invert());
    // макушка в локальных координатах кости головы
    const topLocal = headBone.worldToLocal(this.bones.headTop.getWorldPosition(new THREE.Vector3()));
    holder.position.copy(topLocal);
    headBone.add(holder);
    this.hats = { kalpak: createKalpak(), tebetey: createTebetey(), helmet: createHelmet() };
    const kalpak = this.hats.kalpak;
    this.hats.tebetey.visible = this.hats.helmet.visible = false;
    for (const k of ['tebetey', 'helmet']) {
      this.hats[k].position.set(0, -0.115, 0.012);
      this.hats[k].scale.setScalar(1.07);
      holder.add(this.hats[k]);
    }
    kalpak.position.set(0, -0.115, 0.012);
    kalpak.scale.setScalar(1.07);
    kalpak.rotation.x = -0.1;
    holder.add(kalpak);

    // --- номер на спине: табличка на кости груди ---
    if (number) {
      const chest = this.bones.spine2;
      const nh = new THREE.Group();
      const cs = chest.getWorldScale(new THREE.Vector3());
      nh.scale.set(1 / cs.x, 1 / cs.y, 1 / cs.z);
      nh.quaternion.copy(chest.getWorldQuaternion(new THREE.Quaternion()).invert());
      chest.add(nh);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), numberMaterial(number));
      plate.position.set(0, 0.07, -0.118);
      plate.rotation.y = Math.PI; // лицом назад
      plate.rotation.x = 0.1;
      nh.add(plate);
    }

    // --- базовая сидячая поза из клипа ---
    this._applyClipPose(POSE_TIME);

    // посадка верхом: бёдра разведены и опущены, голени вниз, руки к поводу
    this._w(this.bones.lUpLeg, Y, 0.42);
    this._w(this.bones.rUpLeg, Y, -0.42);
    this._w(this.bones.lUpLeg, X, 0.5);
    this._w(this.bones.rUpLeg, X, 0.5);
    this._w(this.bones.lLeg, X, -0.35);
    this._w(this.bones.rLeg, X, -0.35);
    this._w(this.bones.lLeg, Z, -0.2);
    this._w(this.bones.rLeg, Z, 0.2);
    this._w(this.bones.lFoot, X, -0.25);
    this._w(this.bones.rFoot, X, -0.25);

    // кисти сжаты в кулак: для каждого пальца подбираем ось сгиба по скелету
    this._curlFingers('Left', 1.15);
    this._curlFingers('Right', 0.95);

    this.base = new Map();
    for (const bn of Object.values(this.bones)) this.base.set(bn, bn.quaternion.clone());

    // таз — в точку посадки
    g.updateMatrixWorld(true);
    this.bones.hips.getWorldPosition(_v);
    g.worldToLocal(_v);
    rig.position.set(-_v.x, -_v.y + 0.06, -_v.z + 0.06);

    this._armX = 0;
    this._armZ = 0;
    this._foreX = 0;
    this._lean = 0;
    this._roll = 0;
    this.swing = 0; // таймер анимации броска
  }

  // Сгибает пальцы: пробуем повороты вокруг локальных осей и берём тот,
  // который ближе всего подводит кончик пальца к запястью
  _curlFingers(side, angle) {
    const hand = bone(this.model, `${side}Hand`);
    const origin = new THREE.Vector3();
    const tipPos = new THREE.Vector3();
    const axes = [X, Y, Z];
    const q = new THREE.Quaternion();
    for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) {
      let chain;
      let tip;
      try {
        chain = [1, 2, 3].map((i) => bone(this.model, `${side}Hand${finger}${i}`));
        tip = bone(this.model, `${side}Hand${finger}4`);
      } catch {
        continue;
      }
      const rest = chain.map((b) => b.quaternion.clone());
      let best = null;
      let bestD = Infinity;
      for (const ax of axes) {
        for (const sgn of [1, -1]) {
          chain.forEach((b, i) => b.quaternion.copy(rest[i]).multiply(q.setFromAxisAngle(ax, sgn * angle)));
          hand.updateWorldMatrix(true, true);
          const d = tip.getWorldPosition(tipPos).distanceTo(hand.getWorldPosition(origin));
          if (d < bestD) {
            bestD = d;
            best = [ax, sgn];
          }
        }
      }
      chain.forEach((b, i) => b.quaternion.copy(rest[i]).multiply(q.setFromAxisAngle(best[0], best[1] * angle)));
    }
  }

  // Выставляет кости в позу клипа в момент t (без микшера)
  _applyClipPose(t) {
    const byName = new Map();
    this.model.traverse((o) => byName.set(o.name, o));
    for (const track of proto.clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const node = byName.get(track.name.slice(0, dot));
      const prop = track.name.slice(dot + 1);
      if (!node || (prop !== 'quaternion' && prop !== 'position')) continue;
      const interp = track.createInterpolant();
      const v = interp.evaluate(t);
      if (prop === 'quaternion') node.quaternion.fromArray(v);
      else node.position.fromArray(v);
    }
  }

  // Поворот кости вокруг оси, заданной в системе координат всадника (X — влево, Y — вверх, Z — вперёд)
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
    this._w(B.spine, X, this._lean * 0.6);
    this._w(B.spine2, X, this._lean * 0.4);
    this._w(B.spine, Z, this._roll + Math.sin(this._t * 17) * 0.2 * jolt);
    this._w(B.neck, Z, -Math.sin(this._t * 17 + 0.8) * 0.15 * jolt);
    this._w(B.neck, X, -this._lean * 0.75);
    this._w(B.rArm, X, this._armX);
    this._w(B.rArm, Z, -this._armZ);
    this._w(B.rFore, X, this._foreX);
  }

  setHat(type) {
    for (const [k, h] of Object.entries(this.hats)) h.visible = k === (this.hats[type] ? type : 'kalpak');
  }

  // Перекраска формы под команду (после выбора стран)
  setTeam(team) {
    this.mesh.material.map = jerseyTexture(team);
    this.mesh.material.needsUpdate = true;
  }

  playThrow() {
    this.swing = 0.35;
  }
}
