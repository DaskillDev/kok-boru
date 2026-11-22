import * as THREE from 'three';
import { FIELD, KAZAN, HORSE, ULAK, STAMINA, MATCH_TIME, TEAMS, GRAVITY, RULES } from '../config.js';

// Ближайшие точки двух отрезков на плоскости (x, z)
function closestSegSeg(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z) {
  const d1x = q1x - p1x;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  const c = d1x * rx + d1z * rz;
  const b = d1x * d2x + d1z * d2z;
  const den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0.5;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (t > 1) {
    t = 1;
    s = Math.min(1, Math.max(0, (b - c) / a));
  }
  return { x1: p1x + d1x * s, z1: p1z + d1z * s, x2: p2x + d2x * t, z2: p2z + d2z * t };
}

// Правила матча: таймер, счёт, розыгрыш, подбор/отбор/бросок улака, столкновения.
// Не зависит от рендера и ввода — работает только с сущностями и их controls,
// поэтому позже тот же код можно крутить на сервере.

export class Match {
  constructor({ riders, ulak, brains, events, physics }) {
    this.physics = physics;
    this.riders = riders;
    this.ulak = ulak;
    this.brains = brains; // BotBrain[] для ботов
    this.events = events; // колбэки: onGoal, onSteal, onPickup, onThrow, onCountdown, onStart, onEnd, ...
    this.state = 'idle'; // idle | countdown | playing | goal | whistle | break | over
    this.score = [0, 0];
    this.duration = MATCH_TIME;
    this.periods = RULES.periods;
    this.period = 1;
    this.periodTime = MATCH_TIME / RULES.periods;
    this.time = this.periodTime; // осталось в текущем периоде
    this.timer = 0;
    this._order = 0;
    this.tug = null; // { holder, rival, t, score, bias } — текущая борьба за улак
    this.duel = null; // { x, z, r, t, riders } — схватка один на один в круге
    this.looseT = 0; // сколько улак лежит без хозяина
    this.goldenGoal = true; // при ничьей — дополнительное время до первого гола
    this.overtime = false;
    this.overtimeLeft = 0;
    this._pending = null;
  }

  // Состав и длительность следующего матча (duration — сумма всех периодов)
  configure(riders, duration = MATCH_TIME, periods = RULES.periods) {
    this.riders = riders;
    this.duration = duration;
    this.periods = periods;
    this.periodTime = duration / periods;
  }

  get penaltyTime() {
    return THREE.MathUtils.clamp(this.periodTime * RULES.penaltyShare, 8, 120);
  }

  _finish() {
    this.state = 'over';
    for (const r of this.riders) r.frozen = true;
    this.events.onEnd?.(this.score);
  }

  start() {
    this.score = [0, 0];
    this.overtime = false;
    this.overtimeLeft = 0;
    this.period = 1;
    this.time = this.periodTime;
    // исходные стороны: команда 0 атакует вправо
    TEAMS[0].attackDir = 1;
    TEAMS[1].attackDir = -1;
    this.events.onSides?.();
    for (const r of this.riders) {
      r.penalty = 0;
      r.fouls = 0;
    }
    this.kickoff();
  }

  // Розыгрыш: улак в центральном круге, команды стартуют с боковой линии напротив зрителей
  kickoff() {
    const perTeam = [0, 0];
    const zLine = FIELD.width / 2 - 3;
    for (const r of this.riders) {
      if (r.penalty > 0) continue;
      const i = perTeam[r.teamId]++;
      r.place(-r.team.attackDir * (5 + i * 5.5), zLine, Math.PI);
      r.frozen = true;
      r.mustRelease = false;
    }
    this._endTug();
    this.duel = null;
    this.looseT = 0;
    this.ulak.reset(0, 0, 3);
    this.state = 'countdown';
    this.timer = 3;
    this._lastCount = 0;
  }

  _swapSides() {
    for (const t of TEAMS) t.attackDir *= -1;
    this.events.onSides?.();
  }

