import * as THREE from 'three';
import { tileNoise } from './noise.js';

// Тени от облаков: по земле, горам, коням и всадникам медленно плывут пятна тени.
// Затеняется только прямой солнечный свет — рассеянный свет неба остаётся, как в жизни.

function cloudTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 1;
      let tot = 0;
      for (let o = 0; o < 5; o++) {
        const p = 3 << o;
        n += amp * tileNoise((x / size) * p, (y / size) * p, p, 41 + o);
        tot += amp;
        amp *= 0.5;
      }
      const v = Math.round((n / tot) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const cloudUniforms = {
  uCloudTex: { value: null },
  uCloudTime: { value: 0 },
  uCloudAmount: { value: 1 }, // 0 — без теней облаков (пасмурно/туман)
};

export function initClouds() {
  cloudUniforms.uCloudTex.value = cloudTexture();
}

// Подмешивает тени облаков в стандартный PBR-материал
export function applyCloudShadows(mat) {
  if (!mat || !mat.isMeshStandardMaterial || mat.userData.cloud) return;
  mat.userData.cloud = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, cloudUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vCloudWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vCloudWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCloudWorld;
        uniform sampler2D uCloudTex;
        uniform float uCloudTime;
        uniform float uCloudAmount;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec2 cuv = vCloudWorld.xz * 0.0021 + uCloudTime * vec2(0.0042, 0.0019);
          float cn = texture2D(uCloudTex, cuv).r;
          float shade = mix(1.0, 0.38, smoothstep(0.5, 0.66, cn) * uCloudAmount);
          reflectedLight.directDiffuse *= shade;
          reflectedLight.directSpecular *= shade;
        }`,
      );
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|clouds`;
  mat.needsUpdate = true;
}

export function applyCloudShadowsTo(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) applyCloudShadows(m);
  });
}
