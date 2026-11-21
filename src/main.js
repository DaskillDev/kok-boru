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
import { createArena } from './scene/arena.js';
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
import { settings, setSetting, onSettings, isTouchDevice, levelOf } from './ui/settings.js';
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
// награда за матч: [опыт, монеты]; множитель — за сложность
const REWARD = { win: [100, 50], draw: [60, 25], lose: [40, 15], goal: [15, 10] };
const REWARD_MULT = { easy: 1, medium: 1.3, hard: 1.6 };

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
let arena = null;
let demo = false; // на фоне меню боты играют показательный матч
const _goalCam = new THREE.Vector3();
const _demoCam = new THREE.Vector3();
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

const inMatch = () => match && !demo && match.state !== 'idle' && match.state !== 'over';
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
  if (arena) arena.setVisible(q !== 'low' || !touch);
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
  if (key === 'profile' && riders[0]) riders[0].horse.setCoat(settings.profile.coat);
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
  arena = createArena(scene);
  tufts = createGrassTufts(scene, (x, z) => {
    if (Math.abs(x) < FIELD.length / 2 + 9 && Math.abs(z) < FIELD.width / 2 + 9) return true;
    return yurts.some((y) => Math.hypot(y.position.x - x, y.position.z - z) < 4.5);
  });

  const physics = new PhysicsWorld(kazanCollisionMesh());
  const slots = [0, 0];
  riders = ROSTER.map((r, id) => {
    const h = new Horseman({ id, ...r, name: r.name || playerName(), coat: id === 0 ? settings.profile.coat : r.coat });
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
        if (demo) return;
        hud.showBanner(String(n), 0.95);
        audio.beep(false);
      },
      onStart: () => {
        if (demo) return;
        hud.showBanner(t('go'), 0.9);
        audio.beep(true);
      },
      onOvertime: () => {
        hud.showBanner(`${t('overtime')}<small>${t('overtimeSub')}</small>`, 2.2, '#ffd34a');
        audio.whistle();
      },
      onGoal: (team, scorer) => {
        arena.cheer();
        if (demo) return;
        hud.setScore(match.score);
        const who = scorer ? (scorer === player ? t('youScored') : scorer.name) : '';
        hud.showBanner(`${t('goal')}<small>${team.name} · ${who}</small>`, 3, team.css);
        audio.goal();
        if (team.id === 0) matchGoals++;
      },
      onPickup: (r) => {
        if (!demo && near(r)) audio.pickup();
      },
      onThrow: (r) => {
        if (!demo && near(r)) audio.throwSound();
      },
      onPass: (r) => {
        if (!demo && near(r)) audio.throwSound();
      },
      onSteal: (thief, victim) => {
        if (demo) return;
        if (thief === player) hud.showBanner(`<small>${t('stolen')}</small>`, 1);
        else if (victim === player) hud.showBanner(`<small>${t('lostUlak')}</small>`, 1.2);
      },
      onImpact: (a, b, strength, x, z) => {
        dust.burst(x, z, Math.min(26, 6 + Math.round(strength * 2)));
        if (demo) return;
        const mine = a === player || b === player;
        if (mine) rig.shake(strength / 11);
        if (mine || Math.hypot(x - player.pos.x, z - player.pos.z) < 30) audio.impact(mine ? strength : strength * 0.5);
      },
      onTug: (holder, rival) => {
        if (demo) return;
        if (rival === player) hud.showBanner(`<small>${t('tugRival')}</small>`, 1.2);
        else if (holder === player) hud.showBanner(`<small>${t('tugHolder')}</small>`, 1.2);
      },
      onTugEnd: (holder, rival, stolen) => {
        if (demo) return;
        if (!stolen && holder === player) hud.showBanner(`<small>${t('held')}</small>`, 0.9);
        else if (!stolen && rival === player) hud.showBanner(`<small>${t('notStolen')}</small>`, 0.9);
      },
      onEnd: (score) => (demo ? startDemo() : finishMatch(score)),
    },
  });

  rig.orbitT = 0.6;
  rig.setMode(settings.camera);
  applyQuality();
  startDemo();

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

