import RAPIER from '@dimforge/rapier3d-compat';
import { FIELD, KAZAN, ULAK, GRAVITY } from '../config.js';

// Физический мир на Rapier (WASM): улак — настоящее твёрдое тело массой ~30 кг,
// казаны — трёхмерные сетки (чаша с ободом), кони — кинематические тела,
// от которых улак отскакивает.

const G_STATIC = 0x0001;
const G_HORSE = 0x0002;
const G_ULAK = 0x0004;
const groups = (member, filter) => ((member << 16) | filter) >>> 0;

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export class PhysicsWorld {
  // kazanGeometry — { vertices: Float32Array, indices: Uint32Array } профиля казана (локальные координаты)
  constructor(kazanGeometry) {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    const w = this.world;

    // земля
    const ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(400, 0.5, 400)
        .setFriction(1.0)
        .setRestitution(0.1)
        .setCollisionGroups(groups(G_STATIC, 0xffff)),
      ground,
    );

    // невидимые борта площадки
    const bx = FIELD.length / 2 + FIELD.margin;
    const bz = FIELD.width / 2 + FIELD.margin;
    const wall = (x, z, hx, hz) => {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 20, z));
      w.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, 20, hz).setRestitution(0.3).setCollisionGroups(groups(G_STATIC, 0xffff)),
        b,
      );
    };
    wall(bx + 1, 0, 1, bz + 2);
    wall(-bx - 1, 0, 1, bz + 2);
    wall(0, bz + 1, bx + 2, 1);
    wall(0, -bz - 1, bx + 2, 1);

    // казаны
    for (const s of [-1, 1]) {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s * KAZAN.x, 0, 0));
      w.createCollider(
        RAPIER.ColliderDesc.trimesh(kazanGeometry.vertices, kazanGeometry.indices)
          .setFriction(0.9)
          .setRestitution(0.15)
          .setCollisionGroups(groups(G_STATIC, 0xffff)),
        b,
      );
    }

    this.riderBodies = new Map();
    this._q = { x: 0, y: 0, z: 0, w: 1 };
    this._v = { x: 0, y: 0, z: 0 };
  }

  // Туша: капсула вдоль оси Z
  createUlakBody() {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 3, 0)
        .setCcdEnabled(true)
        .setLinearDamping(0.02)
        .setAngularDamping(0.6),
    );
    const s = Math.SQRT1_2;
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.27, ULAK.radius - 0.06)
        .setRotation({ x: s, y: 0, z: 0, w: s })
        .setMass(ULAK.mass)
        .setFriction(1.1)
        .setRestitution(0.12)
        .setCollisionGroups(groups(G_ULAK, G_STATIC | G_HORSE)),
      body,
    );
    return { body, collider };
  }

  // Летящий улак не задевает коней, пока не истечёт «окно» после броска
  setUlakHitsHorses(collider, on) {
    collider.setCollisionGroups(groups(G_ULAK, on ? G_STATIC | G_HORSE : G_STATIC));
  }

  addRider(rider) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    // корпус коня + всадник; низ приподнят, чтобы лежащий улак проходил под брюхом
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.36, 0.85, 1.15)
        .setTranslation(0, 1.4, 0)
        .setRestitution(0.2)
        .setFriction(0.6)
        .setCollisionGroups(groups(G_HORSE, G_ULAK)),
      body,
    );
    this.riderBodies.set(rider, body);
  }

  syncRiders() {
    for (const [r, body] of this.riderBodies) {
      this._v.x = r.pos.x;
      this._v.y = 0;
      this._v.z = r.pos.z;
      body.setNextKinematicTranslation(this._v);
      this._q.y = Math.sin(r.heading / 2);
      this._q.w = Math.cos(r.heading / 2);
      body.setNextKinematicRotation(this._q);
    }
  }

  step(dt) {
    this.world.timestep = dt;
    this.world.step();
  }
}
