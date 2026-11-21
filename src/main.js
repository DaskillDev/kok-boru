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
  applyWeather,
  WEATHER_IDS,
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
import { CameraRig, CAMERA_MODES } from './game/CameraRig.js';
import { Hud } from './game/Hud.js';
import { AimGuide } from './game/AimGuide.js';
import { Match } from './game/Match.js';
import { Minimap } from './game/Minimap.js';
import { TouchControls } from './game/TouchControls.js';
import { GameAudio } from './game/Audio.js';
import { BotBrain } from './ai/BotBrain.js';
import { Menu } from './ui/Menu.js';
import { settings, setSetting, onSettings, isTouchDevice } from './ui/settings.js';
import { t, applyI18n } from './ui/i18n.js';

// До 4 всадников в команде; в матче участвуют первые N из каждой
const ROSTER = [
  { teamId: 0, name: '', coat: 'bay' },
  { teamId: 0, name: 'Азамат', coat: 'grey' },
  { teamId: 0, name: 'Данияр', coat: 'chestnut' },
  { teamId: 0, name: 'Мирлан', coat: 'dun' },
  { teamId: 1, name: 'Темир', coat: 'black' },
  { teamId: 1, name: 'Руслан', coat: 'palomino' },
  { teamId: 1, name: 'Кубат', coat: 'bay' },
  { teamId: 1, name: 'Адилет', coat: 'grey' },
];
const DIFFICULTY = {
  easy: { skill: 0.3, speed: 0.9 },
  medium: { skill: 0.6, speed: 0.97 },
  hard: { skill: 0.9, speed: 1.03 },
};
const MAPS = {
  jailoo: { pitch: 0xffffff, steppe: 0xffffff },
  autumn: { pitch: 0xf2d79a, steppe: 0xeec98a },
};
const QUALITY_ORDER = ['high', 'medium', 'low'];

const touch = isTouchDevice();
document.body.classList.toggle('touch', touch);
applyI18n();

const hud = new Hud();
const audio = new GameAudio();
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
const minimap = new Minimap(document.getElementById('minimap'));
const ORIGIN = new THREE.Vector3();

// луч из точки экрана на плоскость поля — для режима управления «Касание»
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
function screenToField(cx, cy) {
  _ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (!raycaster.ray.intersectPlane(ground, _hit)) return null;
  return {
    x: THREE.MathUtils.clamp(_hit.x, -FIELD.length / 2 - 3, FIELD.length / 2 + 3),
    z: THREE.MathUtils.clamp(_hit.z, -FIELD.width / 2 - 3, FIELD.width / 2 + 3),
  };
}
const touchControls = new TouchControls(input, screenToField);

let env = null;
let field = null;
let steppe = null;
let tufts = null;
let match = null;
let player = null;
let riders = [];
let brains = [];
let ulak = null;
let paused = false;
let lastCfg = null;
let switchTimer = 0;
let matchGoals = 0;

const menu = new Menu({
  onInteract: () => audio.unlock(),
  onPlay: (cfg) => startMatch(cfg),
  onResume: () => resume(),
  onRestart: () => startMatch(lastCfg ?? settings.quick),
  onExit: () => exitToMenu(),
});

const inMatch = () => match && match.state !== 'idle' && match.state !== 'over';
const near = (r) => r === player || Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 35;
const distTo = (r, p) => Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
const playerName = () => settings.nickname || t('you');

// ---------- настройки графики и вида ----------

function applyQuality() {
  let q = settings.quality;
  if (q === 'auto') q = touch ? 'low' : 'high';
  postfx.enabled = q === 'high';
  if (env) env.sun.castShadow = q !== 'low';
  if (tufts) tufts.visible = q !== 'low';
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, q === 'medium' ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.resize(window.innerWidth, window.innerHeight);
}

function applyNames() {
  for (const r of riders) {
    const first = rig.mode === 'first' && r === player;
    r.tag.visible = !first && (settings.names === 'all' || (settings.names === 'humans' && r.isHuman));
  }
}