// Показательный матч ботов на фоне меню
function startDemo() {
  demo = true;
  paused = false;
  if (player) player.setHuman(false);
  else player = riders[0];
  for (const b of brains) {
    b.setSkill(0.6);
    b.rider.speedFactor = 1;
    b.role = 'field';
  }
  applyWeather(scene, renderer, env, 'clear');
  applyMap('jailoo');
  setupRoster(2);
  match.configure(match.riders, 240);
  match.goldenGoal = false;
  match.start();
  for (const r of riders) r.tag.visible = false;
  audio.ambience(false);
}

function startMatch(cfg) {
  audio.unlock();
  demo = false;
  player = null;
  lastCfg = { ...cfg };
  const diff = DIFFICULTY[cfg.difficulty] ?? DIFFICULTY.easy;
  for (const b of brains) {
    // напарники играют ровно, соперники — по выбранной сложности
    const foe = b.rider.teamId === 1;
    b.setSkill(foe ? diff.skill : 0.55);
    b.rider.speedFactor = foe ? diff.speed : 1;
    // в составах 3×3 и 4×4 последний всадник команды — «вратарь» у своего казана
    b.role = cfg.size >= 3 && b.rider.slot === cfg.size - 1 ? 'keeper' : 'field';
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
  match.goldenGoal = true;
  match.start();
  audio.ambience(true);
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
  menu.inMatch = false;
  hud.show(false);
  hud.showBanner('');
  touchControls.setVisible(false);
  startDemo();
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
  // награда: опыт и монеты
  const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
  const mult = REWARD_MULT[lastCfg?.difficulty] ?? 1;
  const xp = Math.round((REWARD[res][0] + matchGoals * REWARD.goal[0]) * mult);
  const coins = Math.round((REWARD[res][1] + matchGoals * REWARD.goal[1]) * mult);
  const pr = settings.profile;
  const levelBefore = levelOf(pr.xp);
  setSetting('profile', { ...pr, xp: pr.xp + xp, coins: pr.coins + coins });
  const levelUp = levelOf(pr.xp + xp) > levelBefore ? ` · ${t('level')} ${levelOf(pr.xp + xp)}!` : '';
  audio.whistle();
  audio.ambience(false);
  hud.showBanner('');
  touchControls.setVisible(false);
  menu.inMatch = false;
  menu.showResult(
    res,
    `${TEAMS[0].name} ${a} : ${b} ${TEAMS[1].name}`,
    `${t('reward')}: +${xp} ${t('xp')} · +${coins} ${t('coins')}${levelUp}`,
  );
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
    if (live && demo) match.update(dt);
    else if (live) {
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

    if (demo) {
      // камера плавно облетает место, где идёт игра
      _demoCam.lerp(ulak.pos, 1 - Math.exp(-dt * 0.8));
      _demoCam.y = 0;
      rig.orbit(dt, _demoCam, 26, 9);
    } else if (match.state === 'idle' || match.state === 'over') rig.orbit(dt, match.state === 'over' ? player.pos : ORIGIN);
    else if (match.state === 'goal' && ulak.inKazan && !paused) {
      // после гола — облёт казана
      rig.orbit(dt, _goalCam.set(ulak.inKazan * KAZAN.x, 0, 0), 12, 5.5);
    } else if (!paused) rig.follow(dt, player, rig.screenRelative ? ulak : null);
    // отладочная камера: window.__game.freeCam = { pos: [x,y,z], look: [x,y,z] }
    const fc = window.__game?.freeCam;
    if (fc) {
      camera.position.set(...fc.pos);
      camera.lookAt(...fc.look);
    }

    if (match.state !== 'idle' && !demo) {
      hud.setTime(match.overtime ? match.overtimeLeft : match.time);
      hud.setStamina(player.stamina, player.exhausted);
      hud.setCharge(player.charging ? player.charge : -1);
      hud.setPossession(possessionText());
      minimap.draw(match.riders, ulak, player);
      if (touch) touchControls.setActionLabel(player.hasUlak ? 'btnThrow' : ulak.holder ? 'btnSteal' : 'btnGrab');
    }
    field.update(time);
    arena.update(dt, time);
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
