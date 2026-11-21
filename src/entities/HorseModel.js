import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Модель лошади: Horse.glb из примеров three.js (см. CREDITS.md).
// Анимация галопа — морф-таргеты, проигрывается через AnimationMixer.

export const HORSE_SCALE = 0.011;
const REST_PHASE = 0.7; // фаза цикла, в которой конь «замирает» на месте

let proto = null;

// Сглаженные нормали для базовой позы и каждого морф-таргета: исходная модель
// без нормалей и рисуется гранёной; со сглаживанием корпус выглядит округлым.
function smoothNormals(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = geo.index ? geo.index.array : null;
  const tris = (idx ? idx.length : n) / 3;
  const key = new Int32Array(n);
  const ids = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(1)},${pos.getY(i).toFixed(1)},${pos.getZ(i).toFixed(1)}`;
    let id = ids.get(k);
    if (id === undefined) {
      id = ids.size;
      ids.set(k, id);
    }
    key[i] = id;
  }
  const compute = (P) => {
    const acc = new Float32Array(ids.size * 3);
    for (let t = 0; t < tris; t++) {
      const a = idx ? idx[t * 3] : t * 3;
      const b = idx ? idx[t * 3 + 1] : t * 3 + 1;
      const c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const ux = P[b * 3] - P[a * 3];
      const uy = P[b * 3 + 1] - P[a * 3 + 1];
      const uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3];
      const vy = P[c * 3 + 1] - P[a * 3 + 1];
      const vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) {
        acc[key[v] * 3] += nx;
        acc[key[v] * 3 + 1] += ny;
        acc[key[v] * 3 + 2] += nz;
      }
    }
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = acc[key[i] * 3];
      const y = acc[key[i] * 3 + 1];
      const z = acc[key[i] * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l;
      out[i * 3 + 1] = y / l;
      out[i * 3 + 2] = z / l;
    }
    return out;
  };
  const baseP = pos.array;
  const baseN = compute(baseP);
  geo.setAttribute('normal', new THREE.BufferAttribute(baseN, 3));
  const morphs = geo.morphAttributes.position;
  if (morphs) {
    const rel = geo.morphTargetsRelative;
    geo.morphAttributes.normal = morphs.map((m) => {
      const P = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) P[i] = rel ? baseP[i] + m.array[i] : m.array[i];
      const N = compute(P);
      if (rel) for (let i = 0; i < n * 3; i++) N[i] -= baseN[i];
      return new THREE.BufferAttribute(N, 3);
    });
  }
}


export async function loadHorseAsset() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/Horse.glb`);
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  const clip = gltf.animations[0];
  smoothNormals(mesh.geometry);
  mesh.material.flatShading = false;
  mesh.material.needsUpdate = true;
  const pos = mesh.geometry.attributes.position;

  // Опорные вершины спины (под седлом): по ним всадник следует за движением корпуса
  const pick = (z0, z1) => {
    let best = -1;
    let bestY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z >= z0 && z <= z1 && Math.abs(pos.getX(i)) < 12 && pos.getY(i) > bestY) {
        bestY = pos.getY(i);
        best = i;
      }
    }
    return best;
  };
  proto = {
    mesh,
    clip,
    backRear: pick(-75, -45),
    backFront: pick(-25, 5),
  };
  return proto;
}

export const COATS = {
  bay: new THREE.Color(0.85, 0.72, 0.62),
  chestnut: new THREE.Color(1.1, 0.9, 0.6),
  black: new THREE.Color(0.2, 0.26, 0.36),
  grey: new THREE.Color(1.0, 1.8, 3.2),
  palomino: new THREE.Color(1.25, 1.6, 1.4),
  dun: new THREE.Color(1.5, 2.1, 2.6),
};

export class HorseModel {
  constructor(coat = 'bay') {
    if (!proto) throw new Error('Horse asset is not loaded');
    this.mesh = proto.mesh.clone();
    this.mesh.material = proto.mesh.material.clone();
    this.mesh.material.color.copy(COATS[coat] ?? COATS.bay);
    this.mesh.material.roughness = 0.78;
    this.mesh.material.envMapIntensity = 0.6;
    this.mesh.scale.setScalar(HORSE_SCALE);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.action = this.mixer.clipAction(proto.clip);
    this.action.play();
    this.duration = proto.clip.duration;
    this.action.time = Math.random() * this.duration;
    this._back = { y: 1.5, z: -0.3, pitch: 0 };
    this.mixer.update(0);
  }

  // speed — скорость по земле, м/с
  update(dt, speed) {
    const s = Math.abs(speed);
    let rate;
    if (s > 0.7) {
      rate = 0.75 + s * 0.16;
    } else {
      // стоим: доводим цикл до фазы покоя и замираем
      const phase = this.action.time % this.duration;
      const left = (REST_PHASE - phase + this.duration) % this.duration;
      rate = left > 0.04 ? Math.min(1.2, 0.5 + left * 2) : 0;
    }
    this.action.timeScale = rate;
    this.mixer.update(dt);
  }

  // Положение и наклон спины под седлом в локальных координатах (метры)
  sampleBack() {
    const g = this.mesh.geometry;
    const inf = this.mesh.morphTargetInfluences;
    const base = g.attributes.position;
    const morphs = g.morphAttributes.position;
    const rel = g.morphTargetsRelative;
    const sample = (i) => {
      let y = base.getY(i);
      let z = base.getZ(i);
      if (morphs && inf) {
        let sum = 0;
        let my = 0;
        let mz = 0;
        for (let k = 0; k < morphs.length; k++) {
          const w = inf[k];
          if (!w) continue;
          sum += w;
          my += morphs[k].getY(i) * w;
          mz += morphs[k].getZ(i) * w;
        }
        if (rel) {
          y += my;
          z += mz;
        } else {
          y = y * (1 - sum) + my;
          z = z * (1 - sum) + mz;
        }
      }
      return [y * HORSE_SCALE, z * HORSE_SCALE];
    };
    const [ry, rz] = sample(proto.backRear);
    const [fy, fz] = sample(proto.backFront);
    const b = this._back;
    b.y = (ry + fy) / 2;
    b.z = (rz + fz) / 2;
    b.pitch = -Math.atan2(fy - ry, fz - rz);
    return b;
  }
}
