// Chunks the server failed to send. In 0.8.1 itch's CDN answered 520 for one of the UI's chunks and the game came up with
// no UI at all. A failed import is tried again; if it still fails the page reloads once (a fresh page fetches every chunk
// again, and some browsers keep a failed import failed for the page's life); after that a card asks the player to reload.
const KEY = 'pawhaven.chunkReload';

export async function importWithRetry(load, tries = 2) {
  for (let i = 1; ; i++) {
    try { return await load(); } catch (e) {
      if (i >= tries) throw e;
      await new Promise(r => setTimeout(r, 500 * i));
    }
  }
}

// reload once per tab session (no loop when a chunk is really missing); false if already tried or storage is blocked
export function reloadOnce() {
  try { if (sessionStorage.getItem(KEY)) return false; sessionStorage.setItem(KEY, '1'); } catch (e) { return false; }
  location.reload();
  return true;
}

// the game loaded: a later failure in this tab may reload again
export function chunksLoaded() { try { sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } }

export function showLoadError() {
  if (document.getElementById('load-error')) return;
  const d = document.createElement('div');
  d.id = 'load-error';
  d.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(74,44,42,.55);font-family:Fredoka,sans-serif;color:#4a2c2a';
  d.innerHTML = '<div style="background:#fff6e8;border-radius:22px;padding:26px 34px;text-align:center;box-shadow:0 8px 0 #ffb0c8;max-width:420px">'
    + '<div style="font-size:26px;font-weight:700">Part of the game didn\'t download</div>'
    + '<div style="margin:10px 0 18px;font-size:17px;opacity:.8">Your save is safe. Reloading the page usually fixes it.</div>'
    + '<button style="font:inherit;font-size:19px;font-weight:700;padding:10px 28px;border:0;border-radius:14px;background:#ff8fb0;color:#fff;cursor:pointer">Reload</button></div>';
  d.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(d);
}
