import * as THREE from 'three';
import { KAZAN, ULAK } from '../config.js';
import { furTexture } from '../scene/textures.js';
import { furShells } from '../scene/props.js';

// Улак — туша козла. Полёт, кувыркание, отскоки и скатывание считает Rapier (PhysicsWorld).

const UP = new THREE.Vector3(0, 1, 0);
const _tug = new THREE.Vector3();

function createUlakMesh() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ map: furTexture(), color: 0xd9cbb8, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2c24, roughness: 0.9 });
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.46, 8, 18);
  const body = new THREE.Mesh(bodyGeo, fur);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.0, 1.0, 0.92);
  g.add(body);
  // шерсть: несколько полупрозрачных оболочек с «волосками»
  const shells = furShells(bodyGeo, 6, 0.04);
  shells.rotation.x = Math.PI / 2;
  shells.scale.set(1.0, 1.0, 0.92);
  g.add(shells);
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
  const legs = [];
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
    leg.userData.rest = rx;
    leg.userData.phase = Math.random() * 6.28;
    legs.push(leg);
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
  g.userData.legs = legs;
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
    this._inSteps = 0;
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
    // туша кувыркается вперёд по ходу броска (ось вращения — поперёк скорости) и чуть вразнобой
    const hv = Math.hypot(vel.x, vel.z);
    const spin = Math.min(7, 1.5 + hv * 0.35);
    const ax = hv > 0.5 ? vel.z / hv : 0;
    const az = hv > 0.5 ? -vel.x / hv : 0;
    this.body.setAngvel(
      { x: ax * spin + (Math.random() - 0.5) * 2.5, y: (Math.random() - 0.5) * 2.5, z: az * spin + (Math.random() - 0.5) * 2.5 },
      true,
    );
    this.vel.copy(vel);
    this.lockedFor = by;
    this.lockTime = 0.7;
    this.resting = false;
    this.physics.setUlakHitsHorses(this.collider, false);
  }

  // Копыта отбрасывают лежащую тушу: импульс по ходу коня
  kick(vx, vy, vz) {
    const m = ULAK.mass;
    this.body.applyImpulse({ x: vx * m, y: vy * m, z: vz * m }, true);
    this.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 }, true);
    this.resting = false;
  }

  // До шага физики: таймеры
  preStep(dt) {
    // туша — не мяч: на земле она быстро перестаёт катиться и скользить
    if (!this.holder && !this.inKazan && this.pos.y < 0.45 && !this.body.isSleeping()) {
      const av = this.body.angvel();
      const lv = this.body.linvel();
      const ka = Math.exp(-dt * ULAK.groundSpinDamp);
      const kl = Math.exp(-dt * ULAK.groundSlideDamp);
      this.body.setAngvel({ x: av.x * ka, y: av.y * ka, z: av.z * ka }, false);
      this.body.setLinvel({ x: lv.x * kl, y: lv.y, z: lv.z * kl }, false);
    }
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
      // Положение для правил считаем по всаднику, а не по модели: модель обновляется только при отрисовке,
      // и без неё (быстрая симуляция, будущий сервер) улак «зависал» бы на старом месте.
      const side = (r, out) => out.set(r.pos.x - Math.cos(r.heading) * 0.6, 1.25, r.pos.z + Math.sin(r.heading) * 0.6);
      side(this.holder, this.pos);
      // во время борьбы улак растянут между двумя всадниками
      if (this.tugRival) {
        side(this.tugRival, _tug);
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
      let inside = false;
      for (const s of [-1, 1]) {
        const d = Math.hypot(t.x - s * KAZAN.x, t.z);
        if (d < KAZAN.innerR - 0.15 && t.y < KAZAN.height - 0.05) {
          // по правилам гол не засчитывается, если улак вылетел из казана по инерции:
          // ждём, пока он пролежит внутри треть секунды
          inside = true;
          if (++this._inSteps >= 20) {
            this.inKazan = s;
            this._inSteps = 0;
            return s;
          }
        }
      }
      if (!inside) this._inSteps = 0;
    }
    return 0;
  }

  render(dt, time) {
    const m = this.mesh;
    m.position.copy(this.pos);
    if (this.holder) {
      // на экране туша висит точно у стремени и повторяет движения коня
      this.holder.carryAnchor.getWorldPosition(m.position);
      if (this.tugRival) {
        this.tugRival.carryAnchor.getWorldPosition(_tug);
        m.position.lerp(_tug, 0.5);
        m.position.y += 0.25;
      }
    }
    const legs = m.userData.legs;
    const t = (this._t = (this._t || 0) + dt);
    if (this.holder) {
      // туша висит у стремени и раскачивается маятником в такт галопу и от рывков коня
      const h = this.holder;
      const sp = Math.hypot(h.vel.x, h.vel.z);
      const drive = Math.sin(t * (4 + sp * 0.55)) * Math.min(sp / 10, 1) * 3 - (h.accelLong || 0) * 0.25;
      this._swV = (this._swV || 0) + (drive - 14 * (this._sw || 0) - 2.2 * this._swV) * dt;
      this._sw = (this._sw || 0) + this._swV * dt;
      m.rotation.set(0.2 + this._sw * 0.6, h.heading, -1.25 + this._sw * 0.35);
      m.position.y -= 0.05;
      for (const l of legs) l.rotation.x = l.userData.rest + Math.sin(t * 9 + l.userData.phase) * 0.25 * Math.min(sp / 8, 1) + this._sw * 0.8;
    } else {
      m.quaternion.copy(this.quat);
      // в полёте ноги болтаются, на земле — безвольно лежат
      const fly = this.resting ? 0 : Math.min(this.vel.length() / 8, 1);
      for (const l of legs) {
        const target = l.userData.rest + Math.sin(t * 14 + l.userData.phase) * 0.6 * fly + (this.resting ? 0.5 : 0);
        l.rotation.x += (target - l.rotation.x) * Math.min(1, dt * 10);
      }
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
