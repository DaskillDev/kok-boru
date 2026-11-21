import { KAZAN, GRAVITY, ULAK, enemyKazanX, ownKazanX } from '../config.js';

// Простой ИИ всадника. Каждый кадр заполняет rider.controls —
// тем же способом, что и клавиатура игрока.

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Дальность броска при силе замаха c и скорости всадника вдоль курса
function throwRange(c, fwdSpeed) {
  const vh = lerp(ULAK.minThrowH, ULAK.maxThrowH, c) + fwdSpeed * ULAK.carrierInherit;
  const vy = lerp(ULAK.minThrowV, ULAK.maxThrowV, c);
  const drop = ULAK.releaseHeight - (KAZAN.height + 0.25);
  const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
  return vh * t + 0.6;
}

function chargeForDistance(dist, fwdSpeed) {
  if (throwRange(0, fwdSpeed) >= dist) return 0;
  if (throwRange(1, fwdSpeed) < dist) return -1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (throwRange(mid, fwdSpeed) < dist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export class BotBrain {
  // skill 0..1: точность броска и агрессивность
  constructor(rider, skill = 0.6) {
    this.rider = rider;
    this.skill = skill;
    this.throwDist = 14;
    this.aimError = 0;
    this.side = rider.id % 2 === 0 ? 1 : -1;
    this._newAttempt();
  }

  _newAttempt() {
    this.throwDist = 7 + Math.random() * 6;
    this.aimError = (Math.random() - 0.5) * 2 * lerp(0.5, 0.2, this.skill);
  }

  idle() {
    const c = this.rider.controls;
    c.throttle = 0;
    c.steer = 0;
    c.sprint = false;
    c.action = false;
  }

  think(dt, match) {
    const me = this.rider;
    const c = me.controls;
    const ulak = match.ulak;
    c.action = false;
    c.sprint = false;

    const mates = match.riders.filter((r) => r.teamId === me.teamId && r !== me);
    const foes = match.riders.filter((r) => r.teamId !== me.teamId);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

    if (me.hasUlak) {
      this._carry(me, c, foes, dist);
      return;
    }

    const holder = ulak.holder;
    if (!holder) {
      // свободный улак: ближайший из команды едет подбирать, второй страхует
      const myD = dist(me.pos, ulak.pos);
      const mateCloser = mates.some((m) => dist(m.pos, ulak.pos) < myD - 1.5);
      if (!mateCloser || myD < 6) {
        const lead = clamp(myD / 14, 0, 0.6);
        this._drive(ulak.pos.x + ulak.vel.x * lead, ulak.pos.z + ulak.vel.z * lead, {
          sprint: myD > 7 && me.stamina > 0.35,
          arrive: 2.2,
        });
      } else {
        // позиция поддержки: между улаком и своим казаном, со смещением
        const ox = ownKazanX(me.teamId);
        this._drive(lerp(ulak.pos.x, ox, 0.35), ulak.pos.z * 0.6 + this.side * 7, { arrive: 5 });
      }
      return;
    }

    if (holder.teamId === me.teamId) {
      // напарник несёт: прикрываем — встаём на пути ближайшего соперника
      let threat = null;
      let best = Infinity;
      for (const f of foes) {
        const d = dist(f.pos, holder.pos);
        if (d < best) {
          best = d;
          threat = f;
        }
      }
      if (threat && best < 22) {
        this._drive(lerp(threat.pos.x, holder.pos.x, 0.3), lerp(threat.pos.z, holder.pos.z, 0.3), {
          sprint: me.stamina > 0.5 && best < 12,
        });
      } else {
        const ex = enemyKazanX(me.teamId);
        this._drive(lerp(holder.pos.x, ex, 0.4), holder.pos.z + this.side * 9, { arrive: 5 });
      }
      return;
    }

    // улак у соперника: один гонится, второй перекрывает путь к своему казану
    const myD = dist(me.pos, holder.pos);
    const mateCloser = mates.some((m) => dist(m.pos, holder.pos) < myD - 2);
    if (!mateCloser || myD < 24) {
      const lead = clamp(myD / 11, 0.1, 1.2);
      this._drive(holder.pos.x + holder.vel.x * lead, holder.pos.z + holder.vel.z * lead, {
        sprint: me.stamina > lerp(0.3, 0.12, this.skill) && myD < 30,
      });
    } else {
      const ox = ownKazanX(me.teamId);
      this._drive(lerp(ox, holder.pos.x, 0.4), lerp(0, holder.pos.z, 0.4), {
        sprint: me.stamina > 0.6,
        arrive: 4,
      });
    }
  }

  _carry(me, c, foes, dist) {
    const kx = enemyKazanX(me.teamId);
    const dx = kx - me.pos.x;
    const dz = -me.pos.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const err = wrapPi(want - me.heading);
    const fwdSpeed = Math.max(0, me.speed);
    const nearestFoe = Math.min(...foes.map((f) => dist(f.pos, me.pos)));

    // бросаем раньше, если вот-вот отберут
    const pressured = nearestFoe < 2.6 && d < 20;
    const inZone = d < this.throwDist || pressured;

    c.steer = clamp(err * 3, -1, 1);
    c.throttle = Math.abs(err) > 1.4 ? 0.4 : 1;
    c.sprint = !inZone && me.stamina > 0.3 && (nearestFoe < 10 || d > 30);

    if (!inZone || me.mustRelease) return;

    // слишком близко и слишком быстро — придержать коня
    if (throwRange(0, fwdSpeed) > d + 0.5) c.throttle = fwdSpeed > 3 ? -1 : 0.2;

    const aimed = Math.abs(err) < lerp(0.2, 0.1, this.skill);
    if (!aimed && !me.charging) return;

    const need = chargeForDistance(d, fwdSpeed);
    if (need < 0) return; // не добросить — подъезжаем ближе
    const target = clamp(need * (1 + this.aimError), 0, 1);
    if (!me.charging || me.charge < target) {
      c.action = true; // держим «пробел» — замах
    } else {
      c.action = false; // отпускаем — бросок
      this._newAttempt();
    }
  }

  // Рулевое управление к точке
  _drive(tx, tz, { sprint = false, arrive = 0 } = {}) {
    const me = this.rider;
    const c = me.controls;
    const dx = tx - me.pos.x;
    const dz = tz - me.pos.z;
    const d = Math.hypot(dx, dz);
    const err = wrapPi(Math.atan2(dx, dz) - me.heading);
    c.steer = clamp(err * 3, -1, 1);
    let thr = Math.abs(err) > 1.5 ? 0.35 : 1;
    if (arrive > 0 && d < arrive * 2.5) thr *= clamp((d - arrive * 0.4) / (arrive * 2.1), 0, 1);
    c.throttle = thr;
    c.sprint = sprint && Math.abs(err) < 0.6 && thr > 0.8;
  }
}
