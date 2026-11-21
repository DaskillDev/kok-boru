import { FIELD, KAZAN, TEAMS } from '../config.js';

// Мини-карта: поле сверху, всадники, улак и казаны.

export class Minimap {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.pad = 8;
  }

  draw(riders, ulak, player) {
    const { ctx, c, pad } = this;
    const w = c.width - pad * 2;
    const h = c.height - pad * 2;
    const sx = (x) => pad + ((x + FIELD.length / 2) / FIELD.length) * w;
    const sz = (z) => pad + ((z + FIELD.width / 2) / FIELD.width) * h;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(40, 96, 48, 0.75)';
    ctx.fillRect(pad, pad, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, w, h);
    ctx.beginPath();
    ctx.moveTo(sx(0), pad);
    ctx.lineTo(sx(0), pad + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx(0), sz(0), (9 / FIELD.length) * w, 0, Math.PI * 2);
    ctx.stroke();
    for (const team of TEAMS) {
      // казан команды стоит на её стороне
      ctx.strokeStyle = team.css;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx(-KAZAN.x * team.attackDir), sz(0), (KAZAN.outerR / FIELD.length) * w + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const r of riders) {
      ctx.fillStyle = r.team.css;
      ctx.beginPath();
      ctx.arc(sx(r.pos.x), sz(r.pos.z), r === player ? 5 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (r === player) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffd23a';
    ctx.strokeStyle = '#3a2a00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx(ulak.pos.x), sz(ulak.pos.z), 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
