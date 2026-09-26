// Base class for every window: builds the chunky paper frame, handles spring open/close, dragging by the header.
import { el } from './dom.js';
import { glyph } from './glyphs.js';

export class Panel {
  constructor(ui, { name, title, jp = '', side = 'left', cls = '', icon = 'sakura', width = null }) {
    this.ui = ui; this.name = name; this.title = title; this.jp = jp; this.side = side; this.cls = cls; this.icon = icon; this.width = width;
    this.isOpen = false; this.opts = {}; this.built = false;
  }
  get G() { return this.ui.G; }
  get st() { return this.ui.G?.state || {}; }
  get d() { return this.ui.G?.derived || {}; }
  build() {
    const w = this.wrap = el('div', `pw side-${this.side}`);
    w.dataset.name = this.name;
    w.innerHTML = `<div class="panel ${this.cls}"${this.width ? ` style="width:${this.width}px"` : ''}>
      <div class="ph"><div class="ph-tag">${glyph(this.icon)}<span class="ph-t"></span><span class="jp ph-jp"></span></div><div class="ph-extra"></div><button class="ph-x" title="Close (Esc)">${glyph('x')}</button></div>
      <div class="pb"></div>
      <i class="deco d1">${glyph('sakura')}</i><i class="deco d2">${glyph('sakura')}</i>
    </div>`;
    this.panel = w.firstElementChild;
    this.head = this.panel.querySelector('.ph');
    this.body = this.panel.querySelector('.pb');
    this.extra = this.panel.querySelector('.ph-extra');
    this.setTitle(this.title, this.jp);
    this.panel.querySelector('.ph-x').addEventListener('click', () => this.ui.close(this.name));
    this.panel.addEventListener('mousedown', () => this.ui._raise(this));
    this.initDrag();
    this.ui.layers.panels.appendChild(w);
    this.built = true;
    this.init?.();
  }
  setTitle(t, jp) {
    this.panel.querySelector('.ph-t').textContent = t;
    this.panel.querySelector('.ph-jp').textContent = jp || '';
  }
  initDrag() {
    let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
    this.dx = 0; this.dy = 0;
    this.head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, input, .tab, .tabs')) return;
      on = true; sx = e.clientX; sy = e.clientY; ox = this.dx; oy = this.dy;
      this.head.setPointerCapture(e.pointerId); this.wrap.classList.add('dragging');
    });
    this.head.addEventListener('pointermove', e => {
      if (!on) return;
      const s = this.ui.scale || 1;
      this.dx = ox + (e.clientX - sx) / s; this.dy = oy + (e.clientY - sy) / s;
      this.wrap.style.translate = `${this.dx}px ${this.dy}px`;
    });
    const end = () => { if (!on) return; on = false; this.wrap.classList.remove('dragging'); };
    this.head.addEventListener('pointerup', end); this.head.addEventListener('pointercancel', end);
    this.head.addEventListener('dblclick', e => { if (e.target.closest('button')) return; this.dx = this.dy = 0; this.wrap.style.translate = ''; });
  }
  open(opts = {}) {
    if (!this.built) this.build();
    this.opts = opts || {};
    clearTimeout(this._closeT);
    const was = this.isOpen;
    this.isOpen = true;
    this.wrap.classList.remove('closing');
    this.wrap.style.display = '';
    this.render();
    if (!was) {
      this.wrap.classList.remove('opening'); void this.wrap.offsetWidth; this.wrap.classList.add('opening');
      clearTimeout(this._openT); this._openT = setTimeout(() => this.wrap.classList.remove('opening'), 900);
      this.ui.sfx?.('open');
    }
    this.onOpen?.();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose?.();
    this.wrap.classList.remove('opening');
    this.wrap.classList.add('closing');
    this.ui.tip.hide();
    this._closeT = setTimeout(() => { this.wrap.style.display = 'none'; this.wrap.classList.remove('closing'); }, 260);
    this.ui.sfx?.('close');
  }
  // re-render only if visible
  refresh() { if (this.isOpen) this.render(); }
  render() {}
}
