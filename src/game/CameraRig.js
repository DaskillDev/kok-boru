import * as THREE from 'three';
import { FIELD } from '../config.js';

// Камеры:
//  chase — от третьего лица, за всадником;
//  tv    — телевизионная, сбоку-сверху вдоль поля (как в футбольных симуляторах);
//  first — от первого лица, из глаз всадника.

export const CAMERA_MODES = [
  { id: 'chase', label: 'Камера: за всадником' },
  { id: 'tv', label: 'Камера: ТВ-трансляция' },
  { id: 'first', label: 'Камера: от первого лица' },
];

const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _head = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.yaw = 0;
    this.dist = 9.5;
    this.height = 4.4;
    this.look = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.orbitT = 0;
    this._hidden = null;
    this._shake = 0;
  }

  // Встряска камеры от удара (0..1)
  shake(amount) {
    this._shake = Math.min(1, Math.max(this._shake, amount));
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex].id;
  }

  nextMode(target) {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    this._showHead(true);
    if (target) this.snap(target);
    return CAMERA_MODES[this.modeIndex];
  }

  // В виде от первого лица прячем голову своего всадника, чтобы не лезла в кадр
  _showHead(visible, target) {
    if (visible) {
      if (this._hidden) this._hidden.visible = true;
      this._hidden = null;
    } else if (target && !this._hidden) {
      this._hidden = target.rider.head;
      this._hidden.visible = false;
    }
  }

  snap(target) {
    this.yaw = target.heading;
    this.focus.copy(target.pos);
    this._compute(target, null);
    this.camera.position.copy(_want);
    this.look.copy(_look);
    this.camera.lookAt(this.look);
    this.camera.fov = this._fov(target);
    this.camera.updateProjectionMatrix();
  }

  _fov(target) {
    if (this.mode === 'tv') return 30;
    if (this.mode === 'first') return 74 + (target.sprinting ? 6 : 0);
    return 58 + (target.sprinting ? 9 : 0) + Math.min(Math.abs(target.speed), 12) * 0.35;
  }

  _compute(target, ulak) {
    const sx = Math.sin(this.yaw);
    const cz = Math.cos(this.yaw);
    if (this.mode === 'tv') {
      const f = this.focus;
      const camX = THREE.MathUtils.clamp(f.x * 0.92, -FIELD.length / 2 + 12, FIELD.length / 2 - 12);
      _want.set(camX, 27, FIELD.width / 2 + 34);
      _look.set(f.x, 1, f.z * 0.55);
    } else if (this.mode === 'first') {
      target.rider.head.getWorldPosition(_head);
      const hx = Math.sin(target.heading);
      const hz = Math.cos(target.heading);
      _want.set(_head.x + hx * 0.22, _head.y - 0.1, _head.z + hz * 0.22);
      _look.set(_head.x + hx * 12, _head.y - 1.6, _head.z + hz * 12);
    } else {
      _want.set(target.pos.x - sx * this.dist, this.height, target.pos.z - cz * this.dist);
      _look.set(target.pos.x + sx * 5, 1.9, target.pos.z + cz * 5);
    }
  }

  follow(dt, target, ulak) {
    const d = Math.atan2(Math.sin(target.heading - this.yaw), Math.cos(target.heading - this.yaw));
    this.yaw += d * (1 - Math.exp(-dt * 3.2));

    // ТВ-камера держит в кадре и игрока, и улак
    if (ulak) {
      const dist = Math.hypot(ulak.pos.x - target.pos.x, ulak.pos.z - target.pos.z);
      const w = dist > 45 ? 0.25 : 0.45;
      _look.set(
        THREE.MathUtils.lerp(target.pos.x, ulak.pos.x, w),
        0,
        THREE.MathUtils.lerp(target.pos.z, ulak.pos.z, w),
      );
      this.focus.lerp(_look, 1 - Math.exp(-dt * 2.5));
    } else {
      this.focus.copy(target.pos);
    }

    this._compute(target, ulak);
    if (this.mode === 'first') {
      this._showHead(false, target);
      this.camera.position.copy(_want);
      this.look.lerp(_look, 1 - Math.exp(-dt * 14));
    } else {
      const k = this.mode === 'tv' ? 3 : 7;
      this.camera.position.lerp(_want, 1 - Math.exp(-dt * k));
      this.look.lerp(_look, 1 - Math.exp(-dt * (this.mode === 'tv' ? 4 : 9)));
    }
    if (this._shake > 0.01) {
      const k = this._shake * (this.mode === 'tv' ? 0.5 : 0.22);
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.position.z += (Math.random() - 0.5) * k;
      this._shake *= Math.exp(-dt * 7);
    }
    this.camera.lookAt(this.look);
    this.camera.fov += (this._fov(target) - this.camera.fov) * (1 - Math.exp(-dt * 3));
    this.camera.updateProjectionMatrix();
  }

  // Облёт для меню
  orbit(dt, center, radius = 17, height = 5) {
    this._showHead(true);
    this.orbitT += dt * 0.16;
    _want.set(center.x + Math.sin(this.orbitT) * radius, height, center.z + Math.cos(this.orbitT) * radius);
    this.camera.position.lerp(_want, 1 - Math.exp(-dt * 2));
    this.look.lerp(_look.set(center.x, 1.6, center.z), 1 - Math.exp(-dt * 3));
    this.camera.lookAt(this.look);
    this.camera.fov += (55 - this.camera.fov) * (1 - Math.exp(-dt * 3));
    this.camera.updateProjectionMatrix();
  }
}
