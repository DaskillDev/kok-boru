import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Модель лошади: Horse.glb из примеров three.js (см. CREDITS.md).
// Анимация галопа — морф-таргеты, проигрывается через AnimationMixer.

export const HORSE_SCALE = 0.011;
const REST_PHASE = 0.7; // фаза цикла, в которой конь «замирает» на месте

let proto = null;

export async function loadHorseAsset() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/Horse.glb`);
  let mesh = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh && !mesh) mesh = o;
  });
  const clip = gltf.animations[0];
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
