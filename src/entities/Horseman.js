import * as THREE from 'three';
import { HORSE, STAMINA, ULAK, TEAMS } from '../config.js';
import { HorseModel } from './HorseModel.js';
import { RiderFigure, createTack } from './RiderFigure.js';

// Пустой набор команд управления. Его заполняет либо клавиатура, либо ИИ,
// а позже — сеть: сущность не знает, кто ей управляет.
export function makeControls() {
  return { throttle: 0, steer: 0, sprint: false, action: false };
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Horseman {
  constructor({ id, teamId, name, coat, isHuman = false }) {
    this.id = id;
    this.teamId = teamId;
    this.team = TEAMS[teamId];
    this.name = name;
    this.isHuman = isHuman;

    // --- симуляция ---
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0; // 0 → смотрит на +Z; вперёд = (sin h, 0, cos h)
    this.speed = 0;
    this.turn = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.sprinting = false;
    this.controls = makeControls();
    this.prevAction = false;
    this.frozen = false;

    // --- улак ---
    this.hasUlak = false;
    this.charging = false;
    this.charge = 0;
    this.mustRelease = false; // после подбора нужно отпустить пробел, прежде чем замахиваться
    this.grabCooldown = 0;
    this.stealImmunity = 0;

    // --- визуал ---
    this.group = new THREE.Group();
    this.tilt = new THREE.Group(); // крен в повороте
    this.group.add(this.tilt);
    this.horse = new HorseModel(coat);
    this.tilt.add(this.horse.mesh);
    this.seat = new THREE.Group(); // следует за спиной коня
    this.tilt.add(this.seat);
    this.seat.add(createTack(this.team));
    this.rider = new RiderFigure(this.team);
    this.rider.group.position.y = 0.12;
    this.seat.add(this.rider.group);
    // точка, где висит улак (у правого стремени)
    this.carryAnchor = new THREE.Object3D();
    this.carryAnchor.position.set(0.62, -0.42, 0.18);
    this.seat.add(this.carryAnchor);

    if (isHuman) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.25, 1.45, 48),
        new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      this.group.add(ring);
    }
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.speed = 0;
    this.turn = 0;
    this.charging = false;
    this.charge = 0;
    this.hasUlak = false;
    this.grabCooldown = 0;
    this.stealImmunity = 0;
  }

  // Шаг симуляции движения
  step(dt) {
    const c = this.frozen ? { throttle: 0, steer: 0, sprint: false, action: false } : this.controls;

    // выносливость
    const wantsSprint = c.sprint && c.throttle > 0.1 && !this.exhausted;
    this.sprinting = wantsSprint && this.stamina > 0;
    if (this.sprinting) {
      this.stamina -= STAMINA.drain * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.sprinting = false;
      }
    } else {
      const r = Math.abs(this.speed) < 2 ? STAMINA.regenIdle : STAMINA.regen;
      this.stamina = Math.min(1, this.stamina + r * dt);
      if (this.exhausted && this.stamina >= STAMINA.exhaustedUntil) this.exhausted = false;
    }

    // разгон / торможение
    let max = this.sprinting ? HORSE.sprintSpeed : HORSE.runSpeed;
    if (this.hasUlak) max *= HORSE.carrySpeedFactor;
    if (this.charging) max *= 0.85;
    let target = 0;
    if (c.throttle > 0) target = c.throttle * max;
    else if (c.throttle < 0) target = -HORSE.reverseSpeed;
    if (this.exhausted) max *= 0.88; // загнанный конь идёт тяжелее
    let rate;
    // тяга падает с ростом скорости: с места конь берёт резво, к пределу — всё медленнее
    const pull = THREE.MathUtils.clamp(1.3 - Math.abs(this.speed) / max, 0.3, 1.3);
    if (target > this.speed)
      rate = this.speed < 0 ? HORSE.brake : (this.sprinting ? HORSE.sprintAccel : HORSE.accel) * pull;
    else rate = c.throttle < 0 && this.speed > 0 ? HORSE.brake : c.throttle === 0 ? HORSE.coast : HORSE.accel;
    const ds = target - this.speed;
    this.speed += Math.sign(ds) * Math.min(Math.abs(ds), rate * dt);

    // поворот: на скорости конь поворачивает шире
    // предел бокового ускорения: ω ≤ a / v
    const v = Math.abs(this.speed);
    const turnRate = Math.min(HORSE.turnRateSlow, HORSE.lateralAccel / Math.max(v, 1));
    // крутой поворот на скорости «съедает» ход
    this.speed -= Math.sign(this.speed) * Math.abs(this.turn) * v * HORSE.turnDrag * dt;
    const targetTurn = c.steer * turnRate * (this.speed < -0.2 ? -1 : 1);
    this.turn += (targetTurn - this.turn) * (1 - Math.exp(-dt * 7));
    this.heading = wrapPi(this.heading + this.turn * dt);

    // инерция: вектор скорости «догоняет» направление коня
    const fx = Math.sin(this.heading) * this.speed;
    const fz = Math.cos(this.heading) * this.speed;
    const g = 1 - Math.exp(-dt * HORSE.grip);
    this.vel.x += (fx - this.vel.x) * g;
    this.vel.z += (fz - this.vel.z) * g;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    this.stealImmunity = Math.max(0, this.stealImmunity - dt);
  }

  // Столкновение гасит скорость
  bump(factor = 0.6) {
    this.speed *= factor;
  }

  // Обновление визуала
  render(dt) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    const groundSpeed = Math.hypot(this.vel.x, this.vel.z) * Math.sign(this.speed || 1);
    this.horse.update(dt, groundSpeed);

    const bank = THREE.MathUtils.clamp(-this.turn * Math.abs(this.speed) * 0.014, -0.3, 0.3);
    this.tilt.rotation.z += (bank - this.tilt.rotation.z) * (1 - Math.exp(-dt * 8));

    const back = this.horse.sampleBack();
    this.seat.position.set(0, back.y - 0.01, back.z + 0.12);
    this.seat.rotation.x = back.pitch * 0.7;
    // всадник не наследует весь наклон спины — корпус держит вертикаль
    this.rider.group.rotation.x = -back.pitch * 0.45;

    this.rider.update(dt, {
      carrying: this.hasUlak,
      charge: this.charging ? this.charge : -1,
      speed01: THREE.MathUtils.clamp(Math.abs(this.speed) / HORSE.sprintSpeed, 0, 1),
      turn: this.turn,
    });
  }

  // Параметры броска при заданной силе замаха (0..1)
  throwVelocity(charge, out = new THREE.Vector3()) {
    const h = THREE.MathUtils.lerp(ULAK.minThrowH, ULAK.maxThrowH, charge);
    const v = THREE.MathUtils.lerp(ULAK.minThrowV, ULAK.maxThrowV, charge);
    out.set(Math.sin(this.heading) * h, v, Math.cos(this.heading) * h);
    out.x += this.vel.x * ULAK.carrierInherit;
    out.z += this.vel.z * ULAK.carrierInherit;
    return out;
  }

  throwOrigin(out = new THREE.Vector3()) {
    return out.set(
      this.pos.x + Math.sin(this.heading) * 0.6 + Math.cos(this.heading) * 0.35,
      ULAK.releaseHeight,
      this.pos.z + Math.cos(this.heading) * 0.6 - Math.sin(this.heading) * 0.35,
    );
  }
}
