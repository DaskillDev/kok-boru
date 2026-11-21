import * as THREE from 'three';
import { FIELD, KAZAN, HORSE, ULAK, MATCH_TIME, TEAMS, GRAVITY } from '../config.js';

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
    this.events = events; // колбэки: onGoal, onSteal, onPickup, onThrow, onCountdown, onStart, onEnd
    this.state = 'idle'; // idle | countdown | playing | goal | over
    this.score = [0, 0];
    this.duration = MATCH_TIME;
    this.time = MATCH_TIME;
    this.timer = 0;
    this._order = 0;
    this.tug = null; // { holder, rival, t, score, bias } — текущая борьба за улак
    this.goldenGoal = true; // при ничьей — минута до первого гола
    this.overtime = false;
    this.overtimeLeft = 0;
  }

  // Состав и длительность следующего матча
  configure(riders, duration = MATCH_TIME) {
    this.riders = riders;
    this.duration = duration;
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
    this.time = this.duration;
    this.kickoff();
  }

  kickoff() {
    const perTeam = [0, 0];
    const size = this.riders.length / 2;
    for (const r of this.riders) {
      const i = perTeam[r.teamId]++;
      const dir = r.team.attackDir;
      // шеренга в шахматном порядке на своей половине
      const z = (i - (size - 1) / 2) * 8;
      r.place(-dir * (13 + (i % 2) * 6), z, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      r.frozen = true;
      r.mustRelease = false;
    }
    this._endTug();
    this.ulak.reset(0, 0, 5);
    this.state = 'countdown';
    this.timer = 3;
    this._lastCount = 0;
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
          for (const r of this.riders) r.frozen = false;
          this.events.onStart?.();
        }
        break;
      }
      case 'playing':
        if (this.overtime) {
          // дополнительное время: играем до первого гола
          this.overtimeLeft -= dt;
          if (this.overtimeLeft <= 0) this._finish();
          break;
        }
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          if (this.goldenGoal && this.score[0] === this.score[1]) {
            this.overtime = true;
            this.overtimeLeft = 60;
            this.events.onOvertime?.();
          } else this._finish();
        }
        break;
      case 'goal':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.overtime) this._finish();
          else this.kickoff();
        }
        break;
      default:
        break;
    }

    if (this.state === 'idle') return;

    if (this.state === 'playing') {
      for (const b of this.brains) {
        if (b.rider.isHuman || !this.riders.includes(b.rider)) continue;
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
    if (scoredAt && this.state === 'playing') {
      // казан на стороне s атакует команда с attackDir === s
      const team = TEAMS.find((t) => t.attackDir === scoredAt);
      this.score[team.id]++;
      this.state = 'goal';
      this.timer = 3.2;
      this.events.onGoal?.(team, this.ulak.lastHolder, this.score);
    }
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
        a.applyImpulse(-jx, -jz, rax, raz);
        b.applyImpulse(jx, jz, rbx, rbz);
        if (-vn > 2.5) this.events.onImpact?.(a, b, -vn, (c.x1 + c.x2) / 2, (c.z1 + c.z2) / 2);
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

  _ulakRules(dt) {
    const ulak = this.ulak;
    const n = this.riders.length;
    if (this.tug) this._tugStep(dt);
    this._order = (this._order + 1) % n; // чтобы никто не имел приоритета при одновременном подборе
    for (let k = 0; k < n; k++) {
      const r = this.riders[(k + this._order) % n];
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
      const wantGrab = r.isHuman && ulak.passTo !== r ? action : true;
      if (!wantGrab || r.grabCooldown > 0) continue;
      const dx = ulak.pos.x - r.pos.x;
      const dz = ulak.pos.z - r.pos.z;
      const d = Math.hypot(dx, dz);

      if (!ulak.holder) {
        if (d < ULAK.pickupDist && ulak.pos.y < ULAK.pickupMaxY && ulak.lockedFor !== r && !ulak.inKazan) {
          ulak.attach(r);
          r.mustRelease = true;
          r.stealImmunity = 0.9;
          this.events.onPickup?.(r);
        }
      } else if (!this.tug && ulak.holder.teamId !== r.teamId && d < ULAK.stealDist + 0.9) {
        const holder = ulak.holder;
        if (holder.stealImmunity > 0) continue;
        // схватился за улак — начинается борьба («тартыш»)
        this.tug = { holder, rival: r, t: 0, score: 0, bias: (Math.random() - 0.5) * 1.2 };
        holder.inTug = r.inTug = true;
        ulak.tugRival = r;
        this.events.onTug?.(holder, r);
      }
    }
  }

  // Лучший адресат паса: напарник впереди, не слишком близко и не слишком далеко
  _passTarget(r) {
    const dir = r.team.attackDir;
    let best = null;
    let bestScore = Infinity;
    for (const m of this.riders) {
      if (m === r || m.teamId !== r.teamId) continue;
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
      if (this.tug.holder === r) this.tug.score -= 0.45;
      else if (this.tug.rival === r) this.tug.score += 0.3;
    }
    this.events.onFeint?.(r);
  }

  _endTug() {
    if (!this.tug) return;
    this.tug.holder.inTug = this.tug.rival.inTug = false;
    this.ulak.tugRival = null;
    this.tug = null;
  }

  // Борьба за улак: всадники идут связкой, исход решают выносливость, рывок и доля случая
  _tugStep(dt) {
    const tug = this.tug;
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
      r.grabCooldown = 1.0;
      h.stealImmunity = 0.7;
      this.events.onTugEnd?.(h, r, false);
      return;
    }
    // руки и туша связывают всадников: тянет друг к другу и гасит ход
    const pull = THREE.MathUtils.clamp((d - 1.5) * 3.2, 0, 7);
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

    const sH = 1 + 0.6 * h.stamina + (h.sprinting ? 0.35 : 0);
    const sR =
      0.95 +
      0.6 * r.stamina +
      (r.sprinting ? 0.35 : 0) +
      (r.isHuman && r.controls.action ? 0.3 : 0) +
      (h.charging ? 0.3 : 0);
    tug.score += (sR - sH + tug.bias) * dt;
    tug.t += dt;
    if (tug.t < ULAK.tugTime && Math.abs(tug.score) < 0.6) return;

    const stolen = tug.score > 0;
    this._endTug();
    if (stolen) {
      h.charging = false;
      h.charge = 0;
      h.grabCooldown = 1.2;
      h.stagger = Math.max(h.stagger, 0.4);
      this.ulak.attach(r);
      r.mustRelease = true;
      r.stealImmunity = 1.6;
      this.events.onSteal?.(r, h);
    } else {
      h.stealImmunity = 1.3;
      r.grabCooldown = 1.4;
      r.stagger = Math.max(r.stagger, 0.35);
    }
    this.events.onTugEnd?.(h, r, stolen);
  }

  _throw(r) {
    if (this.tug) {
      this.tug.rival.grabCooldown = 0.8;
      this._endTug();
    }
    const vel = r.throwVelocity(r.charge);
    const pos = r.throwOrigin();
    this.ulak.release(pos, vel, r);
    r.charging = false;
    r.charge = 0;
    r.grabCooldown = 0.5;
    r.rider.playThrow();
    this.events.onThrow?.(r);
  }
}
