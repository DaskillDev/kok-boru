import { USING_CDN } from './assetBase.js';
import * as THREE from 'three';
import { TEAMS, FIELD, KAZAN, ULAK, setTeamCountry } from './config.js';
import { COUNTRIES, countryByCode, countryName, flagCanvas } from './data/countries.js';
import { BREEDS, breedById, breedFactors, riderFactors } from './data/horses.js';
import { MathDuel } from './game/MathDuel.js';
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
import { createField, kazanCollisionMesh, createFieldGrass } from './scene/field.js';
import { Dust } from './scene/Dust.js';
import { Tracks } from './scene/Tracks.js';
import { initClouds, cloudUniforms, applyCloudShadowsTo } from './scene/clouds.js';
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
import {
  applyStage, stageSize, lockLandscape, exitFullscreen, canFullscreen, isFullscreen, isStandalone, isIOS,
  onFullscreenChange, installTouchTaps, setupSwipeFullscreen,
} from './ui/viewport.js';

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
  easy: { skill: 0.3, speed: 0.85 },
  medium: { skill: 0.6, speed: 0.94 },
  hard: { skill: 0.85, speed: 1.0 },
  expert: { skill: 1.0, speed: 1.04 },
};
const MAX_PER_TEAM = 10;
// cloud — сколько теней от облаков в эту погоду
const CLOUDS = { clear: 1, evening: 0.6, overcast: 0, fog: 0 };
const MAPS = {
  sand: { pitch: 0xf6d9a6, steppe: 0xeed3a0, sand: true }, // по правилам поле покрыто промытым песком
  jailoo: { pitch: 0xffffff, steppe: 0xffffff },
  autumn: { pitch: 0xf2d79a, steppe: 0xeec98a },
};
const QUALITY_ORDER = ['high', 'medium', 'low'];
// награда за матч: [опыт, монеты]; множитель — за сложность
const REWARD = { win: [100, 50], draw: [60, 25], lose: [40, 15], goal: [15, 10] };
const REWARD_MULT = { easy: 1, medium: 1.3, hard: 1.6, expert: 2 };

const touch = isTouchDevice();
applyStage(touch);
// браузер разрешает звук только после первого касания или клавиши — тогда и включаем музыку
// (и возобновляем после каждого сбоя: телефон глушит звук при сворачивании, звонке, уведомлении)
const wakeAudio = () => audio.unlock();
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, wakeAudio, { capture: true, passive: true });
}
document.body.classList.toggle('touch', touch);
// Полный экран на телефоне: включается сам при первом касании и при старте матча.
// Если игрок вышел из него сам — больше не навязываем, пока он не нажмёт кнопку ⛶ или не начнёт матч.
let wantFull = touch && !isStandalone();
let swipeShown = false;
// iPhone без полноэкранного режима: вместо него прячем панели Safari свайпом вверх
const swipeFull = touch && isIOS() && !canFullscreen() && !isStandalone() ? setupSwipeFullscreen() : null;
document.body.classList.toggle('no-fullscreen', isStandalone() || (!canFullscreen() && !swipeFull));
function syncFullButtons() {
  for (const b of document.querySelectorAll('#btn-full, #menu-full')) b.classList.toggle('on', isFullscreen());
}
function toggleFullscreen() {
  if (swipeFull) {
    swipeFull();
    return;
  }
  if (isFullscreen()) {
    wantFull = false;
    exitFullscreen();
  } else {
    wantFull = touch;
    lockLandscape();
  }
}
onFullscreenChange(() => {
  if (!isFullscreen()) wantFull = false;
  syncFullButtons();
  window.dispatchEvent(new Event('resize'));
});
if (touch) {
  installTouchTaps(() => {
    if (wantFull && canFullscreen() && !isFullscreen()) lockLandscape();
  });
}
applyI18n();

const hud = new Hud();
const audio = new GameAudio();
let releaseAudio = () => {};
audio.holdUntil = new Promise((r) => (releaseAudio = r));
const container = document.getElementById('app');
const renderer = createRenderer(container);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, stageSize().w / stageSize().h, 0.5, 2600);
camera.position.set(0, 6, 22);
const postfx = createPostFX(renderer, scene, camera, { mobile: touch });

