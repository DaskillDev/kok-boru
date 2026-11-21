import * as THREE from 'three';

// Камера от третьего лица: плавно следует за всадником и его курсом.

const _want = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.dist = 9.5;
    this.height = 4.4;
    this.baseFov = camera.fov;
    this.look = new THREE.Vector3();
    this.orbitT = 0;
  }

  snap(target) {
    this.yaw = target.heading;
    this._desired(target);
    this.camera.position.copy(_want);
    this.look.copy(_look);
    this.camera.lookAt(this.look);
  }

  _desired(target) {
    const sx = Math.sin(this.yaw);
    const cz = Math.cos(this.yaw);
    _want.set(target.pos.x - sx * this.dist, this.height, target.pos.z - cz * this.dist);
    _look.set(target.pos.x + sx * 5, 1.9, target.pos.z + cz * 5);
  }

  follow(dt, target) {
    const d = Math.atan2(Math.sin(target.heading - this.yaw), Math.cos(target.heading - this.yaw));
    this.yaw += d * (1 - Math.exp(-dt * 3.2));
    this._desired(target);
    this.camera.position.lerp(_want, 1 - Math.exp(-dt * 7));
    this.look.lerp(_look, 1 - Math.exp(-dt * 9));
    this.camera.lookAt(this.look);
    const fov = this.baseFov + (target.sprinting ? 9 : 0) + Math.min(Math.abs(target.speed), 12) * 0.35;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 3));
    this.camera.updateProjectionMatrix();
  }

  // Облёт для меню
  orbit(dt, center, radius = 17, height = 5) {
    this.orbitT += dt * 0.16;
    _want.set(center.x + Math.sin(this.orbitT) * radius, height, center.z + Math.cos(this.orbitT) * radius);
    this.camera.position.lerp(_want, 1 - Math.exp(-dt * 2));
    this.look.lerp(_look.set(center.x, 1.6, center.z), 1 - Math.exp(-dt * 3));
    this.camera.lookAt(this.look);
  }
}
