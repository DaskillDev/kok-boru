import * as THREE from 'three';

// Пыль из-под копыт: пул точечных частиц с затуханием.

const MAX = 420;

export class Dust {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 1.5,
        map: new THREE.CanvasTexture(c),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.next = 0;
    this.acc = new Map();
  }

  // Вызывать каждый кадр для каждого всадника
  emit(dt, rider) {
    const sp = Math.hypot(rider.vel.x, rider.vel.z);
    if (sp < 4) return;
    let a = (this.acc.get(rider) ?? 0) + dt * sp * 1.6;
    while (a >= 1) {
      a -= 1;
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const back = 0.9 + Math.random() * 0.8;
      this.pos[i * 3] = rider.pos.x - Math.sin(rider.heading) * back + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 1] = 0.12;
      this.pos[i * 3 + 2] = rider.pos.z - Math.cos(rider.heading) * back + (Math.random() - 0.5) * 0.7;
      this.vel[i * 3] = rider.vel.x * 0.12 + (Math.random() - 0.5) * 0.8;
      this.vel[i * 3 + 1] = 0.5 + Math.random() * 0.9;
      this.vel[i * 3 + 2] = rider.vel.z * 0.12 + (Math.random() - 0.5) * 0.8;
      this.life[i] = this.maxLife[i] = 0.7 + Math.random() * 0.7;
      const shade = 0.5 + Math.random() * 0.15;
      this.col[i * 4] = shade * 1.05;
      this.col[i * 4 + 1] = shade * 0.95;
      this.col[i * 4 + 2] = shade * 0.72;
    }
    this.acc.set(rider, a);
  }

  // Облако пыли от удара
  burst(x, z, count = 14, spread = 2.4) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      this.pos[i * 3] = x + Math.cos(a) * 0.3;
      this.pos[i * 3 + 1] = 0.3 + Math.random() * 0.9;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.3;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = 0.6 + Math.random() * 1.4;
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.life[i] = this.maxLife[i] = 0.6 + Math.random() * 0.6;
      const shade = 0.55 + Math.random() * 0.15;
      this.col[i * 4] = shade * 1.05;
      this.col[i * 4 + 1] = shade * 0.95;
      this.col[i * 4 + 2] = shade * 0.72;
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] *= 1 - dt * 1.5;
      const t = Math.max(this.life[i] / this.maxLife[i], 0);
      this.col[i * 4 + 3] = t * 0.3;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
