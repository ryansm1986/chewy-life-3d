// Dialogue box: portrait, name plate, per-letter typewriter pop-in, *emphasis* wiggle, choices, bouncing continue.
import { el, esc, wait } from './dom.js';
import { glyph } from './glyphs.js';
import { portraitHTML, portraitBg, PORTRAITS } from './portraits.js';
import { keyHint } from './padGlyphs.js';

const SPEAKER_COLORS = { rosie: '#ff8fb0', chewy: '#c98f5e', shadow: '#6a7ab8' };

export class Dialogue {
  constructor(ui) {
    this.ui = ui;
    const r = this.root = el('div', 'dlg');
    r.innerHTML = `<div class="dlg-box">
        <div class="dlg-por"><div class="dlg-por-in"></div></div>
        <div class="dlg-name"><span class="dn-t"></span><span class="jp dn-jp"></span></div>
        <div class="dlg-tx"></div>
        <div class="dlg-ch"></div>
        <div class="dlg-more">${glyph('paw')}</div>
        <div class="dlg-count"></div>
        <i class="dlg-deco">${glyph('sakura')}</i>
      </div>`;
    ui.layers.dlg.appendChild(r);
    this.$ = { box: r.querySelector('.dlg-box'), por: r.querySelector('.dlg-por'), porIn: r.querySelector('.dlg-por-in'), name: r.querySelector('.dlg-name'), nt: r.querySelector('.dn-t'), njp: r.querySelector('.dn-jp'), tx: r.querySelector('.dlg-tx'), ch: r.querySelector('.dlg-ch'), more: r.querySelector('.dlg-more'), count: r.querySelector('.dlg-count') };
    this.active = false;
    this.$.box.addEventListener('click', e => { if (e.target.closest('.dlg-ch')) return; this.advance(); });
    this.$.ch.addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.choose(+b.dataset.i); });
  }
  open(opts = {}) {
    if (this.active) this.finish(-1);
    const lines = (opts.lines || (opts.text ? [opts.text] : [])).map(l => (typeof l === 'string' ? { text: l } : l));
    if (!lines.length) lines.push({ text: '…' });
    this.opts = opts; this.lines = lines; this.i = 0; this.choices = opts.choices || null;
    this.active = true;
    this.ui.root.classList.add('dlg-open');
    this.root.classList.remove('out'); this.root.classList.add('show');
    this.setSpeaker(lines[0]);
    this.showLine();
    return new Promise(res => { this.resolve = res; });
  }
  setSpeaker(line) {
    const o = this.opts;
    const speaker = line.speaker || o.speaker || '';
    const key = speaker.toLowerCase();
    let p = line.portrait || o.portrait;
    if (!p && PORTRAITS[key]) p = key;
    const sig = speaker + '|' + JSON.stringify(p || null);
    if (sig === this._spk) return;
    const first = !this._spk;
    this._spk = sig;
    const col = line.color || o.color || SPEAKER_COLORS[key] || '#ff8fb0';
    this.root.style.setProperty('--sc', col);
    this.$.nt.textContent = speaker;
    this.$.njp.textContent = line.jp || o.jp || '';
    this.$.name.style.display = speaker ? '' : 'none';
    const bg = portraitBg(p);
    this.$.por.style.setProperty('--pbg', bg || '');
    this.$.porIn.innerHTML = p ? portraitHTML(p) : `<span class="emo initial">${esc((speaker || '?')[0])}</span>`;
    if (!first) { this.$.por.classList.remove('swap'); void this.$.por.offsetWidth; this.$.por.classList.add('swap'); }
  }
  // Build per-letter spans. *word* → wiggle; words kept together so wrapping stays nice.
  build(text) {
    let html = '', idx = 0, delay = 0;
    const speed = this.opts.speed || 0.024;
    const parts = String(text).split(/(\*[^*]+\*)/g);
    for (const part of parts) {
      if (!part) continue;
      const em = part.startsWith('*') && part.endsWith('*') && part.length > 2;
      const s = em ? part.slice(1, -1) : part;
      const hint = em && keyHint(s); // (the gamepad plays: *F* / *Tab* show its button: ui/padGlyphs.js)
      if (hint) { html += `<span class="wd em"><span class="ch" style="animation-delay:${delay.toFixed(3)}s">${hint}</span></span>`; idx++; delay += speed * 2; continue; }
      const words = s.split(/(\s+)/);
      for (const w of words) {
        if (!w) continue;
        if (/^\s+$/.test(w)) { html += ' '; delay += speed; continue; }
        html += `<span class="wd${em ? ' em' : ''}">`;
        for (const ch of w) {
          html += `<span class="ch" style="animation-delay:${delay.toFixed(3)}s">${em ? `<span class="w" style="animation-delay:${(-idx * 0.09).toFixed(2)}s">${esc(ch)}</span>` : esc(ch)}</span>`;
          idx++;
          delay += speed * (/[.!?…]/.test(ch) ? 7 : /[,;:—]/.test(ch) ? 4 : 1);
        }
        html += '</span>';
      }
    }
    return { html, dur: delay + 0.25 };
  }
  showLine() {
    const line = this.lines[this.i];
    this.setSpeaker(line);
    const { html, dur } = this.build(line.text);
    const tx = this.$.tx;
    tx.classList.remove('instant');
    tx.innerHTML = html;
    this.typing = true;
    this.root.classList.add('typing');
    this.$.more.classList.remove('show');
    this.$.ch.innerHTML = ''; this.$.ch.classList.remove('show');
    this.$.count.textContent = this.lines.length > 1 ? `${this.i + 1}/${this.lines.length}` : '';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.doneTyping(), dur * 1000);
    // cute gibberish voice (src/audio babble) when available
    try { this._bab?.stop?.(); this._bab = this.ui.G?.audio?.babble?.(String(line.text).replace(/\*/g, ''), { voice: line.voice || this.opts.voice || undefined, pitch: line.pitch || this.opts.pitch }); } catch (e) { this._bab = null; }
  }
  doneTyping() {
    clearTimeout(this._tt);
    this.typing = false;
    this.root.classList.remove('typing');
    const last = this.i >= this.lines.length - 1;
    if (last && this.choices?.length) {
      this.$.ch.innerHTML = this.choices.map((c, i) => `<button class="dch" data-i="${i}" style="--i:${i}"><span class="kc sm">${i + 1}</span><span>${esc(typeof c === 'string' ? c : c.text)}</span>${glyph('paw', 'dch-paw')}</button>`).join('');
      this.$.ch.classList.add('show');
    } else this.$.more.classList.add('show');
  }
  advance() {
    if (!this.active) return;
    if (this.typing) { this.$.tx.classList.add('instant'); this.doneTyping(); try { this._bab?.stop?.(0.08); } catch (e) { /* ignore */ } return; }
    if (this.i < this.lines.length - 1) { this.i++; this.showLine(); return; }
    if (this.choices?.length) return; // must pick
    this.finish(-1);
  }
  choose(i) {
    if (!this.active || !this.choices || i < 0 || i >= this.choices.length) return;
    const b = this.$.ch.querySelector(`.dch[data-i="${i}"]`);
    b?.classList.add('picked');
    this.ui.sfx?.('select');
    setTimeout(() => this.finish(i), 220);
  }
  async finish(result) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._tt);
    try { this._bab?.stop?.(0.08); } catch (e) { /* ignore */ }
    this._spk = null;
    this.root.classList.add('out');
    this.ui.root.classList.remove('dlg-open');
    const res = this.resolve; this.resolve = null;
    res?.(result);
    await wait(260);
    if (!this.active) this.root.classList.remove('show', 'out');
  }
  // keyboard: returns true when consumed
  key(k, e) {
    if (!this.active) return false;
    if (k === ' ' || k === 'Enter' || k === 'f' || k === 'F') { this.advance(); return true; }
    if (/^[1-9]$/.test(k) && this.choices && this.i >= this.lines.length - 1) {
      // choosing while the last line is still typing: finish the line and take the choice right away
      if (this.typing) this.advance();
      this.choose(+k - 1); return true;
    }
    if (k === 'Escape') {
      if (!this.choices?.length) { if (this.typing) this.advance(); else this.finish(-1); return true; }
      // every menu ends with its leave option ("Bye!", "Never mind", "Not yet"…): Esc takes it, so a menu is never a trap
      if (this.typing) this.advance();
      this.choose(this.choices.length - 1); return true;
    }
    return true; // swallow gameplay keys while talking
  }
}
