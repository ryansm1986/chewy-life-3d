// dev: /?test=toydbg - toy kit eye fit per species (window.__info)
import { debugEye, TOY_KINDS } from '../actors/toyKit.js';
export default function () { const o = {}; for (const k of TOY_KINDS) o[k] = debugEye(k); window.__info = o; window.__ready = true; }