const input = new Input();
const rig = new CameraRig(camera, renderer.domElement);
const mathDuel = new MathDuel();
const view3dEl = document.getElementById('view3d');
let viewTarget = null; // объект, который показывается из энциклопедии
const aim = new AimGuide(scene);
const dust = new Dust(scene);
const tracks = new Tracks(scene);
initClouds();
const minimap = new Minimap(document.getElementById('minimap'));
const ORIGIN = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projView = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), 9);
const ulakArrow = document.getElementById('ulak-arrow');
const _proj = new THREE.Vector3();
// кольцо под напарником, которому уйдёт пас
const passRing = new THREE.Mesh(
  new THREE.RingGeometry(1.05, 1.3, 40),
  new THREE.MeshBasicMaterial({ color: 0x8cf0ff, transparent: true, opacity: 0.7, depthWrite: false }),
);
passRing.rotation.x = -Math.PI / 2;
passRing.visible = false;
scene.add(passRing);
const NUMBERS = [7, 10, 5, 3, 9, 11, 4, 8, 6, 2];
const tips = new Set(); // советы новичку, показанные в этой сессии
let autoLevel = touch ? 'medium' : 'high'; // текущий уровень в режиме «Авто» (телефон начинает со среднего)
// Динамическая чёткость: если кадры идут медленно, картинка считается в чуть меньшем разрешении
// (тени, трава и эффекты остаются), а когда запас есть — возвращается к полному.
const RES_STEPS = [1, 0.85, 0.72, 0.6];
const res = { step: 0, t: 0, frames: 0, good: 0, lockUp: 0, before: 0, capped: false };
let slowT = 0;

