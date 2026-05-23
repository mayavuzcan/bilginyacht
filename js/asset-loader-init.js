// Thin init wrapper so asset-loader.js stays an ES module
// while main.js stays a classic script.
import { loadGeneratedAssets } from './asset-loader.js';
document.addEventListener('DOMContentLoaded', loadGeneratedAssets);
