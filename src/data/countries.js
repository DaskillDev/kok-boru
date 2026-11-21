// Страны-участницы. Характеристики всадников — свои, игровые (0..100):
//  сила — борьба за улак и толчки; точность — меткость броска; хват — как крепко держит улак.

export const COUNTRIES = [
  {
    code: 'KGZ',
    name: { ru: 'Кыргызстан', kg: 'Кыргызстан', en: 'Kyrgyzstan' },
    stats: { power: 55, accuracy: 55, grip: 70 },
    colors: { color: 0xd12a2a, dark: 0x6e1414, trim: 0xf6c63a, css: '#e3412f' },
    alt: { color: 0xf0b62a, dark: 0x7a5410, trim: 0xd12a2a, css: '#f2b72f' },
    names: ['Азамат', 'Данияр', 'Мирлан', 'Нурбек', 'Бакыт', 'Эрлан', 'Кубат', 'Адилет', 'Талант', 'Улан', 'Темир', 'Жоомарт'],
  },
  {
    code: 'KAZ',
    name: { ru: 'Казахстан', kg: 'Казакстан', en: 'Kazakhstan' },
    stats: { power: 72, accuracy: 42, grip: 55 },
    colors: { color: 0x19a3c9, dark: 0x0b4f63, trim: 0xf3c52f, css: '#27b0d6' },
    alt: { color: 0xf3c52f, dark: 0x7a6010, trim: 0x19a3c9, css: '#f3c52f' },
    names: ['Ерлан', 'Нурлан', 'Арман', 'Дастан', 'Ербол', 'Айдос', 'Самат', 'Жандос', 'Бауыржан', 'Олжас', 'Ержан', 'Мадияр'],
  },
  {
    code: 'UZB',
    name: { ru: 'Узбекистан', kg: 'Өзбекстан', en: 'Uzbekistan' },
    stats: { power: 45, accuracy: 75, grip: 50 },
    colors: { color: 0x1a8f4a, dark: 0x0b4423, trim: 0xf2f2f2, css: '#22a356' },
    alt: { color: 0x1d6fc4, dark: 0x0d3463, trim: 0xf2f2f2, css: '#2a7fd6' },
    names: ['Алишер', 'Отабек', 'Сардор', 'Бекзод', 'Жасур', 'Шерзод', 'Азиз', 'Дилшод', 'Ильхом', 'Фаррух', 'Рустам', 'Улугбек'],
  },
  {
    code: 'TJK',
    name: { ru: 'Таджикистан', kg: 'Тажикстан', en: 'Tajikistan' },
    stats: { power: 60, accuracy: 50, grip: 62 },
    colors: { color: 0x1f8a3a, dark: 0x0e4520, trim: 0xd9302a, css: '#2a9c47' },
    alt: { color: 0xd9302a, dark: 0x6b1512, trim: 0x1f8a3a, css: '#e04436' },
    names: ['Фирдавс', 'Далер', 'Сухроб', 'Фаридун', 'Комрон', 'Бахтиёр', 'Парвиз', 'Шохрух', 'Джамшед', 'Манучехр', 'Рустам', 'Хуршед'],
  },
  {
    code: 'TKM',
    name: { ru: 'Туркменистан', kg: 'Түркмөнстан', en: 'Turkmenistan' },
    stats: { power: 58, accuracy: 48, grip: 60 },
    colors: { color: 0x13874f, dark: 0x084225, trim: 0xb51f2a, css: '#1c9a5c' },
    alt: { color: 0xb51f2a, dark: 0x5a0f14, trim: 0x13874f, css: '#c8323c' },
    names: ['Мерген', 'Сердар', 'Довлет', 'Ата', 'Байрам', 'Мурат', 'Нурмухаммед', 'Аман', 'Ровшен', 'Батыр', 'Мекан', 'Агаджан'],
  },
  {
    code: 'RUS',
    name: { ru: 'Россия', kg: 'Россия', en: 'Russia' },
    stats: { power: 62, accuracy: 52, grip: 45 },
    colors: { color: 0x2b55c4, dark: 0x13285e, trim: 0xe63b3b, css: '#3b66d6' },
    alt: { color: 0xe63b3b, dark: 0x6e1616, trim: 0xf2f2f2, css: '#e84a4a' },
    names: ['Алексей', 'Аюр', 'Баир', 'Сергей', 'Тимур', 'Артём', 'Аржаан', 'Дмитрий', 'Максим', 'Чингис', 'Иван', 'Олег'],
  },
  {
    code: 'TUR',
    name: { ru: 'Турция', kg: 'Түркия', en: 'Türkiye' },
    stats: { power: 50, accuracy: 62, grip: 52 },
    colors: { color: 0xd8232f, dark: 0x6a0f15, trim: 0xf4f4f4, css: '#e3333e' },
    alt: { color: 0xf4f4f4, dark: 0x9a9a9a, trim: 0xd8232f, css: '#f0f0f0' },
    names: ['Emre', 'Burak', 'Mehmet', 'Kerem', 'Ozan', 'Murat', 'Cem', 'Yusuf', 'Serkan', 'Hakan', 'Onur', 'Arda'],
  },
  {
    code: 'MNG',
    name: { ru: 'Монголия', kg: 'Монголия', en: 'Mongolia' },
    stats: { power: 66, accuracy: 44, grip: 64 },
    colors: { color: 0xc4272f, dark: 0x5f1216, trim: 0x2a5bb8, css: '#d23a40' },
    alt: { color: 0x2a5bb8, dark: 0x13295a, trim: 0xf2c93a, css: '#3a6bc8' },
    names: ['Батбаяр', 'Ганбат', 'Тэмүүжин', 'Бат-Эрдэнэ', 'Энхбат', 'Сүхбаатар', 'Мөнх', 'Болд', 'Төмөр', 'Дорж', 'Гантулга', 'Очир'],
  },
];