// луч из точки экрана на плоскость поля — для режима управления «Касание»
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
function screenToField(cx, cy) {
  const S = stageSize();
  _ndc.set((cx / S.w) * 2 - 1, -(cy / S.h) * 2 + 1);
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
let fieldGrass = null;
let mapIsSand = false;
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
const matchStats = { passes: 0, steals: 0, duelsWon: 0 };
let physics = null;
let lastDuelAt = -99;
let lastThrow = null; // для «ахов» трибун, если бросок прошёл рядом с казаном

const menu = new Menu({
  onInteract: () => audio.unlock(),
  onPlay: (cfg) => startMatch(cfg),
  onResume: () => resume(),
  onRestart: () => startMatch(lastCfg ?? settings.quick),
  onExit: () => exitToMenu(),
  onView3D: (view) => showView3D(view),
});
document.getElementById('view3d-close').addEventListener('click', () => {
  viewTarget = null;
  view3dEl.classList.add('hidden');
  menu.show('enc');
});

const inMatch = () => match && !demo && match.state !== 'idle' && match.state !== 'over';
const near = (r) => r === player || Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 35;
const distTo = (r, p) => Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
const playerName = () => settings.nickname || t('you');

// ---------- настройки графики и вида ----------

function applyQuality() {
  let q = settings.quality;
  if (q === 'auto') q = autoLevel;
  postfx.setLevel(q);
  if (env) {
    env.sun.castShadow = q !== 'low';
    env.setShadowSize(q === 'high' && !touch ? 4096 : 2048);
  }
  if (tufts) tufts.visible = q !== 'low';
  if (fieldGrass) fieldGrass.mesh.visible = q === 'high' && !mapIsSand;
  if (arena) arena.setVisible(q !== 'low' || !touch);
  // предел чёткости по уровню; на телефоне экран плотный, поэтому даже «низкое» не мылит картинку
  const dpr = window.devicePixelRatio || 1;
  const maxPR = q === 'low' ? Math.min(dpr, touch ? 1.3 : 1) : Math.min(dpr, q === 'medium' ? (touch ? 2 : 1.5) : 2);
  renderer.setPixelRatio(Math.max(0.6, maxPR * RES_STEPS[res.step]));
  const S = stageSize();
  renderer.setSize(S.w, S.h);
  postfx.resize(S.w, S.h);
}

function applyNames() {
  for (const r of riders) {
    if (demo) {
      r.tag.visible = false;
      continue;
    }
    const first = rig.mode === 'first' && r === player;
    r.tag.visible = !first && (settings.names === 'all' || (settings.names === 'humans' && r.isHuman));
  }
}

// Песок для арены: светлый, с крупными следами и мелкой зернистостью
let sandTex = null;
function sandTexture() {
  if (sandTex) return sandTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9a774';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    // пятна утоптанного и взрыхлённого песка
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 6 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.5;
    g.addColorStop(0, light ? 'rgba(236,212,170,0.18)' : 'rgba(150,118,78,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
  sandTex = new THREE.CanvasTexture(c);
  sandTex.colorSpace = THREE.SRGBColorSpace;
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set((FIELD.length + 16) / 9, (FIELD.width + 16) / 9);
  sandTex.anisotropy = 8;
  return sandTex;
}

function applyMap(id) {
  const m = MAPS[id] ?? MAPS.jailoo;
  const pm = field.group.userData.pitchMaterial;
  pm.userData.grassMap ??= pm.map;
  pm.map = m.sand ? sandTexture() : pm.userData.grassMap;
  pm.needsUpdate = true;
  pm.color.set(m.sand ? 0xffffff : m.pitch);
  pm.normalScale.setScalar(m.sand ? 0.5 : 1.6);
  field.group.userData.overlay.visible = !m.sand; // на песке нет полос покоса
  mapIsSand = !!m.sand;
  tracks.setSurface(mapIsSand);
  tracks.clear();
  // песок вязнет: конь медленнее разгоняется и чуть ниже предельная скорость
  for (const r of riders) r.ground = m.sand ? { speed: 0.95, accel: 0.85 } : { speed: 1, accel: 1 };
  applyQuality();
  steppe.material.color.set(m.steppe);
}

// Команды-сборные: цвета из флага; если цвета соперника похожи на наши — берём запасную форму
function applyCountries(playerCode, opponentCode) {
  const L = settings.lang;
  const mine = countryByCode(playerCode);
  let foe = countryByCode(opponentCode);
  if (foe.code === mine.code) foe = COUNTRIES.find((c) => c.code !== mine.code);
  const c0 = new THREE.Color(mine.colors.color);
  const hueDist = (a, b) => {
    const ha = {};
    const hb = {};
    a.getHSL(ha);
    b.getHSL(hb);
    const d = Math.abs(ha.h - hb.h);
    return Math.min(d, 1 - d) + Math.abs(ha.l - hb.l) * 0.5;
  };
  const foeColors = hueDist(c0, new THREE.Color(foe.colors.color)) < 0.08 ? foe.alt : foe.colors;
  setTeamCountry(0, mine, mine.colors, countryName(mine, L));
  setTeamCountry(1, foe, foeColors, countryName(foe, L));
  document.querySelector('.team-0 .tname').textContent = TEAMS[0].name;
  document.querySelector('.team-1 .tname').textContent = TEAMS[1].name;
  // на телефоне вместо полного названия показывается короткий код страны (KGZ, KAZ…)
  document.querySelector('.team-0 .tname').dataset.code = TEAMS[0].code;
  document.querySelector('.team-1 .tname').dataset.code = TEAMS[1].code;
  document.querySelector('.team-0').style.borderLeftColor = TEAMS[0].css;
  document.querySelector('.team-1').style.borderRightColor = TEAMS[1].css;
  field.setSides();
  arena.setSides();
  // имена ботов — по стране команды
  const names = [mine.names.slice(), foe.names.slice()];
  for (const r of riders) {
    const c = r.teamId === 0 ? mine : foe;
    r.country = c;
    r.skills = riderFactors(c);
    if (r.id !== 0) r.setName(`${c.code} · ${names[r.teamId][r.slot % names[r.teamId].length]}`);
    r.applyTeam();
  }
  return foe.code;
}

// Порода: игроку — выбранная, ботам — случайная (у каждого своя)
function applyBreeds() {
  for (const r of riders) {
    const b = r.id === 0 ? breedById(settings.rider.breed) : BREEDS[(r.id * 7 + r.teamId * 3) % BREEDS.length];
    r.breed = breedFactors(b);
    if (r.id !== 0) r.horse.setCoat(b.coat);
    r.rider.setHat(r.id === 0 ? settings.rider.hat : r.country?.code === 'KGZ' ? 'kalpak' : r.slot % 2 ? 'helmet' : 'tebetey');
  }
}

// Создаёт недостающих всадников (составы до 10 на 10)
function ensureRiders(size) {
  const before = riders.length;
  for (const teamId of [0, 1]) {
    let have = riders.filter((r) => r.teamId === teamId).length;
    while (have < size) {
      const id = riders.length;
      const h = new Horseman({ id, teamId, name: '', coat: 'bay', number: NUMBERS[have % NUMBERS.length] });
      h.slot = have++;
      scene.add(h.group);
      physics.addRider(h);
      riders.push(h);
      brains.push(new BotBrain(h, 0.6));
    }
  }
  for (const r of riders.slice(before)) applyCloudShadowsTo(r.group);
}

// Энциклопедия: облёт камеры вокруг объекта
function showView3D(view) {
  menu.hide();
  view3dEl.classList.remove('hidden');
  const p = riders[0].pos;
  viewTarget = {
    ulak: { c: ulak.pos.clone(), r: 3.2, h: 1.6 },
    kazan: { c: new THREE.Vector3(KAZAN.x, 0, 0), r: 11, h: 5 },
    horse: { c: p.clone(), r: 5.5, h: 2.4 },
    rider: { c: p.clone().setY(0.6), r: 3.6, h: 2.6 },
    field: { c: new THREE.Vector3(), r: 130, h: 60 },
  }[view] ?? { c: new THREE.Vector3(), r: 60, h: 30 };
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
    if (riders[0]) riders[0].setName(`${settings.rider.country} · ${playerName()}`);
  }
  if (key === 'rider' && riders[0]) {
    riders[0].rider.setHat(settings.rider.hat);
    riders[0].setName(`${settings.rider.country} · ${playerName()}`);
  }
});

// ---------- запуск ----------

