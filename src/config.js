// Общие игровые константы. Все размеры — в метрах, время — в секундах.

export const FIELD = {
  length: 120, // по оси X
  width: 70, // по оси Z
  margin: 4, // сколько можно заехать за линию
};

export const KAZAN = {
  x: 52, // центр казана по X (±)
  innerR: 2.1, // радиус «чаши» — сюда должен упасть улак
  outerR: 3.4, // внешний радиус насыпи
  height: 1.15,
};

export const MATCH_TIME = 180;
export const GRAVITY = 9.8;

export const TEAMS = [
  {
    id: 0,
    name: 'Көк',
    color: 0x2b6ad8,
    dark: 0x173a7a,
    trim: 0xf0c24a,
    css: '#3b7bea',
    attackDir: 1, // атакует казан на +X
  },
  {
    id: 1,
    name: 'Кызыл',
    color: 0xc8302c,
    dark: 0x6e1715,
    trim: 0xf3e3b0,
    css: '#e04640',
    attackDir: -1,
  },
];

// Казан, в который забивает команда
export function enemyKazanX(teamId) {
  return KAZAN.x * TEAMS[teamId].attackDir;
}
export function ownKazanX(teamId) {
  return -enemyKazanX(teamId);
}

export const HORSE = {
  runSpeed: 11.5,
  sprintSpeed: 17,
  reverseSpeed: 3,
  accel: 6.5,
  sprintAccel: 10,
  brake: 10,
  coast: 3.5,
  turnRateSlow: 2.3, // рад/с на месте
  lateralAccel: 15, // м/с² — предел бокового ускорения: чем быстрее, тем шире дуга
  turnDrag: 0.1, // потеря скорости в крутом повороте
  grip: 4.5, // насколько быстро скорость «догоняет» направление (инерция/занос)
  radius: 1.15, // радиус столкновений
  carrySpeedFactor: 0.8,
};

export const STAMINA = {
  drain: 0.32, // в секунду при рывке
  regen: 0.14,
  regenIdle: 0.22,
  exhaustedUntil: 0.3, // после полного истощения рывок недоступен до этого уровня
};

export const ULAK = {
  radius: 0.3,
  mass: 30, // кг — настоящая туша весит 30–35 кг
  pickupDist: 3.0,
  pickupMaxY: 2.3,
  stealDist: 2.7,
  minThrowH: 4,
  maxThrowH: 20,
  minThrowV: 3,
  maxThrowV: 9,
  chargeTime: 1.1,
  releaseHeight: 2.4,
  carrierInherit: 0.6,
};
