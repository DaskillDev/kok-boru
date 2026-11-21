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

// Полный экран + фиксация горизонтальной ориентации (работает не во всех браузерах)
export async function lockLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch {
    // iOS и часть браузеров не умеют — тогда работает поворот сцены
  }
}