async function init() {
  // ход загрузки по самым тяжёлым файлам (вес — примерный размер в МБ)
  const weight = { horse: 6.1, sky: 1.4, rider: 0.2 };
  const done = { horse: 0, sky: 0, rider: 0 };
  const part = (k) => (e) => {
    done[k] = e.total ? e.loaded / e.total : Math.min(0.97, e.loaded / (weight[k] * 1048576));
    menu.setProgress((done.horse * weight.horse + done.sky * weight.sky + done.rider * weight.rider) / 7.7);
  };
  const [assets] = await Promise.all([loadAssets(part('sky')), loadHorseAsset(part('horse')), loadRiderAsset(part('rider')), initPhysics()]);
  // замер: сколько ушло на скачивание и разбор файлов, а сколько — на подготовку сцены
  const tLoaded = performance.now();
  // сколько миллисекунд занял каждый шаг подготовки сцены (window.__steps) — для поиска узких мест
  const steps = (window.__steps = {});
  let tStep = tLoaded;
  const step = (name) => {
    const now = performance.now();
    steps[name] = Math.round(now - tStep);
    tStep = now;
  };

  env = createEnvironment(scene, assets);
  steppe = createSteppe(scene, assets);
  step('env');
  createMountains(scene);
  step('mountains');
  const yurts = createYurts(scene);
  step('yurts');
  field = createField(scene, assets);
  step('field');
  arena = createArena(scene);
  step('arena');
  fieldGrass = createFieldGrass(scene);
  step('fieldGrass');
  tufts = createGrassTufts(scene, (x, z) => {
    if (Math.abs(x) < FIELD.length / 2 + 9 && Math.abs(z) < FIELD.width / 2 + 9) return true;
    return yurts.some((y) => Math.hypot(y.position.x - x, y.position.z - z) < 4.5);
  });
  step('tufts');
  postfx.excludeFromAO(fieldGrass.mesh, tufts, ...arena.crowd);

  physics = new PhysicsWorld(kazanCollisionMesh());
  const slots = [0, 0];
  riders = ROSTER.map((r, id) => {
    const slot = slots[r.teamId]++;
    const h = new Horseman({
      id,
      ...r,
      name: r.name || playerName(),
      coat: id === 0 ? settings.profile.coat : r.coat,
      number: NUMBERS[slot],
    });
    h.slot = slot;
    scene.add(h.group);
    physics.addRider(h);
    return h;
  });
  brains = riders.map((r) => new BotBrain(r, 0.6));
  ulak = new Ulak(scene, physics);
  step('riders');

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
        audio.whistle();
        // старт с линии — всадники кричат, кони ржут
        for (const r of match.riders) if (Math.random() < 0.5) setTimeout(() => audio.shout(r.pos.x, r.pos.z, 0.9), Math.random() * 500);
        audio.neigh(player.pos.x, player.pos.z, true);
        setTimeout(() => tip('tipStart', 3), 1100);
      },
      onSides: () => {
        field.setSides();
        arena.setSides();
      },
      onPeriodEnd: (n) => {
        if (demo) return;
        hud.showBanner(`${t('periodEnd')} ${n}<small>${t('swapSides')}</small>`, 3.2);
        audio.whistle(true);
        setTimeout(() => audio.goal(true), 400);
      },
      onWhistle: (reason) => {
        if (demo) return;
        hud.showBanner(`${t(reason === 'out' ? 'out' : 'loose')}<small>${t('duel')} — ${t('duelSub')}</small>`, 2.6);
        audio.whistle();
        lastThrow = null;
      },
      onFoul: (r, kind, dur) => {
        if (demo) return;
        const who = r === player ? t('youPenalty') : r.name;
        hud.showBanner(`<small>${t('foul')}: ${t('foulRam')} · ${who} · ${t('penaltyOf')} ${Math.round(dur)} с</small>`, 2.4, '#ffb04a');
        audio.foul(r.teamId === player.teamId);
      },
      onPenaltyEnd: (r) => {
        if (!demo && r === player) hud.showBanner(`<small>${t('you')} ${t('back2game')}</small>`, 1.2);
      },
      onOvertime: () => {
        if (demo) return;
        hud.showBanner(`${t('overtime')}<small>${t('overtimeSub')}</small>`, 2.2, '#ffd34a');
        audio.whistle(true);
      },
      onGoal: (team, scorer) => {
        arena.cheer();
        // конфетти в цвет забившей команды над казаном
        const c = new THREE.Color(team.color);
        dust.burst(ulak.inKazan * KAZAN.x, 0, 46, 5, [c.r * 1.6 + 0.2, c.g * 1.6 + 0.2, c.b * 1.6 + 0.2], 3.2);
        if (demo) return;
        hud.setScore(match.score);
        const who = scorer ? (scorer === player ? t('youScored') : scorer.name) : '';
        hud.showBanner(`${t('goal')}<small>${team.name} · ${who}</small>`, 3, team.css);
        audio.goal(team.id === player.teamId);
        if (scorer) audio.shout(scorer.pos.x, scorer.pos.z, 1.3);
        lastThrow = null;
        if (team.id === 0) matchGoals++;
      },
      onPickup: (r) => {
        if (!demo) audio.pickup(r.pos.x, r.pos.z);
        if (!demo && r === player) tip('tipCarry', 3.2);
      },
      onThrow: (r) => {
        if (demo) return;
        const power = THREE.MathUtils.clamp((ulak.vel.length() - 6) / 18, 0, 1);
        audio.throwSound(r.pos.x, r.pos.z, power);
        lastThrow = { t: 0, team: r.teamId };
      },
      onPass: (r) => {
        if (demo) return;
        audio.throwSound(r.pos.x, r.pos.z, 0.3);
        if (r === player) matchStats.passes++;
      },
      onSteal: (thief, victim) => {
        if (demo) return;
        audio.shout(thief.pos.x, thief.pos.z, 1.1);
        if (thief === player) matchStats.steals++;
        audio.steal(thief.teamId === player.teamId);
        if (thief === player) hud.showBanner(`<small>${t('stolen')}</small>`, 1);
        else if (victim === player) hud.showBanner(`<small>${t('lostUlak')}</small>`, 1.2);
      },
      onImpact: (a, b, strength, x, z) => {
        dust.burst(x, z, Math.min(26, 6 + Math.round(strength * 2)));
        if (demo) return;
        const mine = a === player || b === player;
        if (mine) rig.shake(strength / 11);
        audio.impact(strength, x, z);
      },
      onTug: (holder, rival) => {
        if (demo) return;
        audio.shout(rival.pos.x, rival.pos.z, 1);
        setTimeout(() => audio.shout(holder.pos.x, holder.pos.z, 0.9), 250);
        if (Math.random() < 0.5) audio.neigh(holder.pos.x, holder.pos.z);
        if (rival === player) hud.showBanner(`<small>${t('tugRival')}</small>`, 1.2);
        else if (holder === player) hud.showBanner(`<small>${t('tugHolder')}</small>`, 1.2);
      },
      // рывок в борьбе: пыль из-под копыт, встряска камеры, глухой удар
      onTugHeave: (a, b) => {
        dust.burst((a.pos.x + b.pos.x) / 2, (a.pos.z + b.pos.z) / 2, 5);
        if (demo) return;
        if (a === player || b === player) rig.shake(0.12);
        audio.impact(1.2, b.pos.x, b.pos.z);
      },
      onTugEnd: (holder, rival, stolen) => {
        dust.burst((holder.pos.x + rival.pos.x) / 2, (holder.pos.z + rival.pos.z) / 2, 12);
        if (demo) return;
        if (holder === player || rival === player) rig.shake(0.3);
        if (!stolen && holder === player) hud.showBanner(`<small>${t('held')}</small>`, 0.9);
        else if (!stolen && rival === player) hud.showBanner(`<small>${t('notStolen')}</small>`, 0.9);
      },
      // улак выбили ударом
      onFumble: (h, by) => {
        dust.burst(h.pos.x, h.pos.z, 14);
        if (demo) return;
        audio.neigh(h.pos.x, h.pos.z);
        if (h === player) hud.showBanner(`<small>${t('fumbleLost')}</small>`, 1.2);
        else if (by === player) hud.showBanner(`<small>${t('fumbleWon')}</small>`, 1.2);
      },
      // копыта отбросили лежащий улак
      onKick: (r, speed) => {
        dust.burst(ulak.pos.x, ulak.pos.z, 8);
        if (!demo) audio.impact(Math.min(4, speed * 0.2), ulak.pos.x, ulak.pos.z);
      },
      onEnd: (score) => (demo ? startDemo() : finishMatch(score)),
      onPassStat: () => {},
    },
  });

  match.mathDuel = (holder, rival) => {
    const cfg = lastCfg;
    if (demo || !cfg?.math || (holder !== player && rival !== player)) return false;
    if (time - lastDuelAt < 12) return false; // не чаще раза в 12 секунд — иначе обычная борьба
    lastDuelAt = time;
    const foe = holder === player ? rival : holder;
    mathDuel.start(
      { level: cfg.mathLevel, answerTime: cfg.mathTime, botLevel: cfg.difficulty, rivalName: foe.name },
      (playerWon) => {
        if (playerWon) matchStats.duelsWon++;
        hud.showBanner(`<small>${t(playerWon ? 'duelWon' : 'duelLost')}</small>`, 1.2, playerWon ? '#7dff6a' : '#ff8a6a');
        // игрок — соперник держащего: при победе забирает улак; держащий — при победе сохраняет
        match.resolveTug(rival === player ? playerWon : !playerWon);
      },
    );
    return true;
  };

  applyCloudShadowsTo(scene);
  rig.orbitT = 0.6;
  rig.setMode(settings.camera);
  applyQuality();
  applyCountries(settings.rider.country, settings.quick.opponent);
  applyBreeds();
  startDemo();

  input.onPause = () => togglePause();
  input.onCamera = () => {
    const m = rig.nextMode(inMatch() ? player : null);
    setSetting('camera', m.id);
    hud.showBanner(`<small>${t('camera')}: ${t(m.label)}</small>`, 1.4);
  };
  input.onGraphics = () => {
    Object.assign(res, { step: 0, capped: false, before: 0, good: 0 });
    let q = settings.quality === 'auto' ? (touch ? 'low' : 'high') : settings.quality;
    q = QUALITY_ORDER[(QUALITY_ORDER.indexOf(q) + 1) % QUALITY_ORDER.length];
    setSetting('quality', q);
    hud.showBanner(`<small>${t('gfx')}: ${t(q)}</small>`, 1.4);
  };
  input.onSwitch = () => manualSwitch();
  // «Авто» (R или кнопка на экране): конь игрока сам скачет за улаком, пока игрок не рулит сам
  input.onAuto = () => {
    input.auto = !input.auto;
    document.getElementById('tb-auto').classList.toggle('on', input.auto);
    if (match.state !== 'idle' && !demo) hud.showBanner(`<small>${t(input.auto ? 'autoOn' : 'autoOff')}</small>`, 1.4);
  };

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
  document.getElementById('btn-full').addEventListener('click', toggleFullscreen);
  document.getElementById('menu-full')?.addEventListener('click', toggleFullscreen);

  step('rest');
  menu.setReady(true);
  window.__timing = { files: Math.round(tLoaded) / 1000, scene: Math.round(performance.now() - tLoaded) / 1000 };
  menu.setTiming(window.__timing);
  releaseAudio();
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
    audio,
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

