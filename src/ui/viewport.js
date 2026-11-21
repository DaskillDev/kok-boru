// Горизонтальный режим на телефоне.
// Если телефон держат вертикально, вся игра (сцена, HUD, меню) поворачивается на 90°
// внутри контейнера #stage — играть можно сразу, не дожидаясь поворота экрана.
// Где браузер позволяет (Android, полноэкранный режим), дополнительно фиксируем ориентацию.

const stage = () => document.getElementById('stage');
let rotated = false;

export const isRotated = () => rotated;

// Размер «сцены» с учётом поворота
export function stageSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return rotated ? { w: h, h: w } : { w, h };
}

// Экранные координаты касания → координаты внутри повёрнутой сцены
export function toStage(clientX, clientY) {
  if (!rotated) return { x: clientX, y: clientY };
  // сцена повёрнута на −90° (как при повороте телефона против часовой) и сдвинута на высоту экрана:
  // x_экр = y_сц, y_экр = H − x_сц
  return { x: window.innerHeight - clientY, y: clientX };
}

// Прямоугольник элемента в координатах сцены (getBoundingClientRect для повёрнутых элементов не годится)
export function stageRect(el) {
  let x = 0;
  let y = 0;
  let n = el;
  const root = stage();
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
}

export function applyStage(touch) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  rotated = touch && h > w;
  const s = stageSize();
  const root = document.documentElement;
  root.classList.toggle('rotated', rotated);
  root.style.setProperty('--sw', `${s.w}px`);
  root.style.setProperty('--sh', `${s.h}px`);
  // компоновка интерфейса — по размеру сцены, а не окна (медиа-запросы смотрят на окно)
  root.classList.toggle('narrow', s.w < 620);
  root.classList.toggle('short', s.h < 460);
  return s;
}

// ---------- полный экран ----------
const root = () => document.documentElement;
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

// Умеет ли браузер полноэкранный режим (iPhone не умеет: там игру ставят на экран «Домой»)
export function canFullscreen() {
  const el = root();
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return false;
  return document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true;
}
// Игра запущена как приложение с экрана «Домой» — там и так весь экран
export function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}
export const isFullscreen = () => !!fsElement();
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Полный экран + фиксация горизонтальной ориентации (работает не во всех браузерах)
export async function lockLandscape() {
  try {
    if (!fsElement() && canFullscreen()) {
      const el = root();
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen();
    }
  } catch {
    // запрос отклонён (нет жеста пользователя) — попробуем при следующем касании
  }
  try {
    await screen.orientation?.lock?.('landscape');
  } catch {
    // iOS и часть браузеров не умеют — тогда работает поворот сцены
  }
}

export function exitFullscreen() {
  try {
    screen.orientation?.unlock?.();
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else document.webkitExitFullscreen?.();
  } catch {
    // нечего закрывать
  }
}

// iPhone: Safari не даёт сайтам настоящий полный экран, но сам прячет свои панели, когда страницу
// прокручивают вверх. Делаем страницу чуть выше экрана и просим игрока провести пальцем вверх.
// Возвращает функцию, которая показывает подсказку.
export function setupSwipeFullscreen() {
  const html = document.documentElement;
  const tip = document.getElementById('swipe-up');
  let h0 = 0;
  let timer = 0;
  const hide = () => {
    html.classList.remove('swipe-on');
    clearTimeout(timer);
  };
  const check = () => {
    if (!html.classList.contains('swipe-on')) return;
    if (window.scrollY > 30 || window.innerHeight > h0 + 24) hide();
  };
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  tip.addEventListener('click', hide);
  return () => {
    html.classList.add('ios-swipe', 'swipe-on');
    h0 = window.innerHeight;
    clearTimeout(timer);
    timer = setTimeout(hide, 9000);
  };
}

export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}

// ---------- касания по кнопкам ----------
// Браузер не присылает click, если в этот момент другой палец лежит на экране (например, на джойстике):
// пауза, ответы в дуэли и кнопки меню «не нажимались». Поэтому на сенсорном экране сами превращаем
// короткое касание кнопки в click, а «родной» click от того же касания гасим, чтобы не сработало дважды.
export function installTouchTaps(onAnyTap) {
  const downs = new Map();
  let synth = null;
  const buttonOf = (el) => el?.closest?.('button') ?? null;
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return;
      downs.set(e.pointerId, { b: buttonOf(e.target), x: e.clientX, y: e.clientY });
    },
    true,
  );
  window.addEventListener(
    'pointerup',
    (e) => {
      const d = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (!d) return;
      onAnyTap?.();
      if (!d.b || d.b.disabled || d.b.closest('#touch-buttons')) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 16) return;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (!over || !d.b.contains(over)) return;
      synth = { b: d.b, t: performance.now() };
      d.b.click();
    },
    true,
  );
  window.addEventListener('pointercancel', (e) => downs.delete(e.pointerId), true);
  window.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || !synth) return;
      if (performance.now() - synth.t < 700 && buttonOf(e.target) === synth.b) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
