import * as THREE from 'three';
import { GRAVITY, KAZAN } from '../config.js';

// Подсказка траектории броска, пока игрок держит пробел.

const N = 36;
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

export class AimGuide {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.85, depthTest: false }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 5;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;
    this.line.visible = this.ring.visible = false;
    scene.add(this.line, this.ring);
  }

  update(rider) {
    const on = rider.charging;
    this.line.visible = this.ring.visible = on;
    if (!on) return;
    rider.throwOrigin(_p);
    rider.throwVelocity(rider.charge, _v);
    const arr = this.line.geometry.attributes.position.array;
    const dt = 0.07;
    let landed = false;
    let good = false;
    for (let i = 0; i < N; i++) {
      arr[i * 3] = _p.x;
      arr[i * 3 + 1] = _p.y;
      arr[i * 3 + 2] = _p.z;
      if (landed) continue;
      _v.y -= GRAVITY * dt;
      _p.addScaledVector(_v, dt);
      // высота «приземления»: обод казана, если летим над чашей, иначе земля
      let floor = 0.1;
      for (const s of [-1, 1]) {
        if (Math.hypot(_p.x - s * KAZAN.x, _p.z) < KAZAN.innerR) {
          floor = KAZAN.height;
          if (_p.y <= floor) good = true;
        }
      }
      if (_p.y <= floor) {
        _p.y = floor;
        landed = true;
      }
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.ring.position.set(_p.x, _p.y + 0.05, _p.z);
    this.ring.material.color.set(good ? 0x7dff6a : 0xffe27a);
    this.line.material.color.set(good ? 0xa8ff9a : 0xfff1a8);
    this.ring.scale.setScalar(good ? 1.5 : 1);
  }
}
