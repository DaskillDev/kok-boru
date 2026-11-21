import * as THREE from 'three';

// Цветокоррекция «как в кино»: раздельное тонирование теней и светов,
// мягкий S-контраст, насыщенность с защитой уже ярких цветов, виньетка и лёгкое зерно.
// Применяется после тональной компрессии (в экранных цветах).

export const ColorGradeShader = {
  name: 'ColorGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Color(0.02, 0.035, 0.075) }, // холодные тени
    uHighTint: { value: new THREE.Color(0.06, 0.035, 0.0) }, // тёплые света
    uContrast: { value: 1.12 },
    uSaturation: { value: 1.12 },
    uVibrance: { value: 0.22 },
    uLift: { value: -0.018 }, // чуть глубже чёрный
    uVignette: { value: 0.32 },
    uGrain: { value: 0.022 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVibrance;
    uniform float uLift;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = luma(c);

      // раздельное тонирование
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l));
      c += uHighTint * smoothstep(0.45, 1.0, l);

      // S-образный контраст вокруг среднего серого
      c = clamp(c, 0.0, 1.0);
      vec3 s = c * c * (3.0 - 2.0 * c);
      c = mix(c, s, uContrast - 1.0);
      c = (c - 0.5) * (1.0 + (uContrast - 1.0) * 0.5) + 0.5;
      c += uLift * (1.0 - c);

      // насыщенность + «вибранс»: сильнее поднимаем блёклые цвета
      float l2 = luma(c);
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3(l2), c, uSaturation + uVibrance * (1.0 - sat));

      // виньетка
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.15, 0.75, dot(d, d) * 2.2);

      // плёночное зерно
      float n = fract(sin(dot(vUv * vec2(1280.0, 720.0) + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};