  _endPeriod() {
    for (const r of this.riders) r.frozen = true;
    if (this.period < this.periods) {
      this.state = 'break';
      this.timer = 3.5;
      this._pending = 'period';
      this.events.onPeriodEnd?.(this.period);
    } else if (this.goldenGoal && this.score[0] === this.score[1]) {
      this.state = 'break';
      this.timer = 3.5;
      this._pending = 'overtime';
      this.events.onPeriodEnd?.(this.period);
    } else this._finish();
  }

  // Свисток: аут или улак слишком долго не взят — назначается «жекеме-жеке»
  _whistle(reason) {
    const u = this.ulak;
    this._endTug();
    if (u.holder) u.release(u.pos.clone().setY(1.2), new THREE.Vector3(), u.holder);
    for (const r of this.riders) {
      r.frozen = true;
      r.charging = false;
      r.charge = 0;
    }
    this.state = 'whistle';
    this.timer = 1.6;
    this._pending = { x: u.pos.x, z: u.pos.z };
    this.events.onWhistle?.(reason);
  }

  // Схватка один на один в ближайшем круге: остальные ждут за кругом
  _startDuel(x) {
    const cx = RULES.duelCircles.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const R = RULES.duelRadius;
    const duelists = [];
    for (const team of TEAMS) {
      const mine = this.riders.filter((r) => r.teamId === team.id && !(r.penalty > 0));
      if (!mine.length) continue;
      const d = mine.find((r) => r.isHuman) ?? mine.reduce((a, b) => (Math.abs(a.pos.x - cx) < Math.abs(b.pos.x - cx) ? a : b));
      duelists.push(d);
      const dir = team.attackDir;
      let k = 0;
      for (const r of mine) {
        const h = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (r === d) r.place(cx - dir * 6, 0, h);
        else {
          r.place(cx - dir * (R + 8 + k * 3), (k % 2 ? 1 : -1) * (7 + k * 3), h);
          k++;
        }
        r.frozen = true;
        r.mustRelease = false;
      }
    }
    this.ulak.reset(cx, 0, 0.6);
    this.duel = { x: cx, z: 0, r: R, t: 0, riders: duelists };
    this.looseT = 0;
    this.state = 'countdown';
    this.timer = 2;
    this._lastCount = 0;
    this.events.onDuel?.(duelists);
  }

  // Нарушение: всадник удаляется на штрафное время, команда играет в меньшинстве
  foul(r, kind) {
    if (r.penalty > 0) return;
    if (this.tug && (this.tug.holder === r || this.tug.rival === r)) this._endTug();
    if (r.hasUlak) this.ulak.release(new THREE.Vector3(r.pos.x, 1.2, r.pos.z), new THREE.Vector3(), r);
    r.fouls = (r.fouls || 0) + 1;
    // повторное нарушение наказывается строже (по правилам — 3 минуты вместо 2)
    const dur = this.penaltyTime * (r.fouls > 1 ? 1.5 : 1);
    const spot = this.riders.filter((o) => o.penalty > 0).length;
    r.place(-r.team.attackDir * (8 + spot * 4), FIELD.width / 2 + FIELD.margin - 1.6, Math.PI);
    r.penalty = dur;
    r.frozen = true;
    this.events.onFoul?.(r, kind, dur);
  }

