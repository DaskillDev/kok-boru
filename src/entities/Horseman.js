import * as THREE from 'three';
import { HORSE, STAMINA, ULAK, TEAMS } from '../config.js';
import { HorseModel } from './HorseModel.js';
import { RiderFigure, createTack } from './RiderFigure.js';

// Пустой набор команд управления. Его заполняет либо клавиатура, либо ИИ,
// а позже — сеть: сущность не знает, кто ей управляет.
export function makeControls() {
  return { throttle: 0, steer: 0, sprint: false, action: false, pass: false, feint: false };
}

const FROZEN = makeControls();

// Табличка с именем над всадником
function makeNameTag(text, css) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }),
  );
  // размер задан в долях экрана — подпись читается на любом расстоянии
  sprite.scale.set(0.15, 0.0375, 1);
  sprite.renderOrder = 6;
  sprite.userData.draw = (name, human) => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    let size = 34;
    ctx.font = `700 ${size}px Segoe UI, sans-serif`;
    while (ctx.measureText(name).width > 240 && size > 18) ctx.font = `700 ${(size -= 2)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,16,24,0.7)';
    ctx.strokeText(name, 128, 34);
    ctx.fillStyle = human ? '#ffe27a' : sprite.userData.css || css;
    ctx.fillText(name, 128, 34);
    tex.needsUpdate = true;
  };
  sprite.userData.draw(text, false);
  return sprite;
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);
const _hand = new THREE.Vector3();
const _bit = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class Horseman {
  constructor({ id, teamId, name, coat, isHuman = false, number = 0 }) {
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
    this.prevPass = false;
    this.prevFeint = false;
    this.frozen = false;
    this.speedFactor = 1; // множитель скорости (сложность ботов)
    // порода коня и характеристики всадника (страна) — множители
    this.breed = { speed: 1, accel: 1, turn: 1, stamina: 1, mass: 1 };
    this.skills = { power: 1, accuracy: 1, grip: 1 };
    this.feintCooldown = 0;

    // --- улак ---
    this.hasUlak = false;
    this.charging = false;
    this.charge = 0;
    this.mustRelease = false; // после подбора нужно отпустить пробел, прежде чем замахиваться
    this.grabCooldown = 0;
    this.stealImmunity = 0;
    this.inTug = false; // идёт борьба за улак
    this.stagger = 0; // время «оглушения» после удара
    this.jolt = 0; // встряска всадника (0..1)
    this.accelLong = 0;

    // --- визуал ---
    this.group = new THREE.Group();
    this.tilt = new THREE.Group(); // крен в повороте
    this.group.add(this.tilt);
    this.horse = new HorseModel(coat);
    this.tilt.add(this.horse.mesh);
    this.seat = new THREE.Group(); // следует за спиной коня
    this.tilt.add(this.seat);
    this.tack = createTack(this.team);
    this.seat.add(this.tack);
    this.rider = new RiderFigure(this.team, number);
    this.seat.add(this.rider.group);

    // повод: два ремня от левой руки к удилам
    const reinMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 });
    const reinGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5);
    this.reins = [-1, 1].map((side) => {
      const m = new THREE.Mesh(reinGeo, reinMat);
      m.userData.side = side;
      m.castShadow = true;
      this.tilt.add(m);
      return m;
    });
    this.bitBone = this.horse.bone('BN_BT_Lip_028_end') || this.horse.bone('BN_BT_Lip') || this.horse.bone('BN_Jaw');
    this.reinHand = this.rider.bones.lHand;
    // точка, где висит улак (у правого стремени; правая сторона всадника — это −X)
    this.carryAnchor = new THREE.Object3D();
    this.carryAnchor.position.set(-0.6, -0.5, 0.05);
    this.seat.add(this.carryAnchor);

    // кольцо под всадником, которым управляет игрок
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.45, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.visible = isHuman;
    this.group.add(this.ring);

    this.tag = makeNameTag(name, this.team.css);
    this.tag.position.y = 3.0;
    this.group.add(this.tag);
  }

  // Перекраска под команду после выбора стран
  applyTeam() {
    this.team = TEAMS[this.teamId];
    this.rider.setTeam(this.team);
    this.seat.remove(this.tack);
    this.tack = createTack(this.team);
    this.seat.add(this.tack);
    this.tag.userData.css = this.team.css;
    this.tag.userData.draw(this.name, this.isHuman);
  }

  setName(name) {
    this.name = name;
    this.tag.userData.draw(name, this.isHuman);
  }

  // Передаёт управление игроку или возвращает боту
  setHuman(v) {
    this.isHuman = v;
    this.ring.visible = v;
    this.tag.userData.draw(this.name, v);
    Object.assign(this.controls, FROZEN);
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
    this.inTug = false;
    this.stagger = 0;
    this.jolt = 0;
    this.accelLong = 0;
  }

  // Шаг симуляции движения
  step(dt) {
    const c = this.frozen ? FROZEN : this.controls;
    const staggered = this.stagger > 0;
    this.stagger = Math.max(0, this.stagger - dt);
    // после сильного удара конь на мгновение хуже слушается повода
    const throttle = staggered ? c.throttle * 0.8 : c.throttle;
    const steer = staggered ? c.steer * 0.75 : c.steer;

    // выносливость
    const wantsSprint = c.sprint && throttle > 0.1 && !this.exhausted;
    this.sprinting = wantsSprint && this.stamina > 0;
    if (this.sprinting) {
      this.stamina -= (STAMINA.drain * dt) / this.breed.stamina;
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
    let max = (this.sprinting ? HORSE.sprintSpeed : HORSE.runSpeed) * this.speedFactor * this.breed.speed;
    if (this.hasUlak) max *= HORSE.carrySpeedFactor;
    if (this.charging) max *= 0.85;
    if (this.inTug) max *= 0.85; // в борьбе за улак кони идут связкой
    if (this.exhausted) max *= 0.88; // загнанный конь идёт тяжелее
    let target = 0;
    if (throttle > 0) target = throttle * max;
    else if (throttle < 0) target = -HORSE.reverseSpeed;
    let rate;
    // тяга падает с ростом скорости: с места конь берёт резво, к пределу — всё медленнее
    const pull = THREE.MathUtils.clamp(1.3 - Math.abs(this.speed) / max, 0.3, 1.3);
    if (target > this.speed)
      rate = this.speed < 0 ? HORSE.brake : (this.sprinting ? HORSE.sprintAccel : HORSE.accel) * pull * this.breed.accel;
    else rate = throttle < 0 && this.speed > 0 ? HORSE.brake : throttle === 0 ? HORSE.coast : HORSE.accel;
    const before = this.speed;
    const ds = target - this.speed;
    this.speed += Math.sign(ds) * Math.min(Math.abs(ds), rate * dt);

    // поворот: предел бокового ускорения, ω ≤ a / v
    const v = Math.abs(this.speed);
    const turnRate = Math.min(HORSE.turnRateSlow, HORSE.lateralAccel / Math.max(v, 1)) * this.breed.turn;
    // крутой поворот на скорости «съедает» ход
    this.speed -= Math.sign(this.speed) * Math.abs(this.turn) * v * HORSE.turnDrag * dt;
    const targetTurn = steer * turnRate * (this.speed < -0.2 ? -1 : 1);
    this.turn += (targetTurn - this.turn) * (1 - Math.exp(-dt * 11));
    this.heading = wrapPi(this.heading + this.turn * dt);

    // продольное ускорение — для посадки всадника и «клевка» коня
    const acc = (this.speed - before) / Math.max(dt, 1e-4);
    this.accelLong += (acc - this.accelLong) * (1 - Math.exp(-dt * 5));

    // инерция: вектор скорости «догоняет» направление коня; после удара сцепление падает
    const fx = Math.sin(this.heading) * this.speed;
    const fz = Math.cos(this.heading) * this.speed;
    const g = 1 - Math.exp(-dt * HORSE.grip * (staggered ? 0.6 : 1));
    this.vel.x += (fx - this.vel.x) * g;
    this.vel.z += (fz - this.vel.z) * g;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    this.stealImmunity = Math.max(0, this.stealImmunity - dt);
    this.jolt = Math.max(0, this.jolt - dt * 1.8);
    this.feintCooldown = Math.max(0, this.feintCooldown - dt);
  }

  // Импульс (кг·м/с) в точке со смещением (rx, rz) от центра: меняет скорость и разворачивает корпус
  applyImpulse(jx, jz, rx = 0, rz = 0) {
    const m = HORSE.mass * this.breed.mass + (this.hasUlak ? 30 : 0);
    this.vel.x += jx / m;
    this.vel.z += jz / m;
    // момент вокруг вертикали (см. Match: скорость точки = ω·(r_z, −r_x))
    this.turn += (rz * jx - rx * jz) / HORSE.inertia;
    const dv = Math.hypot(jx, jz) / m;
    // скорость вдоль корпуса пересчитывается по новой скорости
    const along = this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
    this.speed += (THREE.MathUtils.clamp(along, -HORSE.reverseSpeed, this.speed + 2.5) - this.speed) * 0.85;
    if (dv > 1.2) {
      this.stagger = Math.max(this.stagger, Math.min(0.3, (dv - 1.2) / 12));
      this.jolt = Math.min(1, this.jolt + dv / 5);
    }
    return dv;
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
    this.horse.update(dt, groundSpeed, this.turn);

    const bank = THREE.MathUtils.clamp(-this.turn * Math.abs(this.speed) * 0.014, -0.3, 0.3);
    this.tilt.rotation.z += (bank - this.tilt.rotation.z) * (1 - Math.exp(-dt * 8));
    // при резком торможении конь «садится» на задние ноги, при рывке — подаётся вперёд
    const pitch = THREE.MathUtils.clamp(this.accelLong * 0.011, -0.1, 0.06);
    this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * (1 - Math.exp(-dt * 6));

    const back = this.horse.sampleBack();
    this.seat.position.set(0, back.y, back.z);
    this.seat.rotation.x = back.pitch * 0.7;
    // всадник не наследует весь наклон спины — корпус держит вертикаль
    this.rider.group.rotation.x = -back.pitch * 0.45;

    this.rider.update(dt, {
      carrying: this.hasUlak || this.inTug,
      charge: this.charging ? this.charge : -1,
      speed01: THREE.MathUtils.clamp(Math.abs(this.speed) / HORSE.sprintSpeed, 0, 1),
      turn: this.turn,
      accel: this.accelLong,
      jolt: this.jolt,
    });

    // повод тянется от кисти к морде коня
    if (this.bitBone && this.reinHand) {
      this.reinHand.getWorldPosition(_hand);
      this.bitBone.getWorldPosition(_bit);
      this.tilt.worldToLocal(_hand);
      this.tilt.worldToLocal(_bit);
      for (const r of this.reins) {
        _end.copy(_bit);
        _end.x += r.userData.side * 0.09;
        _end.y += 0.05;
        _dir.subVectors(_end, _hand);
        const len = _dir.length();
        r.position.copy(_hand).addScaledVector(_dir, 0.5);
        r.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len || 1));
        r.scale.set(1, len, 1);
      }
    }
  }

  // Параметры броска при заданной силе замаха (0..1)
  throwVelocity(charge, out = new THREE.Vector3(), noise = false) {
    const h = THREE.MathUtils.lerp(ULAK.minThrowH, ULAK.maxThrowH, charge);
    const v = THREE.MathUtils.lerp(ULAK.minThrowV, ULAK.maxThrowV, charge);
    // меткость: разброс направления и силы зависит от точности всадника
    const spread = noise ? (0.05 / this.skills.accuracy) * (0.5 + charge) : 0;
    const hd = this.heading + (Math.random() - 0.5) * 2 * spread;
    const pk = 1 + (Math.random() - 0.5) * spread * 1.2;
    out.set(Math.sin(hd) * h * pk, v * pk, Math.cos(hd) * h * pk);
    out.x += this.vel.x * ULAK.carrierInherit;
    out.z += this.vel.z * ULAK.carrierInherit;
    return out;
  }

  throwOrigin(out = new THREE.Vector3()) {
    return out.set(
      this.pos.x + Math.sin(this.heading) * 0.6 - Math.cos(this.heading) * 0.35,
      ULAK.releaseHeight,
      this.pos.z + Math.cos(this.heading) * 0.6 + Math.sin(this.heading) * 0.35,
    );
  }
}
