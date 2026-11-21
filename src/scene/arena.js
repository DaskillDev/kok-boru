import * as THREE from 'three';
import { FIELD, TEAMS } from '../config.js';
import { mulberry32 } from './noise.js';

// Трибуна вдоль дальней стороны поля, зрители (InstancedMesh) и баннер с названием.
// Зрители подпрыгивают при голе: arena.cheer().

const ROWS = 5;
const PER_ROW = 96;
const STAND_LEN = 96;

function bannerTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, '#173a7a');
  g.addColorStop(0.5, '#0f1a24');
  g.addColorStop(1, '#6e1715');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = '#e9b949';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 1008, 144);
  ctx.fillStyle = '#fff3d6';
  ctx.font = '900 96px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createArena(scene) {
  const group = new THREE.Group();
  const z0 = -(FIELD.width / 2 + FIELD.margin + 3.2); // передний край трибуны
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.9 });

  // ступени
  for (let i = 0; i < ROWS; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(STAND_LEN, 0.5 + i * 0.55, 1.25), i % 2 ? dark : wood);
    step.position.set(0, (0.5 + i * 0.55) / 2, z0 - i * 1.25);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }
  // задняя стенка и цветные полотнища команд по краям
  const back = new THREE.Mesh(new THREE.BoxGeometry(STAND_LEN, 4.4, 0.2), dark);
  back.position.set(0, 2.2, z0 - ROWS * 1.25 + 0.4);
  back.castShadow = true;
  group.add(back);
  const cloths = [];
  for (const side of [-1, 1]) {
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(STAND_LEN / 2 - 1, 1.1),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    );
    cloth.position.set((side * STAND_LEN) / 4, 0.62, z0 + 0.64);
    cloth.userData.side = side;
    group.add(cloth);
    cloths.push(cloth);
  }
  // полотнище команды висит на её половине; после смены казанов меняется и оно
  function setSides() {
    for (const c of cloths) c.material.color.set(TEAMS.find((t) => t.attackDir === -c.userData.side).color);
  }
  setSides();

  // баннер над трибуной
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, metalness: 0.3 });
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 9, 10), poleMat);
    pole.position.set(sx * 13, 4.5, z0 - ROWS * 1.25);
    pole.castShadow = true;
    group.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 4),
    new THREE.MeshStandardMaterial({ map: bannerTexture('УЛАК ТАРТЫШ'), roughness: 0.7, side: THREE.DoubleSide }),
  );
  banner.position.set(0, 7.2, z0 - ROWS * 1.25);
  group.add(banner);

  // зрители: тело и голова — два InstancedMesh
  const count = ROWS * PER_ROW;
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.5, 3, 8);
  bodyGeo.translate(0, 0.45, 0);
  const headGeo = new THREE.SphereGeometry(0.14, 8, 6);
  headGeo.translate(0, 1.02, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  // калпаки и тебетеи на головах части зрителей
  const hatGeo = new THREE.ConeGeometry(0.13, 0.26, 10);
  hatGeo.translate(0, 1.24, 0);
  const hats = new THREE.InstancedMesh(hatGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), count);
  const hatOf = [];
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  const rnd = mulberry32(2024);
  const base = [];
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const teamCols = TEAMS.map((t) => new THREE.Color(t.color));
  let n = 0;
  for (let i = 0; i < ROWS; i++) {
    for (let k = 0; k < PER_ROW; k++) {
      if (rnd() < 0.12) continue; // пустые места
      const x = (k / (PER_ROW - 1) - 0.5) * (STAND_LEN - 2) + (rnd() - 0.5) * 0.3;
      const y = 0.5 + i * 0.55;
      const z = z0 - i * 1.25 + (rnd() - 0.5) * 0.2;
      const s = 0.9 + rnd() * 0.25;
      base.push({ x, y, z, s, phase: rnd() * 6.28, fan: rnd() });
      m.makeScale(s, s, s).setPosition(x, y, z);
      bodies.setMatrixAt(n, m);
      heads.setMatrixAt(n, m);
      if (rnd() < 0.4) {
        hatOf.push(n);
        hats.setMatrixAt(hatOf.length - 1, m);
        hats.setColorAt(hatOf.length - 1, col.set(rnd() < 0.75 ? 0xf2efe6 : 0x2a2420));
      }
      // часть зрителей в цветах «своей» команды, остальные — пёстрая толпа
      if (rnd() < 0.45) col.copy(x * TEAMS[0].attackDir < 0 ? teamCols[0] : teamCols[1]).offsetHSL(0, 0, (rnd() - 0.5) * 0.15);
      else col.setHSL(rnd(), 0.35 + rnd() * 0.3, 0.3 + rnd() * 0.35);
      bodies.setColorAt(n, col);
      col.setHSL(0.07 + rnd() * 0.03, 0.4, 0.5 + rnd() * 0.2);
      heads.setColorAt(n, col);
      n++;
    }
  }
  bodies.count = heads.count = n;
  hats.count = hatOf.length;
  hats.instanceMatrix.needsUpdate = true;
  if (hats.instanceColor) hats.instanceColor.needsUpdate = true;
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
  bodies.receiveShadow = heads.receiveShadow = true;
  group.add(bodies, heads, hats);
  // прожекторные мачты по углам поля
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 2.2 });
  const hx = FIELD.length / 2 + 14;
  const hz = FIELD.width / 2 + 14;
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 30, 10), mastMat);
    mast.position.set(x, 15, z);
    mast.castShadow = true;
    group.add(mast);
    const head = new THREE.Group();
    head.position.set(x, 30.5, z);
    head.lookAt(0, 0, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.5), mastMat);
    head.add(frame);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.2), lampMat);
        lamp.position.set(-1.9 + i * 1.9, -0.75 + j * 1.5, 0.3);
        head.add(lamp);
      }
    }
    group.add(head);
  }

  // табло над трибуной: команды, счёт, время
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 1024;
  sbCanvas.height = 384;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 8.25),
    new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false }),
  );
  const boardZ = z0 - ROWS * 1.25 - 0.4;
  board.position.set(-34, 8.6, boardZ);
  group.add(board);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(23, 9.2, 0.6), mastMat);
  boardFrame.position.set(-34, 8.6, boardZ - 0.35);
  group.add(boardFrame);
  for (const sx of [-9, 9]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 8, 8), mastMat);
    leg.position.set(-34 + sx, 2.4, boardZ - 0.4);
    group.add(leg);
  }
  let sbKey = '';
  function setScoreboard(teams, score, timeText, emblem, flagFor) {
    const key = `${teams.map((t) => t.code + t.name).join()}|${score}|${timeText}|${emblem}`;
    if (key === sbKey) return;
    sbKey = key;
    const ctx = sbCanvas.getContext('2d');
    ctx.fillStyle = '#0b1118';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = '#e9b949';
    ctx.font = '700 34px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(emblem, 512, 52);
    teams.forEach((t, i) => {
      const x = i === 0 ? 220 : 804;
      ctx.drawImage(flagFor(t.code), x - 66, 92, 132, 88);
      ctx.fillStyle = t.css;
      ctx.font = '800 40px Segoe UI, sans-serif';
      ctx.fillText(t.name, x, 236);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 120px Segoe UI, sans-serif';
      ctx.fillText(String(score[i]), i === 0 ? 410 : 614, 205);
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 70px Segoe UI, sans-serif';
    ctx.fillText(':', 512, 190);
    ctx.fillStyle = '#ffd34a';
    ctx.font = '800 58px Segoe UI, sans-serif';
    ctx.fillText(timeText, 512, 330);
    sbTex.needsUpdate = true;
  }

  scene.add(group);

  let cheerT = 0;
  let idleT = 0;
  function writeAll(time, amp) {
    for (let i = 0; i < n; i++) {
      const b = base[i];
      const jump = Math.max(0, Math.sin(time * (7 + b.fan * 3) + b.phase)) * amp * (0.4 + b.fan * 0.6);
      m.makeScale(b.s, b.s, b.s).setPosition(b.x, b.y + jump, b.z);
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      b.m = b.m || new THREE.Matrix4();
      b.m.copy(m);
    }
    hatOf.forEach((idx, k) => hats.setMatrixAt(k, base[idx].m));
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = hats.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    setSides,
    setScoreboard,
    setVisible(v) {
      bodies.visible = heads.visible = hats.visible = v;
    },
    cheer(duration = 2.8) {
      cheerT = duration;
    },
    update(dt, time) {
      if (cheerT > 0) {
        cheerT -= dt;
        writeAll(time, 0.55 * Math.min(1, cheerT / 0.6));
        if (cheerT <= 0) writeAll(time, 0);
        return;
      }
      // в покое толпа слегка шевелится — обновляем редко
      idleT += dt;
      if (idleT > 0.12) {
        idleT = 0;
        writeAll(time * 0.25, 0.05);
      }
    },
  };
}
