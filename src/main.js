// Bootstrap. `?test=name` runs src/tests/name.js (isolated dev scenes used for screenshots),
// otherwise the full game boots (src/game.js).
import './ui/fonts.css'; // self-hosted UI fonts (no Google Fonts request; works offline and on itch.io)
import { importWithRetry, reloadOnce, showLoadError } from './core/chunkRetry.js';
const params = new URLSearchParams(location.search);
const test = params.get('test');
if (test) {
  document.getElementById('boot')?.remove();
  import(`./tests/${test}.js`).then(m => m.default?.()).catch(e => { console.error('[test] failed', e); });
} else {
  importWithRetry(() => import('./game.js'))
    .catch(e => { console.error('[boot] game chunk failed', e); if (!reloadOnce()) showLoadError(); return null; })
    .then(m => m?.boot()).catch(e => { console.error('[boot] failed', e); });
}