export const countryByCode = (code) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
export const countryName = (c, lang) => c.name[lang] ?? c.name.ru;

// Флаг рисуется кодом (упрощённо) на canvas
export function drawFlag(ctx, code, w, h) {
  const band = (cols, vertical = false) => {
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      if (vertical) ctx.fillRect((i * w) / cols.length, 0, w / cols.length + 1, h);
      else ctx.fillRect(0, (i * h) / cols.length, w, h / cols.length + 1);
    });
  };
  const sun = (x, y, r, col, rays = 0) => {
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    if (rays) {
      ctx.lineWidth = r * 0.18;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
        ctx.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const crescent = (x, y, r, col, bg) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x + r * 0.25, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (code) {
    case 'KGZ':
      band(['#e8112d']);
      sun(w / 2, h / 2, h * 0.17, '#ffef00', 40);
      ctx.strokeStyle = '#e8112d';
      ctx.lineWidth = h * 0.02;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'KAZ':
      band(['#00afca']);
      sun(w / 2, h * 0.45, h * 0.15, '#fec50c', 32);
      ctx.fillStyle = '#fec50c';
      ctx.fillRect(w * 0.06, h * 0.1, w * 0.04, h * 0.8);
      break;
    case 'UZB':
      band(['#1eb53a', '#ffffff', '#ffffff', '#0099b5'].reverse());
      ctx.fillStyle = '#ce1126';
      ctx.fillRect(0, h * 0.32, w, h * 0.03);
      ctx.fillRect(0, h * 0.65, w, h * 0.03);
      crescent(w * 0.14, h * 0.14, h * 0.09, '#ffffff', '#0099b5');
      break;
    case 'TJK':
      band(['#cc0000', '#ffffff', '#006600']);
      ctx.fillStyle = '#f8c300';
      ctx.fillRect(w * 0.43, h * 0.42, w * 0.14, h * 0.08);
      break;
    case 'TKM':
      band(['#00843d']);
      ctx.fillStyle = '#d22630';
      ctx.fillRect(w * 0.12, 0, w * 0.16, h);
      crescent(w * 0.42, h * 0.25, h * 0.1, '#ffffff', '#00843d');
      break;
    case 'RUS':
      band(['#ffffff', '#0039a6', '#d52b1e']);
      break;
    case 'TUR':
      band(['#e30a17']);
      crescent(w * 0.38, h / 2, h * 0.25, '#ffffff', '#e30a17');
      sun(w * 0.56, h / 2, h * 0.07, '#ffffff');
      break;
    case 'MNG':
      band(['#c4272f', '#015197', '#c4272f'], true);
      ctx.fillStyle = '#f9cf02';
      ctx.fillRect(w * 0.13, h * 0.3, w * 0.07, h * 0.45);
      sun(w * 0.165, h * 0.2, h * 0.06, '#f9cf02');
      break;
    default:
      band(['#888']);
  }
}

const flagCache = new Map();
export function flagCanvas(code, w = 192, h = 128) {
  const key = `${code}:${w}x${h}`;
  if (flagCache.has(key)) return flagCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawFlag(c.getContext('2d'), code, w, h);
  flagCache.set(key, c);
  return c;
}