// Звуки поля, которые зависят от состояния, а не от событий
function updateSound(dt) {
  audio.setListener(camera);
  audio.updateRiders(match.riders);
  for (const r of match.riders) {
    // выкрик в начале рывка
    r._shoutT = Math.max(0, (r._shoutT || 0) - dt);
    if (r.sprinting && !r._wasSprint && r._shoutT === 0) {
      audio.shout(r.pos.x, r.pos.z, 1);
      r._shoutT = 2.5;
    }
    r._wasSprint = r.sprinting;
  }
  // трибуны тем громче, чем ближе улак к казану
  const dK = Math.min(Math.abs(ulak.pos.x - KAZAN.x), Math.abs(ulak.pos.x + KAZAN.x));
  const excitement = THREE.MathUtils.clamp(1 - (Math.hypot(dK, ulak.pos.z) - 6) / 34, 0, 1);
  audio.updateCrowd(match.state === 'playing' ? excitement : 0, dt);
  // бросок прошёл рядом с казаном, но гола нет — трибуны ахают
  if (lastThrow) {
    lastThrow.t += dt;
    if (ulak.holder || ulak.resting || lastThrow.t > 3) {
      const near = Math.hypot(dK, ulak.pos.z) < 8 && !ulak.inKazan;
      if (near) audio.nearMiss();
      lastThrow = null;
    }
  }
}

