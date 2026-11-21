// Породы коней (характеристики — игровые, 0..100).
// В игре превращаются в множители: скорость, разгон, поворот, расход сил, масса при столкновениях.

export const BREEDS = [
  {
    id: 'kyrgyz',
    name: { ru: 'Кыргыз ат', kg: 'Кыргыз аты', en: 'Kyrgyz horse' },
    note: { ru: 'Выносливый горный конь, ровный во всём', kg: 'Чыдамкай тоо аты', en: 'Hardy mountain horse, well-rounded' },
    stats: { speed: 50, accel: 55, turn: 60, stamina: 75, weight: 45 },
    coat: 'bay',
  },
  {
    id: 'akhalteke',
    name: { ru: 'Ахалтекинец', kg: 'Ахалтеке', en: 'Akhal-Teke' },
    note: { ru: 'Самый быстрый, но устаёт и плохо поворачивает', kg: 'Эң ылдам, бирок тез чарчайт', en: 'Fastest, but tires fast and turns wide' },
    stats: { speed: 90, accel: 80, turn: 30, stamina: 35, weight: 30 },
    coat: 'palomino',
  },
  {
    id: 'novokirgiz',
    name: { ru: 'Новокиргизская', kg: 'Жаңы кыргыз тукуму', en: 'Novokirgiz' },
    note: { ru: 'Крупный и сильный — выигрывает толкания', kg: 'Ири жана күчтүү', en: 'Big and strong — wins the shoving' },
    stats: { speed: 55, accel: 40, turn: 40, stamina: 60, weight: 85 },
    coat: 'chestnut',
  },
  {
    id: 'karabair',
    name: { ru: 'Карабаир', kg: 'Карабайыр', en: 'Karabair' },
    note: { ru: 'Вёрткий, быстро разгоняется — для финтов', kg: 'Шамдагай, тез ылдамдайт', en: 'Nimble and quick off the mark' },
    stats: { speed: 60, accel: 85, turn: 90, stamina: 45, weight: 40 },
    coat: 'grey',
  },
  {
    id: 'adai',
    name: { ru: 'Адайская', kg: 'Адай', en: 'Adai' },
    note: { ru: 'Степной марафонец — почти не устаёт', kg: 'Талаа марафончусу', en: 'Steppe marathoner — barely tires' },
    stats: { speed: 45, accel: 45, turn: 55, stamina: 95, weight: 50 },
    coat: 'dun',
  },
  {
    id: 'lokai',
    name: { ru: 'Локайская', kg: 'Локай', en: 'Lokai' },
    note: { ru: 'Тяжёлый и устойчивый, держит удар', kg: 'Оор жана туруктуу', en: 'Heavy and steady, takes a hit' },
    stats: { speed: 48, accel: 50, turn: 50, stamina: 65, weight: 75 },
    coat: 'black',
  },
];

export const breedById = (id) => BREEDS.find((b) => b.id === id) ?? BREEDS[0];

// Множители к базовым параметрам коня
export function breedFactors(b) {
  const s = b.stats;
  const k = (v, range) => 1 + ((v - 50) / 50) * range;
  return {
    speed: k(s.speed, 0.1),
    accel: k(s.accel, 0.22),
    turn: k(s.turn, 0.2),
    stamina: k(s.stamina, 0.35),
    mass: k(s.weight, 0.25),
  };
}

// Всадник: множители от характеристик страны
export function riderFactors(c) {
  const s = c.stats;
  const k = (v, range) => 1 + ((v - 50) / 50) * range;
  return {
    power: k(s.power, 0.35), // борьба за улак
    accuracy: k(s.accuracy, 0.6), // меньше разброс броска
    grip: k(s.grip, 0.35), // устойчивость к отбору
  };
}
