// Bootstrap. `?test=name` runs src/tests/name.js (isolated dev scenes used for screenshots),
// otherwise the full game boots (src/game.js).
const params = new URLSearchParams(location.search);
const test = params.get('test');
if (test) {
  import(`./tests/${test}.js`).then(m => m.default?.()).catch(e => { console.error('[test] failed', e); });
} else {
  import('./game.js').then(m => m.boot()).catch(e => { console.error('[boot] failed', e); });
}