// Совет новичку: показывается один раз за сессию, пока сыграно мало матчей
function tip(key, duration) {
  if (settings.stats.matches >= 3 || tips.has(key) || demo || !inMatch()) return;
  tips.add(key);
  hud.showBanner(`<small>${t(key)}</small>`, duration);
}

// Стрелка на краю экрана показывает, где улак, если он не в кадре
function updateUlakArrow() {
  const show = match.state === 'playing' && !demo && !rig.screenRelative && ulak.holder !== player;
  if (show) {
    _proj.copy(ulak.pos).project(camera);
    const behind = _proj.z > 1;
    if (behind || Math.abs(_proj.x) > 0.95 || Math.abs(_proj.y) > 0.92) {
      let x = _proj.x;
      let y = _proj.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const a = Math.atan2(y, x);
      const { w, h } = stageSize();
      const px = w / 2 + Math.cos(a) * (w / 2 - 34);
      const py = h / 2 - Math.sin(a) * (h / 2 - 90);
      ulakArrow.style.transform = `translate(${px}px, ${py}px) rotate(${Math.PI / 2 - a}rad)`;
      ulakArrow.classList.add('on');
      return;
    }
  }
  ulakArrow.classList.remove('on');
}

// Шкала борьбы за улак над парой всадников: чей цвет занимает больше — тот и пересиливает
const tugBar = document.getElementById('tug-bar');
function updateTugBar() {
  const tug = match.tug;
  if (!tug || demo || match.state !== 'playing') {
    tugBar.classList.remove('on');
    return;
  }
  _proj.set((tug.holder.pos.x + tug.rival.pos.x) / 2, 3.6, (tug.holder.pos.z + tug.rival.pos.z) / 2).project(camera);
  if (_proj.z > 1 || Math.abs(_proj.x) > 1 || Math.abs(_proj.y) > 1) {
    tugBar.classList.remove('on');
    return;
  }
  const { w, h } = stageSize();
  tugBar.style.transform = `translate(${(_proj.x * 0.5 + 0.5) * w}px, ${(0.5 - _proj.y * 0.5) * h}px) translate(-50%, -50%)`;
  // слева — цвет хозяина улака, справа — соперника
  const k = THREE.MathUtils.clamp(0.5 - (tug.score / ULAK.tugWin) * 0.5, 0, 1);
  tugBar.style.setProperty('--k', k.toFixed(3));
  tugBar.style.setProperty('--ca', TEAMS[tug.holder.teamId].css);
  tugBar.style.setProperty('--cb', TEAMS[tug.rival.teamId].css);
  tugBar.classList.add('on');
}