function applyMap(id) {
  const m = MAPS[id] ?? MAPS.jailoo;
  field.group.userData.pitchMaterial.color.set(m.pitch);
  steppe.material.color.set(m.steppe);
}

onSettings((key) => {
  if (key === 'quality') applyQuality();
  if (key === 'names') applyNames();
  if (key === 'camera') {
    rig.setMode(settings.camera, inMatch() ? player : null);
    applyNames();
  }
  if (key === 'move' || key === 'btnSize' || key === 'leftHanded') touchControls.applySettings();
  if (key === 'lang' || key === 'nickname') {
    applyI18n();
    touchControls._label = '';
    if (riders[0]) riders[0].setName(playerName());
  }
});

// ---------- запуск ----------

async function init() {
  const [assets] = await Promise.all([loadAssets(), loadHorseAsset(), loadRiderAsset(), initPhysics()]);

  env = createEnvironment(scene, assets);
  steppe = createSteppe(scene, assets);
  createMountains(scene);
  const yurts = createYurts(scene);
  field = createField(scene, assets);
  tufts = createGrassTufts(scene, (x, z) => {
    if (Math.abs(x) < FIELD.length / 2 + 9 && Math.abs(z) < FIELD.width / 2 + 9) return true;
    return yurts.some((y) => Math.hypot(y.position.x - x, y.position.z - z) < 4.5);
  });

  const physics = new PhysicsWorld(kazanCollisionMesh());
  const slots = [0, 0];
  riders = ROSTER.map((r, id) => {
    const h = new Horseman({ id, ...r, name: r.name || playerName() });
    h.slot = slots[r.teamId]++;
    scene.add(h.group);
    physics.addRider(h);
    return h;
  });
  brains = riders.map((r) => new BotBrain(r, 0.6));
  ulak = new Ulak(scene, physics);

  match = new Match({
    riders,
    ulak,
    brains,
    physics,
    events: {
      onCountdown: (n) => {
        hud.showBanner(String(n), 0.95);
        audio.beep(false);
      },
      onStart: () => {
        hud.showBanner(t('go'), 0.9);
        audio.beep(true);
      },
      onGoal: (team, scorer) => {
        hud.setScore(match.score);
        const who = scorer ? (scorer === player ? t('youScored') : scorer.name) : '';
        hud.showBanner(`${t('goal')}<small>${team.name} · ${who}</small>`, 3, team.css);
        audio.goal();
        if (team.id === 0) matchGoals++;
      },
      onPickup: (r) => {
        if (near(r)) audio.pickup();
      },
      onThrow: (r) => {
        if (near(r)) audio.throwSound();
      },
      onPass: (r) => {
        if (near(r)) audio.throwSound();
      },
      onSteal: (thief, victim) => {
        if (thief === player) hud.showBanner(`<small>${t('stolen')}</small>`, 1);
        else if (victim === player) hud.showBanner(`<small>${t('lostUlak')}</small>`, 1.2);
      },
      onImpact: (a, b, strength, x, z) => {
        dust.burst(x, z, Math.min(26, 6 + Math.round(strength * 2)));
        const mine = a === player || b === player;
        if (mine) rig.shake(strength / 11);
        if (mine || Math.hypot(x - player.pos.x, z - player.pos.z) < 30) audio.impact(mine ? strength : strength * 0.5);
      },
      onTug: (holder, rival) => {
        if (rival === player) hud.showBanner(`<small>${t('tugRival')}</small>`, 1.2);
        else if (holder === player) hud.showBanner(`<small>${t('tugHolder')}</small>`, 1.2);
      },
      onTugEnd: (holder, rival, stolen) => {
        if (!stolen && holder === player) hud.showBanner(`<small>${t('held')}</small>`, 0.9);
        else if (!stolen && rival === player) hud.showBanner(`<small>${t('notStolen')}</small>`, 0.9);
      },
      onEnd: (score) => finishMatch(score),
    },
  });

  setHuman(riders[0]);
  setupRoster(settings.quick.size);
  match.kickoff();
  match.state = 'idle';
  ulak.reset(0, 0, 0.5);
  rig.orbitT = 0.6;
  rig.setMode(settings.camera);
  applyQuality();
  applyNames();
  applyWeather(scene, renderer, env, 'clear');

  input.onPause = () => togglePause();
  input.onCamera = () => {
    const m = rig.nextMode(inMatch() ? player : null);
    setSetting('camera', m.id);
    hud.showBanner(`<small>${t('camera')}: ${t(m.label)}</small>`, 1.4);
  };
  input.onGraphics = () => {
    let q = settings.quality === 'auto' ? (touch ? 'low' : 'high') : settings.quality;
    q = QUALITY_ORDER[(QUALITY_ORDER.indexOf(q) + 1) % QUALITY_ORDER.length];
    setSetting('quality', q);
    hud.showBanner(`<small>${t('gfx')}: ${t(q)}</small>`, 1.4);
  };
  input.onSwitch = () => manualSwitch();

  document.getElementById('btn-pause').addEventListener('click', () => togglePause());
  document.getElementById('btn-help').addEventListener('click', () => {
    if (!inMatch()) return;
    paused = true;
    menu.inMatch = true;
    menu.show('help');
  });
  document.getElementById('btn-mute').addEventListener('click', () => {
    audio.unlock();
    hud.setMuted(audio.toggleMute());
  });
  document.getElementById('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  menu.setReady(true);
  // для отладки и будущих тестов
  window.__game = {
    match,
    riders,
    ulak,
    get player() {
      return player;
    },
    scene,
    camera,
    renderer,
    hud,
    input,
    rig,
    postfx,
    physics,
    menu,
    startMatch,
  };
}

// Включает первых size всадников каждой команды, остальных убирает с поля
function setupRoster(size) {
  const active = [];
  for (const r of riders) {
    const on = r.slot < size;
    r.group.visible = on;
    if (on) active.push(r);
    else {
      r.place(400 + r.id * 6, 400, 0);
      r.frozen = true;
    }
  }
  match.configure(active, match.duration);
  return active;
}

function setHuman(r) {
  if (player === r) return;
  if (player) player.setHuman(false);
  r.setHuman(true);
  r.mustRelease = input.actionHeld;
  r.charging = false;
  r.charge = 0;
  player = r;
  switchTimer = 0;
  applyNames();
}

function startMatch(cfg) {
  audio.unlock();
  lastCfg = { ...cfg };
  const diff = DIFFICULTY[cfg.difficulty] ?? DIFFICULTY.easy;
  for (const b of brains) {
    // напарники играют ровно, соперники — по выбранной сложности
    const foe = b.rider.teamId === 1;
    b.setSkill(foe ? diff.skill : 0.55);
    b.rider.speedFactor = foe ? diff.speed : 1;
  }
  setHuman(riders[0]);
  riders[0].setName(playerName());
  const weather = cfg.weather === 'random' ? WEATHER_IDS[Math.floor(Math.random() * WEATHER_IDS.length)] : cfg.weather;
  const mapIds = Object.keys(MAPS);
  applyWeather(scene, renderer, env, weather);
  applyMap(cfg.map === 'random' ? mapIds[Math.floor(Math.random() * mapIds.length)] : cfg.map);

  setupRoster(cfg.size);
  match.configure(match.riders, cfg.time);
  matchGoals = 0;
  match.start();
  menu.inMatch = true;
  menu.hide();
  hud.show(true);
  hud.setScore([0, 0]);
  touchControls.setVisible(touch);
  paused = false;
  rig.setMode(settings.camera);
  rig.snap(player);
  applyNames();
}

function togglePause() {
  if (!inMatch()) return;
  if (paused) resume();
  else {
    paused = true;
    menu.inMatch = true;
    menu.show('pause');
    touchControls.release();
  }
}

function resume() {
  if (!inMatch()) return;
  paused = false;
  menu.hide();
}

function exitToMenu() {
  paused = false;
  menu.inMatch = false;
  hud.show(false);
  hud.showBanner('');
  touchControls.setVisible(false);
  setHuman(riders[0]);
  setupRoster(settings.quick.size);
  match.kickoff();
  match.state = 'idle';
  ulak.reset(0, 0, 0.5);
  applyWeather(scene, renderer, env, 'clear');
  applyMap('jailoo');
  menu.show('main');
}

function finishMatch(score) {
  const [a, b] = score;
  const st = settings.stats;
  setSetting('stats', {
    matches: st.matches + 1,
    wins: st.wins + (a > b ? 1 : 0),
    draws: st.draws + (a === b ? 1 : 0),
    goals: st.goals + matchGoals,
  });
  audio.whistle();
  hud.showBanner('');
  touchControls.setVisible(false);
  menu.inMatch = false;
  menu.showResult(a > b ? 'win' : a < b ? 'lose' : 'draw', `${TEAMS[0].name} ${a} : ${b} ${TEAMS[1].name}`);
}

// ---------- смена всадника ----------

function autoSwitch(dt) {
  if (!settings.autoSwitch || match.state !== 'playing' || player.inTug || player.charging) return;
  const mates = match.riders.filter((r) => r.teamId === player.teamId);
  if (mates.length < 2) return;
  const h = ulak.holder;
  let want = null;
  if (h && h.teamId === player.teamId) want = h;
  else {
    const target = h ? h.pos : ulak.pos;
    const closest = mates.reduce((a, b) => (distTo(a, target) < distTo(b, target) ? a : b));
    if (distTo(closest, target) + 4 < distTo(player, target)) want = closest;
  }
  if (!want || want === player) {
    switchTimer = 0;
    return;
  }
  switchTimer += dt;
  if (switchTimer > (want === h ? 0.15 : 0.5)) setHuman(want);
}

function manualSwitch() {
  if (match?.state !== 'playing') return;
  const mates = match.riders.filter((r) => r.teamId === player.teamId && r !== player);
  if (!mates.length) return;
  const target = ulak.holder ? ulak.holder.pos : ulak.pos;
  setHuman(mates.reduce((a, b) => (distTo(a, target) < distTo(b, target) ? a : b)));
}

// ---------- кадр ----------

function possessionText() {
  const h = ulak.holder;
  if (!h) return match.state === 'playing' ? t('freeUlak') : '';
  if (h === player) return t('youHave');
  return h.teamId === player.teamId ? `${t('mateHas')} (${h.name})` : `${t('foeHas')} (${h.name})`;
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
      autoSwitch(dt);
      input.apply(player.controls, player, rig.screenRelative);
      match.update(dt);
      audio.hooves(dt, Math.abs(player.speed));
    }
    if (!paused) {
      for (const r of match.riders) {
        r.render(dt);
        if (live) dust.emit(dt, r);
      }
      ulak.render(dt, time);
      dust.update(dt);
    }
    aim.update(player);

    if (match.state === 'idle' || match.state === 'over') rig.orbit(dt, match.state === 'over' ? player.pos : ORIGIN);
    else if (!paused) rig.follow(dt, player, rig.screenRelative ? ulak : null);
    // отладочная камера: window.__game.freeCam = { pos: [x,y,z], look: [x,y,z] }
    const fc = window.__game?.freeCam;
    if (fc) {
      camera.position.set(...fc.pos);
      camera.lookAt(...fc.look);
    }

    if (match.state !== 'idle') {
      hud.setTime(match.time);
      hud.setStamina(player.stamina, player.exhausted);
      hud.setCharge(player.charging ? player.charge : -1);
      hud.setPossession(possessionText());
      minimap.draw(match.riders, ulak, player);
      if (touch) touchControls.setActionLabel(player.hasUlak ? 'btnThrow' : ulak.holder ? 'btnSteal' : 'btnGrab');
    }
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden && inMatch() && !paused) togglePause();
});

requestAnimationFrame(frame);
init().catch((e) => {
  console.error(e);
  menu.setReady(false);
});

window.__config = { FIELD, KAZAN, TEAMS, CAMERA_MODES };
