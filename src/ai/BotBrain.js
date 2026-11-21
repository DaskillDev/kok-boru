import { KAZAN, GRAVITY, ULAK, FIELD, RULES, enemyKazanX, ownKazanX } from '../config.js';

// ИИ всадника. Каждый кадр заполняет rider.controls —
// тем же способом, что и клавиатура игрока.
//
// Командная игра строится на «очереди»: всадники команды упорядочены по близости к улаку.
// Первый идёт на улак (подбирает, отбирает или прикрывает своего), второй страхует или
// открывается под пас, остальные держат позицию — так боты не сбиваются в одну кучу.

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Дальность броска при силе замаха c, скорости всадника вдоль курса и силе броска power
function throwRange(c, fwdSpeed, power = 1) {
  const vh = lerp(ULAK.minThrowH, ULAK.maxThrowH, c) * power + fwdSpeed * ULAK.carrierInherit;
  const vy = lerp(ULAK.minThrowV, ULAK.maxThrowV, c) * power;
  const drop = ULAK.releaseHeight - (KAZAN.height + 0.25);
  const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
  return vh * t + 0.6;
}

function chargeForDistance(d, fwdSpeed, power) {
  if (throwRange(0, fwdSpeed, power) >= d) return 0;
  if (throwRange(1, fwdSpeed, power) < d) return -1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (throwRange(mid, fwdSpeed, power) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export class BotBrain {
  // skill 0..1: точность броска, скорость реакции, расчёт сил и аккуратность в стыках
  constructor(rider, skill = 0.6) {
    this.rider = rider;
    this.skill = skill;
    this.throwDist = 14;
    this.aimError = 0;
    this.side = rider.id % 2 === 0 ? 1 : -1;
    this.role = 'field'; // field | keeper
    this.resting = false; // бережём силы, пока выносливость не восстановится
    this.goal = null; // точка, к которой едем (обновляется с задержкой реакции)
    this.reactT = 0;
    this._newAttempt();
  }

  _newAttempt() {
    // с какого расстояния бросать: сильные боты подъезжают ближе и бросают точнее
    this.throwDist = lerp(11, 8, this.skill) + Math.random() * 6;
    this.aimError = (Math.random() - 0.5) * 2 * lerp(0.45, 0.12, this.skill);
  }

  idle() {
    const c = this.rider.controls;
    c.throttle = 0;
    c.steer = 0;
    c.sprint = false;
    c.action = false;
    c.pass = false;
    c.feint = false;
    this.goal = null;
  }

  setSkill(skill) {
    this.skill = skill;
    this.resting = false;
    this._newAttempt();
  }

  think(dt, match) {
    const me = this.rider;
    // расчёт сил: выдохся — отдыхаем, пока запас не восстановится (иначе конь «встанет» в важный момент)
    if (me.stamina < lerp(0.3, 0.14, this.skill)) this.resting = true;
    else if (me.stamina > lerp(0.6, 0.45, this.skill)) this.resting = false;

    // выбираемся из затора: если хотели ехать, но стоим — сдаём назад с поворотом
    if (this.unstuckT > 0) {
      this.unstuckT -= dt;
      const c = me.controls;
      c.throttle = -1;
      c.steer = this.side;
      c.sprint = c.action = c.pass = c.feint = false;
      return;
    }
    this.reactT -= dt;
    // отбор: бот хватается за улак не мгновенно, а проехав рядом с несущим время своей реакции
    const h = match.ulak.holder;
    const nearHolder = h && h.teamId !== me.teamId && dist(h.pos, me.pos) < ULAK.stealDist + 1.6;
    this.stealT = nearHolder ? (this.stealT || 0) + dt : 0;
    me.botSteal = this.stealT > lerp(0.85, 0.12, this.skill);
    this._decide(dt, match);
    this._avoidRam(match);
    const wants = me.controls.throttle > 0.5 && !me.inTug && me.stagger <= 0;
    this.stuckT = wants && Math.abs(me.speed) < 0.9 ? (this.stuckT || 0) + dt : 0;
    if (this.stuckT > 1.6) {
      this.stuckT = 0;
      this.unstuckT = 0.9;
      this.side = -this.side;
    }
  }

  // Можно ли сейчас тратить силы на рывок
  _fresh(reserve = 0) {
    return !this.resting && !this.rider.exhausted && this.rider.stamina > reserve;
  }

  // Место в «очереди» команды к точке T: 0 — я ближе всех своих
  _rank(mates, T) {
    const myD = dist(this.rider.pos, T);
    let rank = 0;
    for (const m of mates) {
      // вратаря и штрафников в очередь не ставим; небольшой запас — чтобы роли не дёргались
      if (m.penalty > 0 || m.botRole === 'keeper') continue;
      if (dist(m.pos, T) < myD - 1.5) rank++;
    }
    return rank;
  }

  _decide(dt, match) {
    const me = this.rider;
    const c = me.controls;
    const ulak = match.ulak;
    c.action = false;
    c.sprint = false;
    c.pass = false;
    c.feint = false;
    me.botRole = this.role;

    const mates = match.riders.filter((r) => r.teamId === me.teamId && r !== me);
    const foes = match.riders.filter((r) => r.teamId !== me.teamId && !(r.penalty > 0));

    if (me.hasUlak) {
      this._carry(me, c, foes, mates, dt);
      return;
    }

    const holder = ulak.holder;

    // в борьбе за улак — тянем изо всех сил
    if (me.inTug && holder) {
      this._drive(holder.pos.x + holder.vel.x * 0.3, holder.pos.z + holder.vel.z * 0.3, { sprint: me.stamina > 0.12, now: true });
      return;
    }

    // «вратарь» в больших составах держится у своего казана, пока улак далеко
    if (this.role === 'keeper' && !(holder && holder.teamId === me.teamId)) {
      const ox = ownKazanX(me.teamId);
      const T = holder ? holder.pos : ulak.pos;
      const dK = Math.hypot(T.x - ox, T.z);
      if (dK > 26) {
        const k = 9 / dK;
        this._drive(ox + (T.x - ox) * k, T.z * k, { arrive: 3, pace: 0.7 });
        return;
      }
    }

    // «жекеме-жеке»: кто не участвует в схватке, ждёт за кругом на своей стороне
    if (match.duel && !match.duel.riders.includes(me)) {
      const dir = me.team.attackDir;
      this._drive(match.duel.x - dir * (match.duel.r + 6), this.side * 9, { arrive: 3, pace: 0.7 });
      return;
    }

    if (!holder) this._loose(me, ulak, mates, foes);
    else if (holder.teamId === me.teamId) this._support(me, holder, mates, foes);
    else this._defend(me, holder, mates, foes);
  }

  // ---------- улак свободен ----------
  _loose(me, ulak, mates, foes) {
    // куда упадёт летящий улак
    let tx = ulak.pos.x;
    let tz = ulak.pos.z;
    const flying = ulak.pos.y > 0.8 || Math.abs(ulak.vel.y) > 1.5;
    if (flying) {
      const vy = ulak.vel.y;
      const t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * Math.max(0, ulak.pos.y - 0.3)))) / GRAVITY;
      tx += ulak.vel.x * t * 0.9;
      tz += ulak.vel.z * t * 0.9;
    } else {
      tx += ulak.vel.x * 0.35;
      tz += ulak.vel.z * 0.35;
    }
    const T = { x: tx, z: tz };
    const rank = this._rank(mates, T);
    const myD = dist(me.pos, T);
    // пас адресован мне — встречаю улак, что бы ни показывала очередь
    const mine = ulak.passTo === me;

    if (rank === 0 || mine || myD < 6) {
      // едем подбирать: на подъезде придерживаем коня — на полном ходу до туши не дотянуться
      const foeD = foes.length ? Math.min(...foes.map((f) => dist(f.pos, T))) : 99;
      const race = foeD < myD + 8; // соперник рядом — надо успеть первым
      this._drive(tx, tz, {
        sprint: myD > 9 && this._fresh(race ? 0.05 : 0.4),
        arrive: flying ? 1.2 : lerp(2.6, 1.9, this.skill),
        now: myD < 10,
      });
      if (!flying && myD < 7 && Math.abs(me.speed) > lerp(11, 13.5, this.skill)) me.controls.throttle = Math.min(me.controls.throttle, 0.15);
      return;
    }

    const ox = ownKazanX(me.teamId);
    const ex = enemyKazanX(me.teamId);
    const ourBall = !foes.some((f) => dist(f.pos, T) < dist(mates.reduce((a, b) => (dist(a.pos, T) < dist(b.pos, T) ? a : b), me).pos, T) - 2);
    if (rank === 1) {
      // страхуем: если улак, скорее всего, возьмут наши — открываемся впереди, иначе встаём на пути к своему казану
      if (ourBall) this._drive(lerp(tx, ex, 0.3), tz * 0.5 + this.side * 9, { arrive: 5, pace: 0.85 });
      else this._drive(lerp(tx, ox, 0.3), tz * 0.6 + this.side * 6, { arrive: 5, sprint: this._fresh(0.55) });
    } else if (rank === 2) {
      this._drive(lerp(tx, ex, 0.45), tz * 0.3 - this.side * 12, { arrive: 6, pace: 0.8 });
    } else {
      this._drive(lerp(tx, ox, 0.5), tz * 0.3 + this.side * 10, { arrive: 6, pace: 0.75 });
    }
  }

  // ---------- улак у напарника ----------
  _support(me, holder, mates, foes) {
    const rank = this._rank(
      mates.filter((m) => m !== holder),
      holder.pos,
    );
    const dir = me.team.attackDir;

    if (rank === 0) {
      // прикрываем: встаём между несущим и ближайшим к нему соперником
      let threat = null;
      let best = Infinity;
      for (const f of foes) {
        const d = dist(f.pos, holder.pos);
        if (d < best) {
          best = d;
          threat = f;
        }
      }
      if (threat && best < 24) {
        this._drive(
          lerp(threat.pos.x, holder.pos.x, 0.35) + threat.vel.x * 0.3,
          lerp(threat.pos.z, holder.pos.z, 0.35) + threat.vel.z * 0.3,
          { sprint: this._fresh(0.35) && best < 14, now: best < 10 },
        );
        return;
      }
      this._drive(holder.pos.x + dir * 6, holder.pos.z + this.side * 6, { arrive: 3 });
      return;
    }
    if (rank === 1) {
      // открываемся под пас: впереди несущего, в стороне от него, не заезжая за казан
      const ax = clamp(holder.pos.x + dir * 16, -KAZAN.x + 12, KAZAN.x - 12);
      const az = clamp(holder.pos.z + this.side * 12, -FIELD.width / 2 + 6, FIELD.width / 2 - 6);
      this._drive(ax, az, { arrive: 4, sprint: this._fresh(0.6) && dist(me.pos, { x: ax, z: az }) > 18 });
      return;
    }
    // остальные держатся сзади — на случай потери улака
    this._drive(lerp(holder.pos.x, ownKazanX(me.teamId), 0.35), holder.pos.z * 0.4 - this.side * 9, { arrive: 6, pace: 0.75 });
  }

  // ---------- улак у соперника ----------
  _defend(me, holder, mates, foes) {
    const rank = this._rank(mates, holder.pos);
    const ox = ownKazanX(me.teamId);
    const myD = dist(me.pos, holder.pos);
    const dK = Math.hypot(holder.pos.x - ox, holder.pos.z); // сколько несущему до нашего казана
    const danger = dK < 38;

    if (rank === 0 || (danger && rank === 1) || myD < 9) {
      // идём на отбор: целимся туда, где несущий будет, когда мы подъедем
      const closing = Math.max(8, Math.abs(me.speed) + 3);
      const lead = clamp(myD / closing, 0.1, lerp(0.9, 1.8, this.skill));
      // если несущий уходит от нас к казану — режем угол к линии его движения
      let tx = holder.pos.x + holder.vel.x * lead;
      let tz = holder.pos.z + holder.vel.z * lead;
      const meK = Math.hypot(me.pos.x - ox, me.pos.z);
      if (meK < dK - 4 && myD > 10) {
        // мы между несущим и казаном — встречаем его на линии
        const k = clamp((dK - meK) / dK, 0.2, 0.7);
        tx = lerp(holder.pos.x, ox, k * 0.6) + holder.vel.x * 0.3;
        tz = lerp(holder.pos.z, 0, k * 0.6) + holder.vel.z * 0.3;
      }
      this._drive(tx, tz, { sprint: this._fresh(danger ? 0.02 : 0.2) && myD < 34, now: myD < 12 });
      return;
    }

    if (rank === 1) {
      // второй перекрывает путь к своему казану
      const k = clamp(14 / Math.max(dK, 1), 0.25, 0.6);
      this._drive(lerp(holder.pos.x, ox, k), lerp(holder.pos.z, 0, k), { sprint: this._fresh(0.5), arrive: 3 });
      return;
    }

    // остальные «держат» свободных соперников, чтобы несущему некому было отдать пас
    const free = foes.filter((f) => f !== holder);
    if (free.length) {
      const idx = (rank + (this.side > 0 ? 0 : 1)) % free.length;
      const mark = free.sort((a, b) => Math.hypot(a.pos.x - ox, a.pos.z) - Math.hypot(b.pos.x - ox, b.pos.z))[idx];
      // встаём не вплотную, а в нескольких метрах со стороны своего казана
      const mk = Math.hypot(mark.pos.x - ox, mark.pos.z) || 1;
      this._drive(mark.pos.x + ((ox - mark.pos.x) / mk) * 5, mark.pos.z + (-mark.pos.z / mk) * 5, { arrive: 3, pace: 0.9, sprint: this._fresh(0.65) });
    } else {
      this._drive(lerp(ox, holder.pos.x, 0.4), holder.pos.z * 0.4, { arrive: 4 });
    }
  }

  // ---------- несу улак ----------
  _carry(me, c, foes, mates = [], dt = 0.016) {
    const kx = enemyKazanX(me.teamId);
    const dx = kx - me.pos.x;
    const dz = -me.pos.z;
    const d = Math.hypot(dx, dz);
    const toKazan = Math.atan2(dx, dz);
    const fwdSpeed = Math.max(0, me.speed);
    const power = me.throwPower();
    let nearestFoe = 99;
    let near = null;
    for (const f of foes) {
      const fd = dist(f.pos, me.pos);
      if (fd < nearestFoe) {
        nearestFoe = fd;
        near = f;
      }
    }

    // бросаем раньше, если вот-вот отберут
    const pressured = nearestFoe < 3.2 && d < 22;
    const inZone = d < this.throwDist || pressured;

    // в борьбе за улак сильные боты уходят финтом
    if (me.inTug && me.stamina > 0.3 && Math.random() < dt * 0.7 * this.skill) c.feint = true;
    // соперник тянется к улаку — уходим финтом в сторону от него
    if (!me.inTug && near && nearestFoe < 4.2 && me.feintCooldown <= 0 && me.stamina > 0.4 && !me.charging && Math.random() < dt * 1.2 * this.skill) {
      const rel = (near.pos.x - me.pos.x) * Math.cos(me.heading) - (near.pos.z - me.pos.z) * Math.sin(me.heading);
      c.steer = rel > 0 ? -1 : 1; // «влево» всадника — это +X (cos h, −sin h)
      c.feint = true;
    }
    // под давлением вдали от казана (или когда кончились силы) — пас открытому напарнику впереди
    const tired = me.exhausted || me.stamina < 0.15;
    if ((nearestFoe < 6 || (tired && nearestFoe < 14)) && d > 16 && !me.charging && Math.random() < dt * (tired ? 1.2 : 0.2 + 0.5 * this.skill)) {
      const dir = me.team.attackDir;
      const open = mates.some((m) => {
        if (m.penalty > 0) return false;
        const md = dist(m.pos, me.pos);
        const ahead = (m.pos.x - me.pos.x) * dir;
        const free = foes.length ? Math.min(...foes.map((f) => dist(f.pos, m.pos))) > 7 : true;
        return md > 7 && md < 34 && ahead > 3 && free;
      });
      if (open) {
        c.pass = true;
        return;
      }
    }

    // объезжаем соперников, которые стоят на пути к казану
    let want = toKazan;
    if (!inZone && d > this.throwDist + 5) {
      let dodge = 0;
      for (const f of foes) {
        const fx = f.pos.x + f.vel.x * 0.4 - me.pos.x;
        const fz = f.pos.z + f.vel.z * 0.4 - me.pos.z;
        const fd = Math.hypot(fx, fz);
        if (fd > 16 || fd < 0.5) continue;
        const rel = wrapPi(Math.atan2(fx, fz) - toKazan);
        if (Math.abs(rel) > 1.1) continue; // сбоку и сзади — не мешает
        // чем ближе и чем точнее на пути, тем сильнее уводим курс в другую сторону
        const w = (1 - fd / 16) * (1 - Math.abs(rel) / 1.1);
        dodge -= (rel >= 0 ? 1 : -1) * w * lerp(0.6, 1.3, this.skill);
      }
      // у боковой линии не уворачиваемся наружу
      const edge = FIELD.width / 2 - 7;
      if (Math.abs(me.pos.z) > edge) {
        const out = wrapPi(toKazan + dodge);
        if (Math.cos(out) * Math.sign(me.pos.z) > 0) dodge *= 0.3;
      }
      want = toKazan + clamp(dodge, -0.95, 0.95);
    }
    const err = wrapPi(want - me.heading);
    const aimErr = wrapPi(toKazan - me.heading);

    c.steer = clamp(err * 3, -1, 1);
    c.throttle = Math.abs(err) > 1.4 ? 0.4 : 1;
    // рывок: уходим от погони или проходим середину поля; у казана силы нужны на бросок
    const chased = nearestFoe < 11;
    c.sprint = !inZone && this._fresh(chased ? 0.08 : 0.5) && (chased || d > 45) && Math.abs(err) < 0.7;

    // на подходе к казану сбрасываем ход: на полном скаку улак перелетит чашу
    if (!inZone && d < this.throwDist + 8 && fwdSpeed > 12.5 && !chased) c.throttle = 0.55;
    if (!inZone || me.mustRelease) return;

    // слишком близко и слишком быстро — придержать коня
    if (throwRange(0, fwdSpeed, power) > d + 0.5) c.throttle = fwdSpeed > 3 ? -1 : 0.2;
    else if (fwdSpeed > 11) c.throttle = 0.4;

    const aimed = Math.abs(aimErr) < lerp(0.2, 0.09, this.skill);
    c.steer = clamp(aimErr * 3.5, -1, 1);
    if (!aimed && !me.charging) return;

    const need = chargeForDistance(d, fwdSpeed, power);
    if (need < 0) return; // не добросить — подъезжаем ближе
    const target = clamp(need * (1 + this.aimError), 0, 1);
    if (!me.charging || me.charge < target) {
      c.action = true; // держим «пробел» — замах
    } else {
      c.action = false; // отпускаем — бросок
      this._newAttempt();
    }
  }

  // Не таранить: если через мгновение врежемся носом в соперника — придерживаем коня и берём ему за круп.
  // (таран в бок — штраф по правилам)
  _avoidRam(match) {
    const me = this.rider;
    const c = me.controls;
    if (me.inTug || Math.abs(me.speed) < 5) return;
    const fx = Math.sin(me.heading);
    const fz = Math.cos(me.heading);
    // слабые боты замечают опасность позже и нарушают чаще
    const limit = lerp(RULES.ramSpeed - 1, RULES.ramSpeed - 3.5, this.skill);
    const horizon = lerp(0.55, 1.1, this.skill);
    for (const o of match.riders) {
      if (o === me || o.teamId === me.teamId || o.penalty > 0) continue;
      const px = o.pos.x - me.pos.x;
      const pz = o.pos.z - me.pos.z;
      const d = Math.hypot(px, pz);
      if (d > 26 || d < 0.1) continue;
      const vx = o.vel.x - me.vel.x;
      const vz = o.vel.z - me.vel.z;
      const v2 = vx * vx + vz * vz;
      if (v2 < limit * limit) continue;
      // момент наибольшего сближения и промах в этот момент
      const t = -(px * vx + pz * vz) / v2;
      if (t < 0 || t > horizon) continue;
      const miss = Math.hypot(px + vx * t, pz + vz * t);
      if (miss > 2.4) continue;
      // врежусь именно я (носом), а не он в меня
      const nose = (fx * px + fz * pz) / d;
      if (nose < 0.55) continue;
      c.sprint = false;
      c.throttle = t < 0.5 ? -1 : 0;
      // поворачиваем туда, откуда соперник едет, — пройдём у него за крупом
      const os = Math.hypot(o.vel.x, o.vel.z);
      if (os > 2) {
        const cross = fx * (-o.vel.z) - fz * (-o.vel.x);
        c.steer = clamp(c.steer + (cross > 0 ? -0.8 : 0.8), -1, 1);
      }
      return;
    }
  }

  // Рулевое управление к точке.
  // sprint — рывок; arrive — на каком расстоянии сбрасывать ход; pace — доля хода (отдых на рыси);
  // now — без задержки реакции (ближний бой)
  _drive(tx, tz, { sprint = false, arrive = 0, pace = 1, now = false } = {}) {
    const me = this.rider;
    const c = me.controls;
    // цель не выносим за линии поля — иначе улак уйдёт в аут
    tx = clamp(tx, -FIELD.length / 2 + 2.5, FIELD.length / 2 - 2.5);
    tz = clamp(tz, -FIELD.width / 2 + 2.5, FIELD.width / 2 - 2.5);
    // реакция: слабые боты замечают перемену обстановки с опозданием
    if (now || !this.goal || this.reactT <= 0) {
      this.goal = { x: tx, z: tz };
      this.reactT = lerp(0.38, 0.04, this.skill);
    }
    tx = this.goal.x;
    tz = this.goal.z;
    // казан объезжаем, а не упираемся в него: если он на пути, едем через точку сбоку от насыпи
    const seg = Math.hypot(tx - me.pos.x, tz - me.pos.z);
    if (seg > 1) {
      const ux = (tx - me.pos.x) / seg;
      const uz = (tz - me.pos.z) / seg;
      const R = KAZAN.outerR + 2.4;
      for (const s of [-1, 1]) {
        const ax = s * KAZAN.x - me.pos.x;
        const az = -me.pos.z;
        const along = ax * ux + az * uz;
        if (along < 0 || along > seg) continue;
        // вектор от пути к центру казана
        let px = ax - ux * along;
        let pz = az - uz * along;
        const off = Math.hypot(px, pz);
        if (off >= R) continue;
        if (off < 0.05) {
          px = -uz * this.side;
          pz = ux * this.side;
        } else {
          px /= off;
          pz /= off;
        }
        tx = s * KAZAN.x - px * (R + 1);
        tz = -pz * (R + 1);
        arrive = 0; // это промежуточная точка — проезжаем её ходом
        break;
      }
    }
    const dx = tx - me.pos.x;
    const dz = tz - me.pos.z;
    const d = Math.hypot(dx, dz);
    const err = wrapPi(Math.atan2(dx, dz) - me.heading);
    c.steer = clamp(err * 3, -1, 1);
    let thr = Math.abs(err) > 1.5 ? 0.35 : 1;
    if (arrive > 0 && d < arrive * 2.5) thr *= clamp((d - arrive * 0.4) / (arrive * 2.1), 0, 1);
    // когда спешить некуда — идём неполным ходом и копим силы
    if (!sprint && pace < 1 && d > arrive * 2.5) thr *= this.rider.stamina < 0.8 ? pace : 1;
    c.throttle = thr;
    c.sprint = sprint && Math.abs(err) < 0.6 && thr > 0.8;
  }
}
