import { settings } from '../ui/settings.js';
import { t } from '../ui/i18n.js';

// Комментатор матча: короткие реплики на события игры.
// Реплика показывается строкой на экране и, если в браузере есть голос для языка игры,
// произносится вслух (встроенный синтез речи браузера — без интернета и сторонних сервисов).
//
// В репликах: {n} — всадник, {m} — второй всадник, {t} — команда, {a}:{b} — счёт.

const LINES = {
  ru: {
    start: ['Матч начался! Всадники рвутся к улаку.', 'Свисток! Игра пошла.', 'Поехали! Кто первым доберётся до улака?'],
    pickup: ['{n} подхватывает улак!', 'Улак у всадника {n}.', '{n} поднял тушу с земли!', '{n} с улаком, {t} идёт вперёд.'],
    tug: ['Борьба за улак! {n} против {m}.', 'Схватились! {m} тянет улак у {n}.', 'Тартыш! Кто кого перетянет?'],
    steal: ['{n} вырывает улак!', 'Отбор! Улак теперь у {n}.', 'Какой рывок! {n} забрал тушу.'],
    held: ['{n} удержал улак!', 'Не отдал! {n} идёт дальше.'],
    pass: ['Пас на {m}.', '{n} бросает напарнику.', 'Передача! {m} открыт.'],
    throw: ['Бросок!', '{n} бросает улак!', 'Замах — и туша летит!'],
    fumble: ['{n} теряет улак!', 'Столкновение! Улак на земле.', 'Выбили! Туша свободна.'],
    near: ['{n} рвётся к казану!', 'Опасный момент! {n} уже у казана.', '{t} в шаге от гола!'],
    goal: ['Гол! {n} забрасывает улак в казан! Счёт {a}:{b}.', 'Улак в казане! {t} забивает. {a}:{b}.', 'Го-о-ол! Отличная работа, {n}! На табло {a}:{b}.'],
    goalTeam: ['Гол! {t} забивает. Счёт {a}:{b}.', 'Улак в казане! {a}:{b}.'],
    foul: ['Нарушение! {n} удалён.', 'Судья свистит: грубая игра, {n} отдыхает.'],
    out: ['Улак ушёл за пределы поля. Спорный.', 'Туша за линией — будет розыгрыш.'],
    loose: ['Судья останавливает игру. Спорный улак.', 'Свисток! Розыгрыш в центре.'],
    period: ['Период окончен. Команды меняются сторонами. Счёт {a}:{b}.', 'Перерыв! На табло {a}:{b}.'],
    overtime: ['Ничья! Играем до первого гола.', 'Дополнительное время: кто забьёт — тот победил!'],
    win: ['Матч окончен! Побеждает {t}. Счёт {a}:{b}.', 'Финальный свисток! Победа — {t}, {a}:{b}.'],
    draw: ['Матч окончен. Ничья, {a}:{b}.', 'Финальный свисток! Победителя нет — {a}:{b}.'],
  },
  kg: {
    start: ['Оюн башталды! Чабандестер улакка умтулууда.', 'Ышкырык! Оюн кетти.', 'Кеттик! Улакка ким биринчи жетет?'],
    pickup: ['{n} улакты илип алды!', 'Улак {n} колунда.', '{n} улакты жерден көтөрдү!', '{n} улак менен, {t} алдыга баратат.'],
    tug: ['Улак талаш! {n} менен {m}.', 'Кармашты! {m} улакты {n} колунан тартып жатат.', 'Тартыш! Ким жеңет?'],
    steal: ['{n} улакты жулуп алды!', 'Тартып алды! Улак эми {n} колунда.', 'Кандай күч! {n} улакты алды.'],
    held: ['{n} улакты бербеди!', 'Берген жок! {n} андан ары баратат.'],
    pass: ['{m} үчүн узатуу.', '{n} шеригине ыргытты.', 'Узатуу! {m} бош турат.'],
    throw: ['Ыргытуу!', '{n} улакты ыргытты!', 'Шилтеди — улак учуп баратат!'],
    fumble: ['{n} улакты түшүрүп алды!', 'Кагылышуу! Улак жерде.', 'Түшүрүштү! Улак бош.'],
    near: ['{n} казанга жакындады!', 'Коркунучтуу учур! {n} казандын жанында.', '{t} голго бир кадам калды!'],
    goal: ['Гол! {n} улакты казанга таштады! Эсеп {a}:{b}.', 'Улак казанда! {t} гол киргизди. {a}:{b}.', 'Го-о-ол! Азамат, {n}! Эсеп {a}:{b}.'],
    goalTeam: ['Гол! {t} гол киргизди. Эсеп {a}:{b}.', 'Улак казанда! {a}:{b}.'],
    foul: ['Эреже бузулду! {n} оюндан чыгарылды.', 'Калыс ышкырды: орой оюн, {n} эс алат.'],
    out: ['Улак талаадан чыгып кетти. Талаш улак.', 'Улак сызыктан чыкты — кайра ойнотулат.'],
    loose: ['Калыс оюнду токтотту. Талаш улак.', 'Ышкырык! Ортодон кайра башталат.'],
    period: ['Мезгил бүттү. Командалар тарап алмашат. Эсеп {a}:{b}.', 'Тыныгуу! Эсеп {a}:{b}.'],
    overtime: ['Тең! Биринчи голго чейин ойнойбуз.', 'Кошумча убакыт: ким гол киргизсе — ошол жеңет!'],
    win: ['Оюн бүттү! {t} жеңди. Эсеп {a}:{b}.', 'Акыркы ышкырык! Жеңиш — {t}, {a}:{b}.'],
    draw: ['Оюн бүттү. Тең чыгышты, {a}:{b}.', 'Акыркы ышкырык! Жеңүүчү жок — {a}:{b}.'],
  },
  en: {
    start: ['The match is on! Riders charge for the ulak.', 'There goes the whistle! We are under way.', 'Off they go! Who gets to the ulak first?'],
    pickup: ['{n} scoops up the ulak!', '{n} has the ulak.', '{n} lifts the carcass off the ground!', '{n} on the ball for {t}.'],
    tug: ['A fight for the ulak! {n} against {m}.', 'They are locked together! {m} is pulling it away from {n}.', 'Tug of war! Who wins this one?'],
    steal: ['{n} rips the ulak away!', 'Stolen! {n} has it now.', 'What a pull! {n} takes the carcass.'],
    held: ['{n} holds on!', 'No way through! {n} keeps going.'],
    pass: ['Pass to {m}.', '{n} throws to a teammate.', 'Nice pass! {m} is open.'],
    throw: ['The throw!', '{n} lets it fly!', 'A big swing — and it is in the air!'],
    fumble: ['{n} loses the ulak!', 'A heavy hit! The ulak is on the ground.', 'Knocked loose! It is anyone’s.'],
    near: ['{n} is charging at the kazan!', 'Danger here! {n} is right at the kazan.', '{t} are one step from a goal!'],
    goal: ['Goal! {n} drops the ulak into the kazan! It is {a} to {b}.', 'It is in the kazan! {t} score. {a} to {b}.', 'Go-o-oal! Brilliant from {n}! {a} to {b}.'],
    goalTeam: ['Goal! {t} score. It is {a} to {b}.', 'It is in the kazan! {a} to {b}.'],
    foul: ['Foul! {n} is sent off.', 'The referee blows: rough play, {n} sits out.'],
    out: ['The ulak is out of bounds. Jump ball.', 'Over the line — we will have a restart.'],
    loose: ['The referee stops play. Disputed ulak.', 'Whistle! Restart in the centre.'],
    period: ['End of the period. The teams change ends. It is {a} to {b}.', 'Break time! {a} to {b}.'],
    overtime: ['All square! Next goal wins.', 'Extra time: whoever scores takes it!'],
    win: ['Full time! {t} win it, {a} to {b}.', 'The final whistle! Victory for {t}, {a} to {b}.'],
    draw: ['Full time. A draw, {a} to {b}.', 'The final whistle! No winner today — {a} to {b}.'],
  },
};

