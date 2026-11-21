import * as THREE from 'three';
import { KAZAN, ULAK } from '../config.js';
import { furTexture } from '../scene/textures.js';

// Улак — туша козла. Полёт, кувыркание, отскоки и скатывание считает Rapier (PhysicsWorld).

const UP = new THREE.Vector3(0, 1, 0);
const _tug = new THREE.Vector3();

function createUlakMesh() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ map: furTexture(), color: 0xd9cbb8, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.46, 8, 18), fur);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.0, 1.0, 0.92);
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), fur);
  belly.scale.set(1.05, 0.95, 1.3);
  belly.position.set(0, -0.03, -0.05);
  g.add(belly);
  // шея без головы
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.12, 6, 12), fur);
  neck.position.set(0, 0.06, 0.47);
  neck.rotation.x = 1.1;
  g.add(neck);
  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark);
  stump.position.set(0, 0.1, 0.58);
  g.add(stump);
  // ноги
  const legGeo = new THREE.CapsuleGeometry(0.042, 0.34, 4, 10);
  const hoofGeo = new THREE.SphereGeometry(0.048, 8, 6);
  for (const [x, z, rx] of [
    [0.11, 0.27, 0.35],
    [-0.11, 0.27, 0.15],
    [0.11, -0.3, -0.3],
    [-0.11, -0.3, -0.1],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, -0.1, z);
    leg.rotation.x = rx;
    const l = new THREE.Mesh(legGeo, fur);
    l.position.y = -0.2;
    leg.add(l);
    const hoof = new THREE.Mesh(hoofGeo, dark);
    hoof.position.y = -0.4;
    leg.add(hoof);
    g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.1, 4, 8), dark);
  tail.position.set(0, 0.1, -0.5);
  tail.rotation.x = -0.8;
  g.add(tail);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export class Ulak {
  constructor(scene, physics) {
    this.physics = physics;
    const { body, collider } = physics.createUlakBody();
    this.body = body;
    this.collider = collider;

    this.pos = new THREE.Vector3(0, ULAK.radius, 0);
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.holder = null;
    this.lastHolder = null;
    this.lockedFor = null; // бросивший не может сразу подобрать снова
    this.lockTime = 0;
    this.resting = false;
    this.inKazan = 0; // 0 или знак X казана, в котором лежит улак
    this.tugRival = null; // соперник, который тянет улак
    this.passTo = null; // кому адресован пас
    this.passTime = 0;

    this.mesh = createUlakMesh();
    scene.add(this.mesh);

    // маркер на земле + стрелка сверху, чтобы улак было видно издалека
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.marker);
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9 }),
    );
    this.arrow.rotation.x = Math.PI;
    scene.add(this.arrow);
  }

  _teleport(x, y, z, yaw = 0) {
    const b = this.body;
    b.setEnabled(true);
    b.setTranslation({ x, y, z }, true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
  }

  reset(x = 0, z = 0, y = 4) {
    if (this.holder) this.holder.hasUlak = false;
    this.holder = null;
    this.lastHolder = null;
    this.lockedFor = null;
    this.lockTime = 0;
    this.resting = false;
    this.inKazan = 0;
    this.tugRival = null;
    this.passTo = null;
    this._teleport(x, y, z, Math.random() * 6);
    this.physics.setUlakHitsHorses(this.collider, true);
  }

  attach(rider) {
    if (this.holder) this.holder.hasUlak = false;
    this.holder = rider;
    this.lastHolder = rider;
    rider.hasUlak = true;
    this.resting = false;
    this.inKazan = 0;
    this.vel.set(0, 0, 0);
    this.body.setEnabled(false); // пока улак в руках, физика его не считает
  }

  release(pos, vel, by) {
    if (this.holder) this.holder.hasUlak = false;
    this.holder = null;
    this._teleport(pos.x, pos.y, pos.z, by ? by.heading : 0);
    this.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    this.body.setAngvel(
      { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 7 },
      true,
    );
    this.vel.copy(vel);
    this.lockedFor = by;
    this.lockTime = 0.7;
    this.resting = false;
    this.physics.setUlakHitsHorses(this.collider, false);
  }

  // До шага физики: таймеры
  preStep(dt) {
    if (this.passTo) {
      this.passTime -= dt;
      if (this.passTime <= 0 || this.holder) this.passTo = null;
    }
    if (this.lockTime > 0) {
      this.lockTime = Math.max(0, this.lockTime - dt);
      if (this.lockTime === 0) {
        this.lockedFor = null;
        this.physics.setUlakHitsHorses(this.collider, true);
      }
    }
  }

  // После шага физики. Возвращает знак X казана, если улак только что упал в чашу, иначе 0
  postStep() {
    if (this.holder) {
      this.holder.carryAnchor.getWorldPosition(this.pos);
      // во время борьбы улак растянут между двумя всадниками
      if (this.tugRival) {
        this.tugRival.carryAnchor.getWorldPosition(_tug);
        this.pos.lerp(_tug, 0.5);
        this.pos.y += 0.25;
      }
      return 0;
    }
    const t = this.body.translation();
    const v = this.body.linvel();
    const r = this.body.rotation();
    this.pos.set(t.x, t.y, t.z);
    this.vel.set(v.x, v.y, v.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.resting = this.vel.lengthSq() < 0.04 && t.y < KAZAN.height;

    if (!this.inKazan) {
      for (const s of [-1, 1]) {
        const d = Math.hypot(t.x - s * KAZAN.x, t.z);
        if (d < KAZAN.innerR - 0.15 && t.y < KAZAN.height - 0.05) {
          this.inKazan = s;
          return s;
        }
      }
    }
    return 0;
  }

  render(dt, time) {
    const m = this.mesh;
    m.position.copy(this.pos);
    if (this.holder) {
      // висит вдоль бока коня
      m.rotation.set(0.2, this.holder.heading, -1.25);
      m.position.y -= 0.05;
    } else {
      m.quaternion.copy(this.quat);
    }
    const free = !this.holder;
    this.marker.visible = free && !this.inKazan;
    this.arrow.visible = free;
    if (free) {
      this.marker.position.set(this.pos.x, 0.06, this.pos.z);
      const sc = 1 + Math.sin(time * 5) * 0.12;
      this.marker.scale.setScalar(sc);
      this.arrow.position.set(this.pos.x, this.pos.y + 1.7 + Math.sin(time * 4) * 0.15, this.pos.z);
      this.arrow.rotation.y = time * 2;
    }
  }
}
