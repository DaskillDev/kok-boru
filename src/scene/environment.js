import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fbm2, ridged2, mulberry32 } from './noise.js';
import { makeGrassMap, makeNoiseMap, yurtWallTexture } from './textures.js';

const SUN_ELEVATION = 38; // градусы
const SUN_AZIMUTH = 215;

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

// Небо, солнце, туман, окружение для PBR-отражений
export function createEnvironment(scene, renderer) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - SUN_ELEVATION),
    THREE.MathUtils.degToRad(SUN_AZIMUTH),
  );

  const sky = new Sky();
  sky.scale.setScalar(9000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.45;
    u.cloudDensity.value = 0.45;
    u.cloudElevation.value = 0.55;
  }
  scene.add(sky);

  // Карта окружения из того же неба
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(9000);
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envSky.material.uniforms.turbidity.value = 4;
  envSky.material.uniforms.rayleigh.value = 1.4;
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0, 1, 10000).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.fog = new THREE.FogExp2(0xb9d0e6, 0.0012);

  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6a5a38, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.position.copy(sunDir).multiplyScalar(160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -78;
  sc.right = 78;
  sc.top = 60;
  sc.bottom = -60;
  sc.near = 20;
  sc.far = 330;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun);
  scene.add(sun.target);

  return { sky, sun, sunDir };
}

// Бескрайняя степь вокруг поля
export function createSteppe(scene) {
  const map = makeGrassMap({ base: [112, 132, 62], variance: 40, seed: 21 }, 260);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1300, 64), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

// Кольцо предгорий и снежных гор на горизонте
export function createMountains(scene) {
  const segA = 320;
  const segR = 46;
  const r0 = 190;
  const r1 = 1150;
  const pos = [];
  const col = [];
  const idx = [];
  const cGrass = new THREE.Color(0x7c9050);
  const cDry = new THREE.Color(0x9a8a5c);
  const cRock = new THREE.Color(0x6f6a66);
  const cRockDark = new THREE.Color(0x4f4c50);
  const cSnow = new THREE.Color(0xf6f8fc);
  const tmp = new THREE.Color();

  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = r0 + (r1 - r0) * Math.pow(t, 1.25);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // шум периодичен по углу: берём координаты на окружности
      const hills = fbm2(x * 0.006 + 40, z * 0.006 + 40, 4, 3);
      const ridge = ridged2(x * 0.0026 + 11, z * 0.0026 + 7, 5, 8);
      const sHills = THREE.MathUtils.smoothstep(r, r0, 380);
      const sMount = THREE.MathUtils.smoothstep(r, 400, 900);
      const fall = 1 - THREE.MathUtils.smoothstep(r, 1000, r1) * 0.5;
      const h = sHills * hills * 34 + sMount * (ridge * 330 + hills * 60) * fall;
      pos.push(x, h - 1.5 * (1 - sHills) - 0.5, z);

      const n = fbm2(x * 0.02, z * 0.02, 3, 5);
      if (h < 45) tmp.copy(cGrass).lerp(cDry, THREE.MathUtils.clamp(h / 45 + n * 0.5 - 0.2, 0, 1));
      else if (h < 150) tmp.copy(cDry).lerp(n > 0.5 ? cRock : cRockDark, THREE.MathUtils.clamp((h - 45) / 70, 0, 1));
      else tmp.copy(n > 0.5 ? cRock : cRockDark);
      const snow = THREE.MathUtils.smoothstep(h + n * 50, 165, 215);
      tmp.lerp(cSnow, snow);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

// Юрта: войлочные стены, купол, түндүк, дверь
function createYurt(wallMap) {
  const g = new THREE.Group();
  const R = 3.3;
  const wallH = 1.9;
  const felt = new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.92 });

  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.02, wallH, 40, 1, true), wallMat);
  wall.position.y = wallH / 2;
  g.add(wall);

  // купол — тело вращения
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = R * 1.04 * Math.cos(t * Math.PI * 0.46) * (1 - t * 0.08) + 0.02;
    const y = wallH + Math.sin(t * Math.PI * 0.5) * 1.75;
    pts.push(new THREE.Vector2(Math.max(r, 0.55), y));
  }
  const roof = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), felt);
  g.add(roof);

  // стяжки на куполе
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.8 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.05, 0.06, 8, 48), ropeMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = wallH + 0.02;
  g.add(band);
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.78, 0.045, 8, 48), ropeMat);
  band2.rotation.x = Math.PI / 2;
  band2.position.y = wallH + 1.0;
  g.add(band2);

  // түндүк
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
  const tunduk = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 8, 24), wood);
  tunduk.rotation.x = Math.PI / 2;
  tunduk.position.y = wallH + 1.76;
  g.add(tunduk);
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 1.1, 3, 6), wood);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = (i * Math.PI) / 2;
    bar.position.y = wallH + 1.8;
    g.add(bar);
  }

  // дверь
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xa2331f, roughness: 0.7 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.14), doorMat);
  door.position.set(0, 0.8, R + 0.02);
  g.add(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 1.74, 0.1), wood);
  frame.position.set(0, 0.85, R - 0.02);
  g.add(frame);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function createYurts(scene) {
  const wallMap = yurtWallTexture();
  const spots = [
    [-34, -54, 0.3, 1],
    [-22, -60, -0.2, 1.15],
    [-10, -55, 0.1, 0.95],
    [26, -57, -0.4, 1.1],
    [40, -52, 0.2, 1],
    [-84, 22, 1.4, 1.1],
    [86, -18, -1.5, 1],
    [14, 58, 3.0, 1.05],
    [-30, 56, 3.3, 1],
  ];
  const yurts = [];
  for (const [x, z, rot, s] of spots) {
    const y = createYurt(wallMap);
    y.position.set(x, 0, z);
    // дверью к полю
    y.rotation.y = Math.atan2(-x, -z) + rot * 0.15;
    y.scale.setScalar(s);
    scene.add(y);
    yurts.push(y);
  }
  return yurts;
}

// Пучки травы вокруг поля (InstancedMesh)
export function createGrassTufts(scene, isBlocked) {
  const blade = new THREE.ConeGeometry(0.07, 0.6, 3, 1);
  blade.translate(0, 0.3, 0);
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const b = blade.clone();
    b.rotateZ((i - 2) * 0.22);
    b.rotateY(i * 1.3);
    b.translate(Math.cos(i * 2.1) * 0.08, 0, Math.sin(i * 2.1) * 0.08);
    parts.push(b);
  }
  const geo = mergeSimple(parts);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const count = 9000;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rnd = mulberry32(77);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 6) {
    const a = rnd() * Math.PI * 2;
    const r = 40 + Math.pow(rnd(), 1.6) * 190;
    p.set(Math.cos(a) * r * 1.25, 0, Math.sin(a) * r);
    if (isBlocked(p.x, p.z)) continue;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
    const k = 0.7 + rnd() * 1.3;
    s.set(k, k * (0.7 + rnd() * 0.9), k);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    c.setHSL(0.2 + rnd() * 0.09, 0.4 + rnd() * 0.2, 0.26 + rnd() * 0.16);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Простое объединение не-индексированных геометрий (позиции + нормали)
function mergeSimple(geos) {
  const pos = [];
  const nor = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

export { makeNoiseMap };