// Режим «Авто»: если кадры идут медленно несколько секунд подряд — понижаем качество
function adaptQuality(rawDt) {
  if (document.hidden || rawDt > 0.25 || res.capped) return;
  res.t += rawDt;
  res.frames++;
  if (res.t < 1.5) return;
  const fps = res.frames / res.t;
  res.t = 0;
  res.frames = 0;
  res.lockUp = Math.max(0, res.lockUp - 1.5);
  // Телефон в режиме экономии сам держит 30 кадров: уменьшение чёткости ничего не даёт — тогда не трогаем
  if (res.before && Math.abs(fps - res.before) < 1.5 && fps > 27.5 && fps < 32.5) {
    res.capped = true;
    res.step = 0;
    applyQuality();
    return;
  }
  res.before = 0;
  if (fps < 48) {
    res.good = 0;
    // одна медленная секунда (загрузка, смена экрана) — ещё не повод; ждём две подряд
    res.slow = (res.slow || 0) + 1;
    if (res.slow < 2) return;
    res.slow = 0;
    if (res.step < RES_STEPS.length - 1) {
      res.before = fps;
      res.step++;
      res.lockUp = 20; // после снижения 20 секунд не пытаемся вернуть чёткость — без «качелей»
      applyQuality();
    } else if (settings.quality === 'auto' && autoLevel !== 'low' && fps < 34) {
      // и на минимальной чёткости тяжело — убираем эффекты уровнем ниже
      autoLevel = autoLevel === 'high' ? 'medium' : 'low';
      res.step = 1;
      res.lockUp = 30;
      applyQuality();
    }
  } else if (fps > 57 && res.step > 0 && res.lockUp <= 0) {
    res.slow = 0;
    res.good += 1.5;
    if (res.good >= 6) {
      res.good = 0;
      res.step--;
      applyQuality();
    }
  } else {
    res.good = 0;
    res.slow = 0;
  }
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
  ulakArrow.classList.remove('on');
  audio.ambience(false);
  audio.setMusicMode('menu');
}

function startMatch(cfg) {
  audio.unlock();
  if (touch && !isStandalone()) {
    wantFull = true;
    lockLandscape();
    // на iPhone один раз за запуск предлагаем убрать панели браузера
    if (swipeFull && !swipeShown) {
      swipeShown = true;
      swipeFull();
    }
  }
  demo = false;
  player = null;
  lastCfg = { ...cfg };
  ensureRiders(cfg.size);
  const foe = applyCountries(settings.rider.country, cfg.opponent);
  if (foe !== cfg.opponent) hud.showBanner(`<small>${t('noTeam')}</small>`, 2);
  applyBreeds();
  Object.assign(matchStats, { passes: 0, steals: 0, duelsWon: 0 });
  lastDuelAt = -99;
  const diff = DIFFICULTY[cfg.difficulty] ?? DIFFICULTY.easy;
  for (const b of brains) {
    // напарники играют ровно, соперники — по выбранной сложности
    const foe = b.rider.teamId === 1;
    b.setSkill(foe ? diff.skill : 0.55);
    b.rider.speedFactor = foe ? diff.speed : 1;
    // в составах 3×3 и 4×4 последний всадник команды — «вратарь» у своего казана
    b.role = cfg.size >= 3 && b.rider.slot === cfg.size - 1 ? 'keeper' : 'field';
    b.rider.flagSkill = foe ? diff.skill : 0.55;
  }
  setHuman(riders[0]);
  riders[0].setName(`${settings.rider.country} · ${playerName()}`);
  const weather = cfg.weather === 'random' ? WEATHER_IDS[Math.floor(Math.random() * WEATHER_IDS.length)] : cfg.weather;
  const mapIds = Object.keys(MAPS);
  applyWeather(scene, renderer, env, weather);
  cloudUniforms.uCloudAmount.value = CLOUDS[weather] ?? 1;
  applyMap(cfg.map === 'random' ? mapIds[Math.floor(Math.random() * mapIds.length)] : cfg.map);

  setupRoster(cfg.size);
  match.configure(match.riders, cfg.time);
  audio.setMusicMode('match');
  matchGoals = 0;
  match.goldenGoal = cfg.draw !== 'draw';
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
    passes: (st.passes || 0) + matchStats.passes,
    steals: (st.steals || 0) + matchStats.steals,
    duelsWon: (st.duelsWon || 0) + matchStats.duelsWon,
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
  audio.setMusicMode('menu');
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
  if (player.penalty > 0) return `${t('youPenalty')}: ${Math.ceil(player.penalty)} с`;
  if (match.duel) return `${t('duel')} — ${t('duelSub')}`;
  if (!h) return match.state === 'playing' ? t('freeUlak') : '';
  if (h === player) return t('youHave');
  return h.teamId === player.teamId ? `${t('mateHas')} (${h.name})` : `${t('foeHas')} (${h.name})`;
}

