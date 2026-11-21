import { FIELD, KAZAN, HORSE, ULAK, MATCH_TIME, TEAMS } from '../config.js';

// Правила матча: таймер, счёт, розыгрыш, подбор/отбор/бросок улака, столкновения.
// Не зависит от рендера и ввода — работает только с сущностями и их controls,
// поэтому позже тот же код можно крутить на сервере.

export class Match {
  constructor({ riders, ulak, brains, events }) {
    this.riders = riders;
    this.ulak = ulak;
    this.brains = brains; // BotBrain[] для ботов
    this.events = events; // колбэки: onGoal, onSteal, onPickup, onThrow, onCountdown, onStart, onEnd
    this.state = 'idle'; // idle | countdown | playing | goal | over
    this.score = [0, 0];
    this.time = MATCH_TIME;
    this.timer = 0;
    this._order = 0;
  }

  start() {
    this.score = [0, 0];
    this.time = MATCH_TIME;
    this.kickoff();
  }

  kickoff() {
    const perTeam = [0, 0];
    for (const r of this.riders) {
      const i = perTeam[r.teamId]++;
      const dir = r.team.attackDir;
      r.place(-dir * 14, i === 0 ? -7 : 7, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      r.frozen = true;
      r.mustRelease = false;
    }
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
        this.time -= dt;
        if (this.time <= 0) {
          this.time = 0;
          this.state = 'over';
          for (const r of this.riders) r.frozen = true;
          this.events.onEnd?.(this.score);
        }
        break;
      case 'goal':
        this.timer -= dt;
        if (this.timer <= 0) this.kickoff();
        break;
      default:
        break;
    }

    if (this.state === 'idle') return;

    if (this.state === 'playing') {
      for (const b of this.brains) b.think(dt, this);
    } else {
      for (const b of this.brains) b.idle();
    }

    for (const r of this.riders) r.step(dt);
    this._collide(dt);
    if (this.state === 'playing') this._ulakRules(dt);
    for (const r of this.riders) r.prevAction = r.controls.action;

    const scoredAt = this.ulak.step(dt);
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
    const R = HORSE.radius;
    // всадник — всадник
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= R * 2 || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (R * 2 - d) / 2;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          // обмен импульсом вдоль нормали (неупругий)
          const k = rel * 0.6;
          a.vel.x += nx * k;
          a.vel.z += nz * k;
          b.vel.x -= nx * k;
          b.vel.z -= nz * k;
          const slow = Math.exp(-dt * 2.5);
          a.speed *= slow;
          b.speed *= slow;
        }
      }
    }
    // казаны и границы
    const bx = FIELD.length / 2 + FIELD.margin - 0.8;
    const bz = FIELD.width / 2 + FIELD.margin - 0.8;
    const kr = KAZAN.outerR + 0.75;
    for (const r of rs) {
      for (const s of [-1, 1]) {
        const dx = r.pos.x - s * KAZAN.x;
        const dz = r.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < kr && d > 1e-4) {
          const nx = dx / d;
          const nz = dz / d;
          r.pos.x = s * KAZAN.x + nx * kr;
          r.pos.z = nz * kr;
          const vn = r.vel.x * nx + r.vel.z * nz;
          if (vn < 0) {
            r.vel.x -= vn * nx;
            r.vel.z -= vn * nz;
            r.speed *= Math.exp(-dt * 3);
          }
        }
      }
      if (Math.abs(r.pos.x) > bx) {
        r.pos.x = Math.sign(r.pos.x) * bx;
        r.vel.x = 0;
        r.speed *= Math.exp(-dt * 2);
      }
      if (Math.abs(r.pos.z) > bz) {
        r.pos.z = Math.sign(r.pos.z) * bz;
        r.vel.z = 0;
        r.speed *= Math.exp(-dt * 2);
      }
    }
  }

  _ulakRules(dt) {
    const ulak = this.ulak;
    const n = this.riders.length;
    this._order = (this._order + 1) % n; // чтобы никто не имел приоритета при одновременном подборе
    for (let k = 0; k < n; k++) {
      const r = this.riders[(k + this._order) % n];
      const action = r.controls.action;
      if (r.mustRelease && !action) r.mustRelease = false;

      if (r.hasUlak) {
        if (action && !r.mustRelease) {
          r.charging = true;
          r.charge = Math.min(1, r.charge + dt / ULAK.chargeTime);
        } else if (r.charging) {
          this._throw(r);
        }
        continue;
      }

      // боты хватают автоматически, человек — пробелом
      const wantGrab = r.isHuman ? action : true;
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
      } else if (ulak.holder.teamId !== r.teamId && d < ULAK.stealDist + 0.6) {
        const holder = ulak.holder;
        r.grabCooldown = r.isHuman ? 0.6 : 1.0;
        if (holder.stealImmunity > 0) continue;
        let p = 0.45;
        if (r.sprinting) p += 0.2;
        if (holder.exhausted) p += 0.15;
        if (holder.charging) p += 0.1;
        if (Math.random() < p) {
          holder.charging = false;
          holder.charge = 0;
          holder.grabCooldown = 1.2;
          holder.bump(0.75);
          ulak.attach(r);
          r.mustRelease = true;
          r.stealImmunity = 1.6;
          this.events.onSteal?.(r, holder);
        }
      }
    }
  }

  _throw(r) {
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