  update(dt) {
    switch (this.state) {
      case 'countdown': {
        this.timer -= dt;
        const n = Math.ceil(this.timer);
        if (n !== this._lastCount && n > 0) {
          this._lastCount = n;
          this.events.onCountdown?.(n);
        }
        if (this.timer <= 0) {
          this.state = 'playing';
          for (const r of this.riders) if (!(r.penalty > 0)) r.frozen = false;
          this.events.onStart?.();
        }
        break;
      }
      case 'playing':
        // штрафники отбывают время и возвращаются с боковой линии
        for (const r of this.riders) {
          if (!(r.penalty > 0)) continue;
          r.penalty -= dt;
          if (r.penalty <= 0) {
            r.penalty = 0;
            r.place(r.pos.x, FIELD.width / 2 - 3, Math.PI);
            r.frozen = false;
            this.events.onPenaltyEnd?.(r);
          }
        }
        if (this.duel) {
          this.duel.t += dt;
          const u = this.ulak.pos;
          if (Math.hypot(u.x - this.duel.x, u.z - this.duel.z) > this.duel.r || this.duel.t > RULES.duelTime) {
            this.duel = null;
            this.events.onDuelEnd?.();
          }
        }
        if (this.overtime) {
          // дополнительное время: играем до первого гола
          this.overtimeLeft -= dt;
          if (this.overtimeLeft <= 0) this._finish();
          break;
        }
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          this._endPeriod();
        }
        break;
      case 'goal':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.overtime) this._finish();
          else this.kickoff();
        }
        break;
      case 'break':
        this.timer -= dt;
        if (this.timer <= 0) {
          // после каждого периода команды меняются казанами
          this._swapSides();
          if (this._pending === 'overtime') {
            this.overtime = true;
            this.overtimeLeft = Math.max(30, this.duration * RULES.overtimeShare);
            this.events.onOvertime?.();
          } else {
            this.period++;
            this.time = this.periodTime;
          }
          this.kickoff();
        }
        break;
      case 'whistle':
        this.timer -= dt;
        if (this.timer <= 0) this._startDuel(this._pending.x);
        break;
      default:
        break;
    }

    if (this.state === 'idle') return;

    if (this.state === 'playing') {
      for (const b of this.brains) {
        if (b.rider.isHuman || b.rider.penalty > 0 || !this.riders.includes(b.rider)) continue;
        b.think(dt, this);
      }
    } else {
      for (const b of this.brains) if (!b.rider.isHuman) b.idle();
    }

    for (const r of this.riders) r.step(dt);
    this._collide(dt);
    if (this.state === 'playing') this._ulakRules(dt);
    for (const r of this.riders) {
      r.prevAction = r.controls.action;
      r.prevPass = r.controls.pass;
      r.prevFeint = r.controls.feint;
    }

    this.physics.syncRiders();
    this.ulak.preStep(dt);
    this.physics.step(dt);
    const scoredAt = this.ulak.postStep();
    if (this.state !== 'playing') return;

    if (scoredAt) {
      // казан на стороне s атакует команда с attackDir === s
      const team = TEAMS.find((t) => t.attackDir === scoredAt);
      this.score[team.id]++;
      this.state = 'goal';
      this.timer = 3.2;
      this.duel = null;
      this.events.onGoal?.(team, this.ulak.lastHolder, this.score);
      return;
    }

    // аут: улак (не всадник) пересёк линию поля
    const u = this.ulak.pos;
    if (Math.abs(u.x) > FIELD.length / 2 + 0.3 || Math.abs(u.z) > FIELD.width / 2 + 0.3) {
      this._whistle('out');
      return;
    }
    // улак слишком долго лежит без хозяина
    if (!this.ulak.holder && !this.duel && !this.ulak.inKazan && this.ulak.resting) {
      this.looseT += dt;
      if (this.looseT > RULES.looseTime) this._whistle('loose');
    } else if (this.ulak.holder) this.looseT = 0;
  }

  _collide(dt) {
    const rs = this.riders;
    const L = HORSE.bodyHalfLength;
    const R = HORSE.bodyRadius;
    const m = HORSE.mass;
    const I = HORSE.inertia;

    // всадник — всадник: корпуса коней — капсулы вдоль курса
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        if (Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) > 2 * (L + R)) continue;
        const afx = Math.sin(a.heading) * L;
        const afz = Math.cos(a.heading) * L;
        const bfx = Math.sin(b.heading) * L;
        const bfz = Math.cos(b.heading) * L;
        const c = closestSegSeg(
          a.pos.x - afx, a.pos.z - afz, a.pos.x + afx, a.pos.z + afz,
          b.pos.x - bfx, b.pos.z - bfz, b.pos.x + bfx, b.pos.z + bfz,
        );
        let nx = c.x2 - c.x1;
        let nz = c.z2 - c.z1;
        let d = Math.hypot(nx, nz);
        if (d >= 2 * R) continue;
        if (d < 1e-4) {
          nx = b.pos.x - a.pos.x;
          nz = b.pos.z - a.pos.z;
          d = Math.hypot(nx, nz) || 1;
          nx /= d;
          nz /= d;
          d = 0;
        } else {
          nx /= d;
          nz /= d;
        }
        // разводим корпуса
        const pen = (2 * R - d) / 2;
        a.pos.x -= nx * pen;
        a.pos.z -= nz * pen;
        b.pos.x += nx * pen;
        b.pos.z += nz * pen;

        // скорости точек контакта с учётом вращения: v + ω·(r_z, −r_x)
        const rax = c.x1 - a.pos.x;
        const raz = c.z1 - a.pos.z;
        const rbx = c.x2 - b.pos.x;
        const rbz = c.z2 - b.pos.z;
        const rvx = b.vel.x + b.turn * rbz - (a.vel.x + a.turn * raz);
        const rvz = b.vel.z - b.turn * rbx - (a.vel.z - a.turn * rax);
        const vn = rvx * nx + rvz * nz;
        if (vn > -0.05) continue;
        const ka = raz * nx - rax * nz;
        const kb = rbz * nx - rbx * nz;
        const jn = (-(1 + HORSE.restitution) * vn) / (2 / m + (ka * ka) / I + (kb * kb) / I);
        // трение вдоль касательной: бока коней «цепляются»
        const tx = -nz;
        const tz = nx;
        const vt = rvx * tx + rvz * tz;
        const jt = THREE.MathUtils.clamp((-vt * m) / 2, -HORSE.friction * jn, HORSE.friction * jn);
        const jx = jn * nx + jt * tx;
        const jz = jn * nz + jt * tz;
        // таран — запрещённый приём: удар носом на скорости в бок соперника
        if (this.state === 'playing' && a.teamId !== b.teamId && -vn > RULES.ramSpeed) {
          const alongA = (rax * afx + raz * afz) / (L * L);
          const alongB = (rbx * bfx + rbz * bfz) / (L * L);
          const aInto = a.vel.x * nx + a.vel.z * nz;
          const bInto = -(b.vel.x * nx + b.vel.z * nz);
          if (alongA > 0.75 && Math.abs(alongB) < 0.6 && aInto > bInto + 3) this._ramBy = a;
          else if (alongB > 0.75 && Math.abs(alongA) < 0.6 && bInto > aInto + 3) this._ramBy = b;
        }
        const dva = a.applyImpulse(-jx, -jz, rax, raz);
        const dvb = b.applyImpulse(jx, jz, rbx, rbz);
        if (-vn > 2.5) this.events.onImpact?.(a, b, -vn, (c.x1 + c.x2) / 2, (c.z1 + c.z2) / 2);
        // сильный удар соперника выбивает улак из рук
        if (this.state === 'playing' && a.teamId !== b.teamId) {
          if (a.hasUlak && dva > ULAK.fumbleHit * a.skills.grip) this._fumbleBy = [a, b];
          else if (b.hasUlak && dvb > ULAK.fumbleHit * b.skills.grip) this._fumbleBy = [b, a];
        }
      }
    }

    if (this._fumbleBy) {
      const [h, by] = this._fumbleBy;
      this._fumbleBy = null;
      if (h.hasUlak && !(h.stealImmunity > 0.9)) this._fumble(h, by);
    }
    if (this._ramBy) {
      const r = this._ramBy;
      this._ramBy = null;
      this.foul(r, 'ram');
    }

    // во время «жекеме-жеке» остальные всадники не входят в круг
    if (this.duel) {
      const lim = this.duel.r + 2;
      for (const r of rs) {
        if (this.duel.riders.includes(r) || r.penalty > 0) continue;
        const dx = r.pos.x - this.duel.x;
        const dz = r.pos.z - this.duel.z;
        const d = Math.hypot(dx, dz);
        if (d < lim && d > 1e-3) {
          r.pos.x = this.duel.x + (dx / d) * lim;
          r.pos.z = this.duel.z + (dz / d) * lim;
          const vn = (r.vel.x * dx + r.vel.z * dz) / d;
          if (vn < 0) {
            r.vel.x -= (vn * dx) / d;
            r.vel.z -= (vn * dz) / d;
            r.speed *= 0.9;
          }
        }
      }
    }

    // казаны и борта: проверяем нос, середину и круп
    const bx = FIELD.length / 2 + FIELD.margin - R;
    const bz = FIELD.width / 2 + FIELD.margin - R;
    const kr = KAZAN.outerR + R * 0.7;
    for (const r of rs) {
      const fx = Math.sin(r.heading);
      const fz = Math.cos(r.heading);
      for (const o of [L, 0, -L]) {
        const ox = fx * o;
        const oz = fz * o;
        for (const s of [-1, 1]) {
          const dx = r.pos.x + ox - s * KAZAN.x;
          const dz = r.pos.z + oz;
          const d = Math.hypot(dx, dz);
          if (d < kr && d > 1e-4) this._hitStatic(r, dx / d, dz / d, kr - d, ox, oz);
        }
        const px = r.pos.x + ox;
        const pz = r.pos.z + oz;
        if (Math.abs(px) > bx) this._hitStatic(r, -Math.sign(px), 0, Math.abs(px) - bx, ox, oz);
        if (Math.abs(pz) > bz) this._hitStatic(r, 0, -Math.sign(pz), Math.abs(pz) - bz, ox, oz);
      }
    }
  }

  // Контакт с неподвижным препятствием: нормаль (nx, nz) смотрит от препятствия
  _hitStatic(r, nx, nz, pen, ox, oz) {
    r.pos.x += nx * pen;
    r.pos.z += nz * pen;
    const vn = (r.vel.x + r.turn * oz) * nx + (r.vel.z - r.turn * ox) * nz;
    if (vn >= 0) return;
    const k = oz * nx - ox * nz;
    const j = (-(1 + 0.05) * vn) / (1 / HORSE.mass + (k * k) / HORSE.inertia);
    const dv = r.applyImpulse(j * nx, j * nz, ox, oz);
    if (dv > 2.5) this.events.onImpact?.(r, null, dv, r.pos.x + ox, r.pos.z + oz);
  }

  // Улак выбит ударом: падает рядом, сохраняя часть хода всадника
  _fumble(h, by) {
    if (this.tug) this._endTug();
    const pos = new THREE.Vector3(h.pos.x - Math.cos(h.heading) * 0.6, 1.3, h.pos.z + Math.sin(h.heading) * 0.6);
    const vel = new THREE.Vector3(
      h.vel.x * 0.55 + (Math.random() - 0.5) * 3,
      1.5 + Math.random() * 1.5,
      h.vel.z * 0.55 + (Math.random() - 0.5) * 3,
    );
    this.ulak.release(pos, vel, h);
    h.charging = false;
    h.charge = 0;
    h.grabCooldown = 1.1;
    if (by) by.grabCooldown = Math.max(by.grabCooldown, 0.35);
    this.events.onFumble?.(h, by);
  }

  // Кони на ходу задевают лежащий улак копытами и отбрасывают его
  _hoofKick(dt) {
    const u = this.ulak;
    this._kickCd = Math.max(0, (this._kickCd || 0) - dt);
    if (this._kickCd > 0 || u.holder || u.inKazan || u.pos.y > 0.55 || u.lockTime > 0) return;
    const L = HORSE.bodyHalfLength + 0.2;
    for (const r of this.riders) {
      if (r.penalty > 0) continue;
      const sp = Math.hypot(r.vel.x, r.vel.z);
      if (sp < ULAK.kickSpeed) continue;
      // расстояние от улака до оси корпуса коня
      const fx = Math.sin(r.heading);
      const fz = Math.cos(r.heading);
      const dx = u.pos.x - r.pos.x;
      const dz = u.pos.z - r.pos.z;
      const along = THREE.MathUtils.clamp(dx * fx + dz * fz, -L, L);
      const d = Math.hypot(dx - fx * along, dz - fz * along);
      if (d > 0.5) continue;
      const k = 0.3 + Math.random() * 0.3;
      const side = (Math.random() - 0.5) * sp * 0.35;
      u.kick(r.vel.x * k + fz * side, 1.2 + Math.random() * 1.6, r.vel.z * k - fx * side);
      this._kickCd = 0.45;
      this.looseT = Math.max(0, this.looseT - 2);
      this.events.onKick?.(r, sp);
      return;
    }
  }

  _ulakRules(dt) {
    const ulak = this.ulak;
    const n = this.riders.length;
    if (this.tug) this._tugStep(dt);
    this._order = (this._order + 1) % n; // чтобы никто не имел приоритета при одновременном подборе
    for (let k = 0; k < n; k++) {
      const r = this.riders[(k + this._order) % n];
      if (r.penalty > 0) continue;
      const action = r.controls.action;
      if (r.mustRelease && !action) r.mustRelease = false;
      if (r.controls.feint && !r.prevFeint) this._feint(r);

      if (r.hasUlak && r.controls.pass && !r.prevPass && !r.charging) {
        const mate = this._passTarget(r);
        if (mate) {
          this._pass(r, mate);
          continue;
        }
      }

      if (r.hasUlak) {
        if (action && !r.mustRelease) {
          r.charging = true;
          r.charge = Math.min(1, r.charge + dt / ULAK.chargeTime);
        } else if (r.charging) {
          this._throw(r);
        }
        continue;
      }

      // боты хватают автоматически, человек — пробелом; адресат паса ловит сам
      // (на отбор бот идёт не мгновенно — у него есть время реакции, см. BotBrain)
      const wantGrab = r.isHuman && ulak.passTo !== r ? action : !ulak.holder || r.botSteal !== false;
      if (!wantGrab || r.grabCooldown > 0) continue;
      const dx = ulak.pos.x - r.pos.x;
      const dz = ulak.pos.z - r.pos.z;
      const d = Math.hypot(dx, dz);

      if (!ulak.holder) {
        // на скорости дотянуться труднее; быстро летящую тушу не поймать (кроме адресованного паса)
        const sp = Math.hypot(r.vel.x, r.vel.z);
        const fast = THREE.MathUtils.clamp((sp - 6) / (HORSE.sprintSpeed - 6), 0, 1);
        const isPass = ulak.passTo === r;
        const reach = isPass ? ULAK.pickupDist + 0.4 : THREE.MathUtils.lerp(ULAK.pickupDist, ULAK.pickupDistFast, fast);
        const rel = Math.hypot(ulak.vel.x - r.vel.x, ulak.vel.y, ulak.vel.z - r.vel.z);
        const catchable = isPass || ulak.pos.y < 0.7 || rel < ULAK.catchMaxSpeed;
        if (d < reach && catchable && ulak.pos.y < ULAK.pickupMaxY && ulak.lockedFor !== r && !ulak.inKazan) {
          ulak.attach(r);
          r.mustRelease = true;
          r.stealImmunity = 1.2;
          this.events.onPickup?.(r);
        }
      } else if (!this.tug && ulak.holder.teamId !== r.teamId && d < ULAK.stealDist + 0.6) {
        const holder = ulak.holder;
        if (holder.stealImmunity > 0) continue;
        // схватился за улак — начинается борьба («тартыш»)
        this.tug = { holder, rival: r, t: 0, score: 0, bias: (Math.random() - 0.5) * 1.2, quiz: false, heaveT: 0.15 };
        holder.inTug = r.inTug = true;
        holder.tugWith = r;
        r.tugWith = holder;
        ulak.tugRival = r;
        ulak.tugShift = 0.3;
        // математическая дуэль: исход решает пример (если участвует игрок)
        if (this.mathDuel?.(holder, r)) this.tug.quiz = true;
        this.events.onTug?.(holder, r);
      }
    }
    this._hoofKick(dt);
  }

  // Лучший адресат паса: напарник впереди, не слишком близко и не слишком далеко
  _passTarget(r) {
    const dir = r.team.attackDir;
    let best = null;
    let bestScore = Infinity;
    for (const m of this.riders) {
      if (m === r || m.teamId !== r.teamId || m.penalty > 0) continue;
      const d = Math.hypot(m.pos.x - r.pos.x, m.pos.z - r.pos.z);
      if (d < 4 || d > 42) continue;
      const score = d - (m.pos.x - r.pos.x) * dir * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // Пас: навесная передача в точку, где напарник окажется через время полёта
  _pass(r, mate) {
    if (this.tug) {
      this.tug.rival.grabCooldown = 0.8;
      this._endTug();
    }
    const o = r.throwOrigin();
    const d = Math.hypot(mate.pos.x - o.x, mate.pos.z - o.z);
    const t = THREE.MathUtils.clamp(d / 15, 0.45, 1.6);
    const tx = mate.pos.x + mate.vel.x * t * 0.9;
    const tz = mate.pos.z + mate.vel.z * t * 0.9;
    const vel = new THREE.Vector3((tx - o.x) / t, (1.7 - o.y + 0.5 * GRAVITY * t * t) / t, (tz - o.z) / t);
    this.ulak.release(o, vel, r);
    this.ulak.passTo = mate;
    this.ulak.passTime = t + 1.2;
    r.charging = false;
    r.charge = 0;
    r.grabCooldown = 0.6;
    r.stamina = Math.max(0, r.stamina - STAMINA.passCost);
    r.rider.playThrow();
    this.events.onPass?.(r, mate);
  }

  // Финт: резкий уход в сторону. Сбивает соперника с захвата, но стоит выносливости
  _feint(r) {
    if (r.feintCooldown > 0 || r.stamina < 0.18 || r.stagger > 0) return;
    const steer = r.controls.steer;
    const side = Math.abs(steer) > 0.2 ? Math.sign(steer) : Math.random() < 0.5 ? -1 : 1;
    // «влево» в системе всадника — это +X: (cos h, −sin h)
    const lx = Math.cos(r.heading) * side;
    const lz = -Math.sin(r.heading) * side;
    r.vel.x += lx * 6.5;
    r.vel.z += lz * 6.5;
    r.turn += side * 0.9;
    r.stamina -= 0.18;
    r.feintCooldown = 1.6;
    r.stealImmunity = Math.max(r.stealImmunity, 0.7);
    r.jolt = Math.max(r.jolt, 0.4);
    if (this.tug) {
      if (this.tug.holder === r) this.tug.score -= 0.35;
      else if (this.tug.rival === r) this.tug.score += 0.3;
    }
    this.events.onFeint?.(r);
  }

  _endTug() {
    if (!this.tug) return;
    this.tug.holder.inTug = this.tug.rival.inTug = false;
    this.tug.holder.tugWith = this.tug.rival.tugWith = null;
    this.ulak.tugRival = null;
    this.tug = null;
  }

  // Борьба за улак: всадники идут связкой, исход решают выносливость, рывок и доля случая
  _tugStep(dt) {
    const tug = this.tug;
    if (tug.quiz) return; // ждём ответа в математической дуэли
    const h = tug.holder;
    const r = tug.rival;
    if (!h.hasUlak) {
      this._endTug();
      return;
    }
    let nx = r.pos.x - h.pos.x;
    let nz = r.pos.z - h.pos.z;
    const d = Math.hypot(nx, nz) || 1;
    nx /= d;
    nz /= d;
    if (d > ULAK.stealDist + 2.4) {
      // оторвался — улак остаётся у хозяина
      this._endTug();
      r.grabCooldown = 1.6;
      h.stealImmunity = 1.4;
      this.events.onTugEnd?.(h, r, false);
      return;
    }
    // руки и туша связывают всадников: тянет друг к другу и гасит ход
    const pull = THREE.MathUtils.clamp((d - 1.5) * 4, 0, 11);
    h.vel.x += nx * pull * dt;
    h.vel.z += nz * pull * dt;
    r.vel.x -= nx * pull * dt;
    r.vel.z -= nz * pull * dt;
    const drag = Math.exp(-dt * 0.8);
    h.speed *= drag;
    r.speed *= drag;
    h.stamina = Math.max(0, h.stamina - 0.1 * dt);
    r.stamina = Math.max(0, r.stamina - 0.1 * dt);
    h.jolt = Math.max(h.jolt, 0.35);
    r.jolt = Math.max(r.jolt, 0.35);

    // исход решают сила всадника, хват, выносливость и рывок
    const sH = (1 + 0.6 * h.stamina + (h.sprinting ? 0.35 : 0)) * h.skills.grip;
    const sR =
      (0.86 + 0.6 * r.stamina + (r.sprinting ? 0.35 : 0) + (r.isHuman && r.controls.action ? 0.3 : 0) + (h.charging ? 0.3 : 0)) *
      r.skills.power;
    tug.score += (sR - sH + tug.bias) * dt;
    tug.t += dt;
    // туша ползёт к тому, кто пересиливает: 0 — у хозяина, 1 — у соперника
    this.ulak.tugShift = THREE.MathUtils.clamp(0.3 + (tug.score / ULAK.tugWin) * 0.55, 0.08, 0.92);

    // рывки: примерно раз в полсекунды тот, кто сейчас сильнее, дёргает тушу на себя — второго тянет к нему
    tug.heaveT -= dt;
    if (tug.heaveT <= 0) {
      tug.heaveT = ULAK.tugHeave * (0.8 + Math.random() * 0.4);
      const rivalPulls = sR - sH + tug.bias + (Math.random() - 0.5) * 0.5 > 0;
      const a = rivalPulls ? r : h; // кто дёрнул
      const b = rivalPulls ? h : r;
      const sg = rivalPulls ? 1 : -1; // n направлен от хозяина к сопернику; того, кого дёрнули, тянет к дёрнувшему
      b.vel.x += nx * sg * 1.7;
      b.vel.z += nz * sg * 1.7;
      a.vel.x += nx * sg * 0.5;
      a.vel.z += nz * sg * 0.5;
      a.tugHeave = 1;
      b.tugHeave = -1;
      a.jolt = Math.max(a.jolt, 0.6);
      b.jolt = Math.max(b.jolt, 0.9);
      tug.score += rivalPulls ? 0.06 : -0.06;
      this.events.onTugHeave?.(a, b);
    }
    if (tug.t < ULAK.tugTime && Math.abs(tug.score) < ULAK.tugWin) return;

    this.resolveTug(tug.score > 0);
  }

  // Итог борьбы за улак (вызывается и после математической дуэли)
  resolveTug(stolen) {
    const tug = this.tug;
    if (!tug) return;
    const h = tug.holder;
    const r = tug.rival;
    this._endTug();
    if (!h.hasUlak) return;
    // последний рывок: проигравшего отбрасывает от соперника, он качается в седле
    {
      const lose = stolen ? h : r;
      const win = stolen ? r : h;
      let nx = lose.pos.x - win.pos.x;
      let nz = lose.pos.z - win.pos.z;
      const d = Math.hypot(nx, nz) || 1;
      nx /= d;
      nz /= d;
      lose.vel.x += nx * 2.4;
      lose.vel.z += nz * 2.4;
      win.vel.x -= nx * 0.8;
      win.vel.z -= nz * 0.8;
      lose.jolt = 1;
      win.jolt = Math.max(win.jolt, 0.7);
      win.tugHeave = 1;
      lose.tugRecoil = 0.7; // с — отшатнулся от рывка (см. Horseman.render)
      lose.tugRecoilFrom = win;
    }
    if (stolen) {
      h.charging = false;
      h.charge = 0;
      h.grabCooldown = 1.2;
      h.stagger = Math.max(h.stagger, 0.4);
      this.ulak.attach(r);
      r.mustRelease = true;
      r.stealImmunity = 2.2;
      this.events.onSteal?.(r, h);
    } else {
      // отбился — получает передышку, а соперник на пару секунд отстаёт
      h.stealImmunity = 2.4;
      r.grabCooldown = 2.2;
      r.stagger = Math.max(r.stagger, 0.45);
    }
    this.events.onTugEnd?.(h, r, stolen);
  }

  _throw(r) {
    if (this.tug) {
      this.tug.rival.grabCooldown = 0.8;
      this._endTug();
    }
    const vel = r.throwVelocity(r.charge, undefined, true);
    const pos = r.throwOrigin();
    this.ulak.release(pos, vel, r);
    // бросок тяжёлой туши отнимает силы — тем больше, чем сильнее замах
    r.stamina = Math.max(0, r.stamina - STAMINA.throwCost - STAMINA.throwCostCharge * r.charge);
    r.charging = false;
    r.charge = 0;
    r.grabCooldown = 0.5;
    r.rider.playThrow();
    this.events.onThrow?.(r);
  }
}