// Важность: 3 — прерывает всё (гол, конец матча); 2 — ждёт конца текущей реплики; 1 — говорится, только если тихо
const PRIORITY = {
  goal: 3, goalTeam: 3, win: 3, draw: 3, overtime: 3,
  start: 2, steal: 2, foul: 2, out: 2, loose: 2, period: 2, near: 2, fumble: 2, tug: 2,
  pickup: 1, pass: 1, throw: 1, held: 1,
};
// Как часто можно повторять один и тот же повод, с
const COOLDOWN = { pickup: 6, pass: 7, throw: 7, tug: 7, near: 12, held: 8, fumble: 5 };
const VOICE_LANG = { ru: 'ru', kg: 'ky', en: 'en' };

export class Commentator {
  constructor() {
    this.el = document.getElementById('commentary');
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this._last = {}; // повод → время последней реплики
    this._lastLine = {}; // повод → номер прошлой фразы (чтобы не повторяться подряд)
    this._quietUntil = 0; // до этого времени идёт текущая реплика
    this._pending = null;
    this._hide = 0;
    if (this.synth) {
      const load = () => (this.voices = this.synth.getVoices());
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  get enabled() {
    return settings.commentator !== false;
  }

  // Имя для реплики: у всадника «KGZ · Азамат» берём только имя
  static who(r) {
    if (!r) return '';
    // игрок без имени подписан «Вы» — в реплике это звучит странно
    const s = String(r.name || '');
    const i = s.lastIndexOf('·');
    const name = (i >= 0 ? s.slice(i + 1) : s).trim();
    if (name === t('you')) return { ru: 'наш игрок', kg: 'биздин оюнчу', en: 'our player' }[settings.lang] || 'наш игрок';
    return name;
  }

  // kind — повод (ключ в LINES), data — { n, m, t, a, b }
  say(kind, data = {}) {
    if (!this.enabled) return;
    const now = performance.now() / 1000;
    const pr = PRIORITY[kind] || 1;
    if (now - (this._last[kind] ?? -99) < (COOLDOWN[kind] || 0)) return;
    const busy = now < this._quietUntil;
    if (busy && pr === 1) return;
    const lines = (LINES[settings.lang] || LINES.ru)[kind];
    if (!lines) return;
    let i = Math.floor(Math.random() * lines.length);
    if (lines.length > 1 && i === this._lastLine[kind]) i = (i + 1) % lines.length;
    this._lastLine[kind] = i;
    const raw = lines[i].replace(/\{(\w)\}/g, (_, k) => data[k] ?? '').replace(/\s+([.,!?])/g, '$1').trim();
    const text = raw.charAt(0).toUpperCase() + raw.slice(1);
    this._last[kind] = now;
    if (busy && pr === 2) {
      // дождётся конца текущей реплики; более свежая заменяет ожидающую
      this._pending = { text, at: now };
      return;
    }
    this._speak(text, pr === 3);
  }

  _speak(text, interrupt) {
    const now = performance.now() / 1000;
    this._pending = null;
    // примерная длительность реплики — чтобы не говорить поверх
    this._quietUntil = now + Math.min(6, 0.9 + text.length * 0.062);
    if (this.el) {
      this.el.textContent = text;
      this.el.classList.add('on');
      this._hide = this._quietUntil + 0.8;
    }
    const s = this.synth;
    if (!s) return;
    const want = VOICE_LANG[settings.lang] || 'ru';
    if (!this.voices.length) this.voices = s.getVoices(); // в части браузеров список голосов приходит не сразу
    const voice = this.voices.find((v) => v.lang?.toLowerCase().startsWith(want));
    if (!voice) return; // голоса для этого языка в браузере нет — остаётся строка на экране
    const volume = Math.max(0, Math.min(1, (settings.volume ?? 1) * (settings.sfx ?? 1)));
    if (volume <= 0.01) return;
    try {
      if (interrupt || s.speaking) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1.18;
      u.pitch = 1.05;
      u.volume = volume;
      s.speak(u);
    } catch {
      // синтез речи недоступен — остаётся строка на экране
    }
  }

  // Каждый кадр: ожидающая реплика и скрытие строки
  update() {
    const now = performance.now() / 1000;
    if (this._pending && now >= this._quietUntil) {
      const p = this._pending;
      this._pending = null;
      if (now - p.at < 2.5) this._speak(p.text, false); // устаревшую реплику не договариваем
    }
    if (this._hide && now > this._hide) {
      this._hide = 0;
      this.el?.classList.remove('on');
    }
  }

  // Замолчать (пауза, выход в меню)
  stop() {
    this._pending = null;
    this._quietUntil = 0;
    this._hide = 0;
    this.el?.classList.remove('on');
    try {
      this.synth?.cancel();
    } catch {
      // нечего останавливать
    }
  }
}
