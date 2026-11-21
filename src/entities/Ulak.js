import * as THREE from 'three';
import { FIELD, KAZAN, GRAVITY, ULAK } from '../config.js';
import { furTexture } from '../scene/textures.js';

// Улак — туша козла. Свободный полёт с гравитацией, отскоки, попадание в казан.

const UP = new THREE.Vector3(0, 1, 0);

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
  constructor(scene) {
    this.pos = new THREE.Vector3(0, ULAK.radius, 0);
    this.vel = new THREE.Vector3();
    this.holder = null;
    this.lastHolder = null;
    this.lockedFor = null; // бросивший не может сразу подобрать снова
    this.lockTime = 0;
    this.resting = false;
    this.inKazan = 0; // 0 или знак X казана, в котором лежит улак

    this.mesh = createUlakMesh();
    this.spin = new THREE.Vector3();
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

  reset(x = 0, z = 0, y = 4) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.holder = null;
    this.lastHolder = null;
    this.lockedFor = null;
    this.resting = false;
    this.inKazan = 0;
    this.mesh.rotation.set(0, Math.random() * 6, 0);
  }

  attach(rider) {
    if (this.holder) this.holder.hasUlak = false;
    this.holder = rider;
    this.lastHolder = rider;
    rider.hasUlak = true;
    this.resting = false;
    this.inKazan = 0;
    this.vel.set(0, 0, 0);
  }

  release(pos, vel, by) {
    if (this.holder) this.holder.hasUlak = false;
    this.holder = null;
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.lockedFor = by;
    this.lockTime = 0.7;
    this.resting = false;
    this.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
  }

  // Возвращает знак X казана, если на этом шаге улак упал в чашу, иначе 0
  step(dt) {
    this.lockTime = Math.max(0, this.lockTime - dt);
    if (this.lockTime === 0) this.lockedFor = null;
    if (this.holder) {
      this.holder.carryAnchor.getWorldPosition(this.pos);
      return 0;
    }
    if (this.resting) return 0;

    const p = this.pos;
    const v = this.vel;
    const prevY = p.y;
    const prevX = p.x;
    const prevZ = p.z;
    v.y -= GRAVITY * dt;
    p.addScaledVector(v, dt);

    let scored = 0;
    // казаны
    for (const s of [-1, 1]) {
      const cx = s * KAZAN.x;
      const dx = p.x - cx;
      const dz = p.z;
      const d = Math.hypot(dx, dz);
      if (d > KAZAN.outerR + ULAK.radius) continue;
      const pd = Math.hypot(prevX - cx, prevZ);
      const rimY = KAZAN.height + ULAK.radius * 0.5;
      const inside = d < KAZAN.innerR - 0.05;
      if (inside) {
        const wasInside = pd < KAZAN.innerR - 0.05;
        if (this.inKazan !== s && p.y < rimY && (prevY >= rimY || wasInside) && v.y <= 0) {
          this.inKazan = s;
          scored = s;
        }
        if (this.inKazan === s) {
          // внутри чаши: дно и стенки
          const floorY = 0.27 + ULAK.radius;
          if (p.y < floorY) {
            p.y = floorY;
            v.y = Math.abs(v.y) * 0.15;
            v.x *= 0.5;
            v.z *= 0.5;
            if (Math.abs(v.y) < 0.5) {
              v.set(0, 0, 0);
              this.resting = true;
            }
          }
          const lim = KAZAN.innerR - ULAK.radius - 0.1;
          if (d > lim) {
            const nx = dx / d;
            const nz = dz / d;
            p.x = cx + nx * lim;
            p.z = nz * lim;
            const vn = v.x * nx + v.z * nz;
            if (vn > 0) {
              v.x -= 1.5 * vn * nx;
              v.z -= 1.5 * vn * nz;
            }
          }
        } else if (p.y < rimY) {
          // влетел сбоку сквозь стенку — выталкиваем
          this._bounceOut(cx, dx, dz, d, s);
        }
      } else {
        // над/на насыпи: высота поверхности падает от обода к земле
        const t = THREE.MathUtils.clamp((d - KAZAN.innerR) / (KAZAN.outerR - KAZAN.innerR), 0, 1);
        const surf = (t < 0.25 ? KAZAN.height : KAZAN.height * (1 - (t - 0.25) / 0.75)) + ULAK.radius;
        if (p.y < surf) {
          if (this.inKazan === s) {
            // изнутри за стенку не вылетаем
            const lim = KAZAN.innerR - ULAK.radius - 0.1;
            p.x = cx + (dx / d) * lim;
            p.z = (dz / d) * lim;
          } else if (prevY >= surf - 0.15 || t < 0.3) {
            // упал сверху на обод/склон — отскок и скатывание наружу
            p.y = surf;
            v.y = Math.abs(v.y) * 0.3;
            const nx = dx / d;
            const nz = dz / d;
            v.x = v.x * 0.6 + nx * 2.2;
            v.z = v.z * 0.6 + nz * 2.2;
          } else {
            this._bounceOut(cx, dx, dz, d, s);
          }
        }
      }
    }

    // земля
    if (!this.inKazan && p.y < ULAK.radius) {
      p.y = ULAK.radius;
      if (v.y < -2.5) v.y = -v.y * 0.28;
      else v.y = 0;
      const f = Math.exp(-dt * 4.5);
      v.x *= f;
      v.z *= f;
      this.spin.multiplyScalar(Math.exp(-dt * 6));
      if (v.y === 0 && Math.hypot(v.x, v.z) < 0.25) {
        v.set(0, 0, 0);
        this.resting = true;
      }
    }

    // границы площадки
    const bx = FIELD.length / 2 + FIELD.margin - 0.5;
    const bz = FIELD.width / 2 + FIELD.margin - 0.5;
    if (Math.abs(p.x) > bx) {
      p.x = Math.sign(p.x) * bx;
      v.x *= -0.4;
    }
    if (Math.abs(p.z) > bz) {
      p.z = Math.sign(p.z) * bz;
      v.z *= -0.4;
    }
    return scored;
  }

  _bounceOut(cx, dx, dz, d, s) {
    const nx = dx / (d || 1);
    const nz = dz / (d || 1);
    const r = KAZAN.outerR + ULAK.radius;
    this.pos.x = cx + nx * r;
    this.pos.z = nz * r;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) {
      this.vel.x -= 1.4 * vn * nx;
      this.vel.z -= 1.4 * vn * nz;
    }
    this.vel.multiplyScalar(0.7);
  }

  render(dt, time) {
    const m = this.mesh;
    m.position.copy(this.pos);
    if (this.holder) {
      // висит вдоль бока коня
      m.rotation.set(0.2, this.holder.heading, 1.25);
      m.position.y -= 0.05;
    } else if (!this.resting) {
      m.rotation.x += this.spin.x * dt;
      m.rotation.z += this.spin.z * dt;
    } else {
      m.rotation.x *= 0.8;
      m.rotation.z = THREE.MathUtils.lerp(m.rotation.z, Math.PI / 2, 0.2);
      m.position.y -= 0.08;
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

export { UP };