let last = performance.now();
let time = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(rawDt, 0.05);
  last = now;
  adaptQuality(rawDt);
  time += dt;

  if (match) {
    const live = match.state !== 'idle' && !paused;
    if (mathDuel.busy) {
      if (!paused) mathDuel.update(dt);
      updateSound(0);
    } else if (live && demo) match.update(dt);
    else if (live) {
      autoSwitch(dt);
      // цель режима «Авто»: свободный улак или тот, кто его везёт; со своим улаком игрок рулит сам
      input.autoTarget = ulak.holder === player ? null : ulak.holder ? ulak.holder.pos : ulak.pos;
      input.apply(player.controls, player, rig.screenRelative);
      match.update(dt);
      updateSound(dt);
    }
    if (!live || demo) audio.silenceRiders();
    if (!paused) {
      const loose = !ulak.holder && !ulak.inKazan && ulak.pos.y < 1.2;
      _frustum.setFromProjectionMatrix(_projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const r of match.riders) {
        const d = loose ? Math.hypot(ulak.pos.x - r.pos.x, ulak.pos.z - r.pos.z) : 99;
        r.reach = !r.hasUlak && d < 6 ? THREE.MathUtils.clamp(1 - (d - 1.5) / 4.5, 0, 1) : 0;
        // с какой стороны лежит улак: «влево» в системе всадника — это +X (cos h, −sin h)
        r.reachSide = (ulak.pos.x - r.pos.x) * Math.cos(r.heading) - (ulak.pos.z - r.pos.z) * Math.sin(r.heading) > 0 ? -1 : 1;
        // всадников за кадром не рисуем; запас 9 м — чтобы не пропала тень, падающая в кадр
        _cullSphere.center.set(r.pos.x, 1.3, r.pos.z);
        r.render(dt, r === player || _frustum.intersectsSphere(_cullSphere));
        if (live) {
          dust.emit(dt, r);
          tracks.track(r);
        }
      }
      tracks.update(dt);
      ulak.render(dt, time);
      dust.update(dt);
    }
    aim.update(player);
    updateUlakArrow();
    updateTugBar();
    // подсветка адресата паса
    const mate = !demo && match.state === 'playing' && player.hasUlak ? match._passTarget(player) : null;
    passRing.visible = !!mate;
    if (mate) passRing.position.set(mate.pos.x, 0.07, mate.pos.z);

    if (viewTarget) {
      rig.orbit(dt, viewTarget.c, viewTarget.r, viewTarget.h);
    } else if (demo) {
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
      hud.setTime(
        match.overtime ? match.overtimeLeft : match.time,
        match.overtime ? t('otShort') : `${match.period}/${match.periods}`,
      );
      hud.setStamina(player.stamina, player.exhausted);
      hud.setCharge(player.charging ? player.charge : -1);
      hud.setPossession(possessionText());
      minimap.draw(match.riders, ulak, player);
      if (touch) touchControls.setActionLabel(player.hasUlak ? 'btnThrow' : ulak.holder ? 'btnSteal' : 'btnGrab');
    }
    field.update(time);
    arena.update(dt, time);
    const secs = Math.max(0, Math.ceil(match.overtime ? match.overtimeLeft : match.time));
    arena.setScoreboard(
      TEAMS,
      match.score,
      `${match.overtime ? t('otShort') + ' ' : `${match.period}/${match.periods}  `}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      t('scoreboardEmblem'),
      (code) => flagCanvas(code, 192, 128),
    );
  }
  hud.update(dt);
  if (env) env.followShadow(rig.mode === 'tv' || rig.mode === 'top' ? rig.focus : player ? player.pos : ORIGIN);
  if (fieldGrass) fieldGrass.update(time, camera);
  cloudUniforms.uCloudTime.value = time;
  postfx.render(time);
}

window.addEventListener('resize', () => {
  const S = applyStage(touch);
  camera.aspect = S.w / S.h;
  camera.updateProjectionMatrix();
  renderer.setSize(S.w, S.h);
  postfx.resize(S.w, S.h);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && inMatch() && !paused) togglePause();
  // свернули — звук на паузу; вернулись — пробуем включить (если браузер не даст, включится при касании)
  if (document.hidden) audio.sleep();
  else audio.unlock();
});
window.addEventListener('pageshow', () => audio.unlock());
window.addEventListener('focus', () => audio.unlock());

requestAnimationFrame(frame);
init().catch((e) => {
  releaseAudio();
  console.error(e);
  // файлы шли через сеть доставки и что-то не загрузилось — один раз пробуем взять их с самого сайта
  if (USING_CDN && !/[?&]nocdn/.test(location.search)) {
    location.replace(location.pathname + '?nocdn');
    return;
  }
  menu.setReady(false);
});

window.__config = { FIELD, KAZAN, TEAMS, CAMERA_MODES };

// поворот телефона и смена размеров окна
window.addEventListener('orientationchange', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 250));
