import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ColorGradeShader } from './grade.js';
import { fbm2, ridged2, mulberry32 } from './noise.js';
import { makeNoiseMap } from './textures.js';
import { createDetailedYurt } from './props.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const sw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sw')) || window.innerWidth;
  const sh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sh')) || window.innerHeight;
  renderer.setSize(sw, sh);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

// Постобработка: затенение в складках (GTAO), лёгкое свечение, тональная компрессия.
// Клавиша G переключает на прямой рендер для слабых видеокарт.
export function createPostFX(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // затенение в складках и под корпусами (GTAO) — глубина и объём
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.6, thickness: 1.6, scale: 1.35, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 1.0;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.65, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(ColorGradeShader);
  composer.addPass(grade);
  return {
    composer,
    grade,
    enabled: true,
    // high — всё; medium — без GTAO; low — прямой рендер без постобработки
    setLevel(level) {
      this.enabled = level !== 'low';
      gtao.enabled = level === 'high';
      bloom.enabled = level === 'high';
    },
    render(time = 0) {
      grade.uniforms.uTime.value = time % 100;
      if (this.enabled) composer.render();
      else renderer.render(scene, camera);
    },
    resize(w, h) {
      composer.setSize(w, h);
    },
  };
}

export function createEnvironment(scene, assets) {
  const { sky, skyInfo } = assets;
  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.6;
  scene.backgroundIntensity = 1;

  const sunDir = skyInfo.sunDir.clone();
  scene.fog = new THREE.FogExp2(skyInfo.horizon.clone().multiplyScalar(0.82), 0.00095);

  const sun = new THREE.DirectionalLight(0xffe6c2, 4.3);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  // теневая «коробка» 84 × 84 м следует за камерой: ~2 см на тексель — чёткие тени у всадников
  const R = 42;
  sc.left = -R;
  sc.right = R;
  sc.top = R;
  sc.bottom = -R;
  sc.near = 10;
  sc.far = 420;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.2;
  scene.add(sun);
  scene.add(sun.target);

  const texel = (R * 2) / 4096;
  const _f = new THREE.Vector3();
  // привязка к сетке текселей — тени не «дрожат» при движении камеры
  function followShadow(focus) {
    _f.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
    sun.target.position.copy(_f);
    sun.position.copy(_f).addScaledVector(sunDir, 200);
  }

  return { sun, sunDir, fogColor: scene.fog.color.clone(), followShadow };
}

// Бескрайняя степь вокруг поля
export function createSteppe(scene, assets) {
  const maps = assets.grass([100, 124, 58], 0.32, 420);
  const mat = new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0 });
  mat.normalScale.set(1.3, 1.3);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1300, 64), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

// Кольцо предгорий и снежных гор на горизонте
export function createMountains(scene) {
  const segA = 640;
  const segR = 96;
  const r0 = 190;
  const r1 = 1150;
  const pos = [];
  const hts = [];
  const idx = [];
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = r0 + (r1 - r0) * Math.pow(t, 1.25);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const hills = fbm2(x * 0.006 + 40, z * 0.006 + 40, 4, 3);
      const ridge = ridged2(x * 0.0026 + 11, z * 0.0026 + 7, 6, 8);
      // мелкие складки и осыпи на склонах
      const detail = ridged2(x * 0.018 + 3, z * 0.018 + 9, 3, 21) - 0.5;
      const sHills = THREE.MathUtils.smoothstep(r, r0, 380);
      const sMount = THREE.MathUtils.smoothstep(r, 400, 900);
      const fall = 1 - THREE.MathUtils.smoothstep(r, 1000, r1) * 0.5;
      const h = sHills * hills * 34 + sMount * (ridge * 340 + hills * 60 + detail * 28 * ridge) * fall;
      pos.push(x, h - 1.5 * (1 - sHills) - 0.5, z);
      hts.push(h);
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
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // цвет по высоте и крутизне: трава на пологих низинах, скалы на кручах,
  // снег — наверху и только там, где склон не слишком крут (на отвесах снег не держится)
  const nrm = geo.attributes.normal;
  const col = new Float32Array(hts.length * 3);
  const cGrass = new THREE.Color(0x6f8a45);
  const cDry = new THREE.Color(0x9b8a5a);
  const cRock = new THREE.Color(0x5e5a55);
  const cRockDark = new THREE.Color(0x3a3a40);
  const cSnow = new THREE.Color(0xe8eef6);
  const tmp = new THREE.Color();
  for (let i = 0; i < hts.length; i++) {
    const h = hts[i];
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const up = nrm.getY(i);
    const steep = THREE.MathUtils.smoothstep(1 - up, 0.18, 0.5);
    const n = fbm2(x * 0.03, z * 0.03, 3, 5);
    if (h < 60) tmp.copy(cGrass).lerp(cDry, THREE.MathUtils.clamp(h / 60 + n * 0.5 - 0.25, 0, 1));
    else tmp.copy(cDry).lerp(cGrass, (1 - steep) * 0.35 * (1 - THREE.MathUtils.smoothstep(h, 60, 140)));
    tmp.lerp(n > 0.5 ? cRock : cRockDark, Math.max(steep, THREE.MathUtils.smoothstep(h, 90, 170)) * 0.9);
    const snow = THREE.MathUtils.smoothstep(h + n * 60, 170, 225) * (1 - steep * 0.85);
    tmp.lerp(cSnow, snow);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide,
    bumpMap: makeNoiseMap(256, 77, 60),
    bumpScale: 2.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

export function createYurts(scene) {
  const spots = [
    [-34, -54, 0.3, 1],
    [-22, -60, -0.2, 1.15],
    [-10, -55, 0.1, 0.95],
    [26, -57, -0.4, 1.1],
    [40, -52, 0.2, 1],
    [-128, 22, 1.4, 1.1],
    [130, -18, -1.5, 1],
    [14, 58, 3.0, 1.05],
    [-30, 56, 3.3, 1],
  ];
  const yurts = [];
  for (const [x, z, rot, s] of spots) {
    const y = createDetailedYurt(Math.round(x * 7 + z));
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

// Погода: меняет свет, дымку и экспозицию поверх одного и того же HDRI-неба
const WEATHER = {
  clear: { sun: 4.3, sunColor: 0xffe6c2, env: 0.6, bg: 1.0, fog: 0.0011, fogTint: [1, 0.98, 0.95], exposure: 0.66 },
  overcast: { sun: 1.3, sunColor: 0xe6eef8, env: 1.15, bg: 0.72, fog: 0.0024, fogTint: [0.82, 0.86, 0.92], exposure: 0.62 },
  evening: { sun: 3.4, sunColor: 0xff9f55, env: 0.45, bg: 0.6, fog: 0.0016, fogTint: [1.0, 0.72, 0.52], exposure: 0.7 },
  fog: { sun: 1.6, sunColor: 0xf4f0e8, env: 1.0, bg: 0.9, fog: 0.007, fogTint: [0.95, 0.96, 0.98], exposure: 0.64 },
};
export const WEATHER_IDS = Object.keys(WEATHER);

export function applyWeather(scene, renderer, env, id) {
  const w = WEATHER[id] ?? WEATHER.clear;
  env.sun.intensity = w.sun;
  env.sun.color.set(w.sunColor);
  scene.environmentIntensity = w.env;
  scene.backgroundIntensity = w.bg;
  scene.fog.density = w.fog;
  scene.fog.color.setRGB(env.fogColor.r * w.fogTint[0], env.fogColor.g * w.fogTint[1], env.fogColor.b * w.fogTint[2]);
  renderer.toneMappingExposure = w.exposure;
}
