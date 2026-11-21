import * as THREE from 'three';

// Следы копыт: на песке глубокие и держатся долго, на траве — слабые примятости.
// Пул отпечатков (InstancedMesh) с умножающим смешиванием: темнят землю под собой
// и постепенно «затягиваются» — цвет возвращается к белому (нет эффекта).

const MAX = 2400;

function printTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 64, 64);
  // подкова: тёмная дуга с более тёмной кромкой
  const g = ctx.createRadialGradient(32, 34, 6, 32, 34, 26);
  g.addColorStop(0, '#9a8a78');
  g.addColorStop(0.7, '#6a5a48');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 34, 20, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8ccbc';
  ctx.beginPath();
  ctx.ellipse(32, 44, 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tracks {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({
      map: printTexture(),
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(0.17, 0.2);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.age = new Float32Array(MAX).fill(1e9);
    this.life = 20;
    this.strength = 1;
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
    const hidden = new THREE.Matrix4().makeTranslation(0, -100, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, hidden);
      this.mesh.setColorAt(i, this._c.setRGB(1, 1, 1));
    }
    this.dist = new Map();
    scene.add(this.mesh);
  }

  // Песок: глубокие и долгие следы; трава: слабые и быстро исчезают
  setSurface(sand) {
    this.life = sand ? 30 : 9;
    this.strength = sand ? 1 : 0.45;
  }

  _stamp(x, z, heading) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading);
    this._m.compose(new THREE.Vector3(x, 0.022, z), this._q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, this._m);
    this.age[i] = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Ставит отпечатки за конём: на каждый шаг — пара копыт (левое/правое)
  track(rider) {
    const sp = Math.hypot(rider.vel.x, rider.vel.z);
    if (sp < 1.5 || !rider.group.visible) return;
    const prev = this.dist.get(rider) ?? { x: rider.pos.x, z: rider.pos.z, side: 1 };
    const d = Math.hypot(rider.pos.x - prev.x, rider.pos.z - prev.z);
    const stride = sp > 6 ? 1.4 : 0.9;
    if (d >= stride) {
      const h = rider.heading;
      const sx = Math.cos(h) * 0.22 * prev.side;
      const sz = -Math.sin(h) * 0.22 * prev.side;
      for (const back of [0.75, -0.65]) {
        this._stamp(
          rider.pos.x - Math.sin(h) * back + sx + (Math.random() - 0.5) * 0.08,
          rider.pos.z - Math.cos(h) * back + sz + (Math.random() - 0.5) * 0.08,
          h,
        );
      }
      prev.x = rider.pos.x;
      prev.z = rider.pos.z;
      prev.side = -prev.side;
    }
    this.dist.set(rider, prev);
  }

  update(dt) {
    let changed = false;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] > this.life + 1) continue;
      this.age[i] += dt;
      // свежий след тёмный, со временем «затягивается»
      const k = Math.max(0, 1 - this.age[i] / this.life) * this.strength;
      const v = 1 - 0.55 * k;
      this.mesh.setColorAt(i, this._c.setRGB(v, v * 0.98, v * 0.95));
      changed = true;
    }
    if (changed) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.age.fill(1e9);
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, this._c.setRGB(1, 1, 1));
    this.mesh.instanceColor.needsUpdate = true;
    this.dist.clear();
  }
}
