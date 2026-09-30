// Disney-style Chewy (tools/blender/disney): the baked hero model. Kept as thin wrappers over the generalised loader
// in heroModels.js (every baked hero — Chewy, Moka — goes through it), so existing imports keep working.
import { heroStyle, setHeroStyle, heroModelReady, loadHeroModel, buildHeroModel } from './heroModels.js';

// ?chewy=disney / ?chewy=classic override the saved choice; the Disney model is the default once it is loaded
export const chewyStyle = heroStyle;
export const setChewyStyle = setHeroStyle;
export const disneyReady = () => heroModelReady('chewy');
export const loadDisneyChewy = (force = false) => loadHeroModel('chewy', force);
export const buildDisneyChewy = (spec = { name: 'Chewy' }) => buildHeroModel('chewy', spec);
