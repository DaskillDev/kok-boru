import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Конь: скелетная модель «Horse» (Henry S, CC-BY 4.0 — см. CREDITS.md).
// Стойка, шаг и галоп смешиваются по скорости через AnimationMixer;
// в повороте подмешивается галоп с креном (Gallop_L / Gallop_R).

const TARGET_HEIGHT = 2.15; // высота от земли до макушки в стойке, м
const WALK_REF = 1.9; // скорость (м/с), при которой шаг идёт в темпе 1×
const GALLOP_REF = 10.5; // то же для галопа

let proto = null;

const findClip = (clips, suffix) => clips.find((c) => c.name.endsWith(suffix));
const findBone = (root, part) => {
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.isBone && o.name.includes(part)) hit = o;
  });
  return hit;
};

export async function loadHorseAsset() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/horse_rigged.glb`);
  const scene = gltf.scene;
  const clips = {
    idle: findClip(gltf.animations, '1 Ilde'),
    walk: findClip(gltf.animations, '|Walk'),
    gallop: findClip(gltf.animations, '|Gallop'),
    gallopL: findClip(gltf.animations, '|Gallop_L'),
    gallopR: findClip(gltf.animations, '|Gallop_R'),
  };

  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material) {
        o.material.envMapIntensity = 0.8;
        // грива и хвост — плоскости с прозрачностью
        if (/hair/i.test(o.material.name)) {
          o.material.alphaTest = 0.4;
          o.material.transparent = false;
          o.material.side = THREE.DoubleSide;
        }
      }
    }
  });

  // Замер в позе стойки: размер, направление «вперёд», уровень земли
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clips.idle).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    }
  });
  const head = findBone(scene, 'BN_Head_00').getWorldPosition(new THREE.Vector3());
  const pelvis = findBone(scene, 'BN_Pelvis').getWorldPosition(new THREE.Vector3());
  const chest = findBone(scene, 'BN_Spine_03').getWorldPosition(new THREE.Vector3());
  const yaw = Math.atan2(head.x - pelvis.x, head.z - pelvis.z);
  const scale = TARGET_HEIGHT / (box.max.y - box.min.y);
  const center = new THREE.Vector3((pelvis.x + chest.x) / 2, box.min.y, (pelvis.z + chest.z) / 2);
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);

  proto = { scene, clips, yaw, scale, center };
  return proto;
}

// Масти: множитель к текстуре шкуры и гривы
export const COATS = {
  bay: { body: 0xffffff, hair: 0xffffff },
  chestnut: { body: 0xf2b27a, hair: 0xd9a070 },
  black: { body: 0x55555c, hair: 0x33333a },
  grey: { body: 0xd8dde6, hair: 0xf0f0f0 },
  palomino: { body: 0xffd9a0, hair: 0xfff2d8 },
  dun: { body: 0xd9c49a, hair: 0x6a5a48 },
};

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class HorseModel {
  constructor(coat = 'bay') {
    if (!proto) throw new Error('Horse asset is not loaded');
    const model = cloneSkinned(proto.scene);
    // обёртка: +Z — вперёд, начало координат — на земле под серединой корпуса
    this.mesh = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.rotation.y = -proto.yaw;
    pivot.scale.setScalar(proto.scale);
    model.position.copy(proto.center).multiplyScalar(-1);
    pivot.add(model);
    this.mesh.add(pivot);

    // своя масть у каждого коня
    const cache = (this.coatMats = new Map());
    model.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name;
      if (name !== 'Horse' && name !== 'Hair') return;
      if (!cache.has(name)) cache.set(name, o.material.clone());
      o.material = cache.get(name);
    });
    this.setCoat(coat);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [key, clip] of Object.entries(proto.clips)) {
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      this.actions[key] = a;
    }
    this.weights = { idle: 1, walk: 0, gallop: 0, gallopL: 0, gallopR: 0 };

    // Точка посадки: верх седла в позе стойки, привязанный к кости спины
    this.spineBack = findBone(model, 'BN_Spine_01');
    this.spineFront = findBone(model, 'BN_Spine_03');
    this.seatBone = findBone(model, 'BN_Spine_02');
    this.mixer.update(0);
    this.mesh.updateMatrixWorld(true);
    const saddle = new THREE.Box3();
    model.traverse((o) => {
      if (o.isSkinnedMesh && o.material.name === 'Saddle') {
        o.computeBoundingBox();
        const b = new THREE.Box3().copy(o.boundingBox).applyMatrix4(o.matrixWorld);
        // у модели два меша с материалом Saddle: уздечка (у головы) и седло — берём то, что на спине
        if (b.getCenter(_v).z < 0.6) saddle.union(b);
      }
    });
    this._back = { y: 1.5, z: 0, pitch: 0 };
    if (saddle.isEmpty()) {
      this.seatBone.getWorldPosition(_v);
      _v.y += 0.15;
    } else {
      // сиденье — чуть ниже верхней точки седла (верх — это лука)
      saddle.getCenter(_v);
      _v.y = saddle.max.y - (saddle.max.y - saddle.min.y) * 0.16;
      _v.x = 0;
    }
    this.saddleBox = saddle.clone();
    this.seatOffset = this.seatBone.worldToLocal(_v.clone());
    this.bindPitch = this._spinePitch();

    // у каждого коня свой сдвиг фазы, чтобы не двигались синхронно
    const phase = Math.random();
    for (const a of Object.values(this.actions)) a.time = phase * a.getClip().duration;
  }

  setCoat(coat) {
    const tint = COATS[coat] ?? COATS.bay;
    this.coat = coat;
    this.coatMats.get('Horse')?.color.set(tint.body);
    this.coatMats.get('Hair')?.color.set(tint.hair);
  }

  _spinePitch() {
    this.spineBack.getWorldPosition(_a);
    this.spineFront.getWorldPosition(_b);
    this.mesh.worldToLocal(_a);
    this.mesh.worldToLocal(_b);
    return Math.atan2(_b.y - _a.y, _b.z - _a.z);
  }

  // speed — скорость по земле (м/с, со знаком), turn — угловая скорость (рад/с)
  update(dt, speed, turn = 0) {
    const s = Math.abs(speed);
    // целевые веса: стойка → шаг → галоп
    const wGallopAll = THREE.MathUtils.smoothstep(s, 3.2, 6.0);
    const wIdle = 1 - THREE.MathUtils.smoothstep(s, 0.15, 0.9);
    const wWalk = Math.max(0, 1 - wIdle - wGallopAll);
    const side = THREE.MathUtils.clamp(turn / 1.1, -1, 1) * wGallopAll;
    const target = {
      idle: wIdle,
      walk: wWalk,
      gallop: wGallopAll * (1 - Math.abs(side)),
      gallopL: wGallopAll * Math.max(0, side),
      gallopR: wGallopAll * Math.max(0, -side),
    };
    const k = 1 - Math.exp(-dt * 7);
    for (const key in target) {
      this.weights[key] += (target[key] - this.weights[key]) * k;
      this.actions[key].setEffectiveWeight(this.weights[key]);
    }
    const walkRate = THREE.MathUtils.clamp(s / WALK_REF, 0.55, 2.0) * (speed < 0 ? -1 : 1);
    const gallopRate = THREE.MathUtils.clamp(s / GALLOP_REF, 0.75, 1.7);
    this.actions.walk.timeScale = walkRate;
    this.actions.gallop.timeScale = gallopRate;
    // все варианты галопа идут в одной фазе
    this.actions.gallopL.timeScale = gallopRate;
    this.actions.gallopR.timeScale = gallopRate;
    this.actions.gallopL.time = this.actions.gallop.time;
    this.actions.gallopR.time = this.actions.gallop.time;
    this.mixer.update(dt);
  }

  // Положение и наклон спины под седлом в координатах обёртки (метры)
  sampleBack() {
    this.mesh.updateWorldMatrix(true, true);
    _v.copy(this.seatOffset);
    this.seatBone.localToWorld(_v);
    this.mesh.worldToLocal(_v);
    const b = this._back;
    b.y = _v.y;
    b.z = _v.z;
    b.pitch = -(this._spinePitch() - this.bindPitch);
    return b;
  }
}
