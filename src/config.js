// Общие игровые константы. Все размеры — в метрах, время — в секундах.

export const FIELD = {
  // Правила Федерации кок-бору КР (2024): 210 м в длину, 70 м в ширину для огороженного поля
  length: 210, // по оси X
  width: 70, // по оси Z
  margin: 4, // сколько можно заехать за линию
};

export const KAZAN = {
  x: 95, // центр казана по X (±)
  innerR: 2.1, // радиус «чаши» — сюда должен упасть улак
  outerR: 3.4, // внешний радиус насыпи
  height: 1.15,
};

export const MATCH_TIME = 180;

// Регламент (в скобках — как в правилах; в игре время сжато пропорционально длине периода)
export const RULES = {
  periods: 3, // три периода (по 15 минут)
  duelRadius: 9, // круг «жекеме-жеке»
  duelCircles: [-56, 0, 56], // центры кругов по X
  duelTime: 15, // сек на схватку один на один (1 минута)
  looseTime: 18, // сек, за которые улак должны поднять с земли (2 минуты)
  penaltyShare: 2 / 15, // штраф — 2 минуты из 15-минутного периода
  overtimeShare: 10 / 45, // дополнительное время — 10 минут к 45
  ramSpeed: 10.5, // м/с — скорость сближения, с которой удар в бок считается тараном
};
export const GRAVITY = 9.8;

// Команды: страна, цвета и название назначаются перед матчем (setTeamCountry)
export const TEAMS = [
  {
    id: 0,
    code: 'KGZ',
    name: 'Көк',
    color: 0x2b6ad8,
    dark: 0x173a7a,
    trim: 0xf0c24a,
    css: '#3b7bea',
    attackDir: 1, // атакует казан на +X
  },
  {
    id: 1,
    code: 'KAZ',
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
  runSpeed: 15, // галоп, м/с
  sprintSpeed: 22, // карьер
  reverseSpeed: 2.5,
  accel: 9, // м/с² — конь быстро набирает ход
  sprintAccel: 13,
  brake: 14,
  coast: 3,
  turnRateSlow: 2.8, // рад/с — разворот на месте
  lateralAccel: 24, // м/с² — предел бокового ускорения: чем быстрее, тем шире дуга
  turnDrag: 0.05, // потеря скорости в крутом повороте
  grip: 9, // насколько быстро скорость «догоняет» направление (инерция/занос)
  carrySpeedFactor: 0.9,
  // тело для столкновений: капсула вдоль корпуса
  bodyHalfLength: 0.95,
  bodyRadius: 0.5,
  mass: 520, // конь + всадник, кг
  inertia: 1400, // момент инерции вокруг вертикали (с запасом: ноги сопротивляются развороту)
  restitution: 0.12,
  friction: 0.25,
};

export const STAMINA = {
  drain: 0.17, // в секунду при рывке (полного запаса хватает примерно на 6 секунд)
  carryDrain: 1.2, // с 30-килограммовой тушей рывок утомляет сильнее
  regen: 0.055, // восстановление на полном галопе — медленное
  regenTrot: 0.13, // на рыси и шагу конь отдыхает заметно быстрее
  regenIdle: 0.24, // стоя на месте
  trotSpeed: 7, // м/с — ниже этой скорости считается рысью
  exhaustedUntil: 0.3, // после полного истощения рывок недоступен до этого уровня
  throwCost: 0.04, // бросок стоит сил: чуть-чуть за сам бросок…
  throwCostCharge: 0.1, // …и больше за полный замах
  passCost: 0.04,
  tiredThrow: 0.78, // сила броска совсем уставшего всадника (доля от полной)
};

export const ULAK = {
  radius: 0.3,
  mass: 30, // кг — настоящая туша весит 30–35 кг
  pickupDist: 3.0, // с какого расстояния всадник дотягивается до улака на малом ходу
  pickupDistFast: 2.1, // …и на полном карьере: на скорости поднять тушу труднее
  pickupMaxY: 2.3,
  catchMaxSpeed: 13, // летящий улак быстрее этого (относительно всадника) поймать нельзя — только пас
  stealDist: 2.7,
  tugTime: 2.0, // сколько самое большее длится борьба за улак, с
  tugWin: 0.85, // перевес, при котором борьба решается досрочно
  tugHeave: 0.42, // пауза между рывками в борьбе, с
  // бросок: тушу в 30 кг далеко рукой не кинуть, зато она сохраняет скорость коня
  minThrowH: 3,
  maxThrowH: 13,
  minThrowV: 3,
  maxThrowV: 7.5,
  chargeTime: 1.0,
  releaseHeight: 2.4,
  carrierInherit: 0.85,
  carryAccel: 0.92, // с тушей конь разгоняется тяжелее
  fumbleHit: 5.4, // м/с — удар такой силы выбивает улак из рук (делится на «хват» всадника)
  kickSpeed: 5, // м/с — с какой скорости копыта отбрасывают лежащий улак
  groundSpinDamp: 3.2, // туша не катится как мяч: на земле быстро гасим вращение…
  groundSlideDamp: 1.3, // …и скольжение
};

// Назначает команде страну и цвета формы
export function setTeamCountry(teamId, country, colors, displayName) {
  const t = TEAMS[teamId];
  t.code = country.code;
  t.name = displayName;
  Object.assign(t, colors);
}
