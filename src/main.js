import * as THREE from 'three';
import { TEAMS, FIELD, KAZAN } from './config.js';
import {
  createRenderer,
  createPostFX,
  createEnvironment,
  createSteppe,
  createMountains,
  createYurts,
  createGrassTufts,
} from './scene/environment.js';
import { loadAssets } from './scene/assets.js';
import { createField, kazanCollisionMesh } from './scene/field.js';
import { Dust } from './scene/Dust.js';
import { initPhysics, PhysicsWorld } from './physics/PhysicsWorld.js';
import { loadHorseAsset } from './entities/HorseModel.js';
import { loadRiderAsset } from './entities/RiderFigure.js';
import { Horseman } from './entities/Horseman.js';
import { Ulak } from './entities/Ulak.js';
import { Input } from './game/Input.js';
import { CameraRig } from './game/CameraRig.js';
import { Hud } from './game/Hud.js';
import { AimGuide } from './game/AimGuide.js';
import { Match } from './game/Match.js';
import { BotBrain } from './ai/BotBrain.js';

const hud = new Hud();
const container = document.getElementById('app');
const renderer = createRenderer(container);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2600);
camera.position.set(0, 6, 22);
const postfx = createPostFX(renderer, scene, camera);

const input = new Input();
const rig = new CameraRig(camera);
const aim = new AimGuide(scene);
const dust = new Dust(scene);
const ORIGIN = new THREE.Vector3();
const ULAK_REST_Y = 0.5;

let field = null;
let match = null;
let player = null;
let riders = [];
let ulak = null;
let paused = false;

async function init() {
  const [assets] = await Promise.all([loadAssets(), loadHorseAsset(), loadRiderAsset(), initPhysics()]);

  createEnvironment(scene, assets);
  createSteppe(scene, assets);
  createMountains(scene);
  const yurts = createYurts(scene);
  field = createField(scene, assets);
  createGrassTufts(scene, (x, z) => {
    if (Math.abs(x) < FIELD.length / 2 + 9 && Math.abs(z) < FIELD.width / 2 + 9) return true;
    return yurts.some((y) => Math.hypot(y.position.x - x, y.position.z - z) < 4.5);
  });

  const physics = new PhysicsWorld(kazanCollisionMesh());

  // Состав 2×2. Чтобы сделать 3×3/4×4 или онлайн — достаточно изменить этот список.
  const roster = [
    { teamId: 0, name: 'Вы', coat: 'bay', isHuman: true },
    { teamId: 0, name: 'Айбек', coat: 'grey', skill: 0.6 },
    { teamId: 1, name: 'Темир', coat: 'black', skill: 0.55 },
    { teamId: 1, name: 'Эрлан', coat: 'palomino', skill: 0.7 },
  ];
  riders = roster.map((r, id) => new Horseman({ id, ...r }));
  for (const r of riders) {
    scene.add(r.group);
    physics.addRider(r);
  }
  player = riders.find((r) => r.isHuman);
  const brains = riders.filter((r) => !r.isHuman).map((r) => new BotBrain(r, roster[r.id].skill));

  ulak = new Ulak(scene, physics);

  match = new Match({
    riders,
    ulak,
    brains,
    physics,
    events: {
      onCountdown: (n) => hud.showBanner(String(n), 0.95),
      onStart: () => hud.showBanner('Алга!', 0.9),
      onGoal: (team, scorer) => {
        hud.setScore(match.score);
        const who = scorer ? (scorer.isHuman ? 'Вы забили!' : scorer.name) : '';
        hud.showBanner(`ГОЛ!<small>${team.name} · ${who}</small>`, 3, team.css);
      },
      onSteal: (thief, victim) => {
        if (thief.isHuman) hud.showBanner('<small>Улак отобран!</small>', 1);
        else if (victim.isHuman) hud.showBanner('<small>У вас вырвали улак!</small>', 1.2);
      },
      onEnd: (score) => {
        const [a, b] = score;
        const res = a > b ? 'Победа!' : a < b ? 'Поражение' : 'Ничья';
        hud.showBanner('');
        hud.showMenu(`${res} &nbsp; ${TEAMS[0].name} ${a} : ${b} ${TEAMS[1].name}`, 'Играть снова');
      },
    },
  });

  // стартовая расстановка для меню
  match.kickoff();
  match.state = 'idle';
  ulak.reset(0, 0, ULAK_REST_Y);
  rig.orbitT = 0.6;

  hud.startBtn.disabled = false;
  hud.startBtn.textContent = 'Начать матч';
  hud.startBtn.addEventListener('click', startMatch);
  input.onPause = () => {
    if (!match || match.state === 'idle' || match.state === 'over') return;
    paused = !paused;
    if (paused) hud.showBanner('Пауза<small>Esc — продолжить</small>');
    else hud.showBanner('');
  };
  input.onCamera = () => {
    const m = rig.nextMode(match.state === 'idle' || match.state === 'over' ? null : player);
    hud.showBanner(`<small>${m.label}</small>`, 1.4);
  };
  input.onGraphics = () => {
    postfx.enabled = !postfx.enabled;
    hud.showBanner(`<small>Графика: ${postfx.enabled ? 'высокая' : 'упрощённая'}</small>`, 1.4);
  };

  // для отладки и будущих тестов
  window.__game = { match, riders, ulak, player, scene, camera, renderer, hud, input, rig, postfx, physics };
}

function startMatch() {
  hud.hideMenu();
  hud.show(true);
  hud.setScore([0, 0]);
  paused = false;
  match.start();
  rig.snap(player);
  hud.startBtn.blur();
}

function possessionText() {
  const h = ulak.holder;
  if (!h) return match.state === 'playing' ? 'Улак свободен — хватай! (Пробел)' : '';
  if (h === player) return 'Улак у вас — везите к красному казану и бросайте';
  return h.teamId === player.teamId ? `Улак у напарника (${h.name})` : `Улак у соперника (${h.name}) — отбирайте!`;
}

let last = performance.now();
let time = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;

  if (match) {
    const live = match.state !== 'idle' && !paused;
    if (live) {
      input.apply(player.controls, player, rig.mode === 'tv');
      match.update(dt);
    }
    if (!paused) {
      for (const r of riders) {
        r.render(dt);
        if (live) dust.emit(dt, r);
      }
      ulak.render(dt, time);
      dust.update(dt);
    }
    aim.update(player);

    if (match.state === 'idle' || match.state === 'over') rig.orbit(dt, match.state === 'over' ? player.pos : ORIGIN);
    else if (!paused) rig.follow(dt, player, rig.mode === 'tv' ? ulak : null);
    // отладочная камера: window.__game.freeCam = { pos: [x,y,z], look: [x,y,z] }
    const fc = window.__game?.freeCam;
    if (fc) {
      camera.position.set(...fc.pos);
      camera.lookAt(...fc.look);
    }

    hud.setTime(match.time);
    hud.setStamina(player.stamina, player.exhausted);
    hud.setCharge(player.charging ? player.charge : -1);
    hud.setPossession(possessionText());
    field.update(time);
  }
  hud.update(dt);
  postfx.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.resize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
init().catch((e) => {
  console.error(e);
  hud.startBtn.textContent = 'Ошибка загрузки';
});

window.__config = { FIELD, KAZAN, TEAMS };
