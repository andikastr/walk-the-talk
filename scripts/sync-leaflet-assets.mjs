import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cssPath = path.join(projectRoot, 'node_modules', 'leaflet', 'dist', 'leaflet.css');
const jsPath = path.join(projectRoot, 'node_modules', 'leaflet', 'dist', 'leaflet.js');
const outPath = path.join(projectRoot, 'components', 'map', 'leafletInlineAssets.ts');

const rawCss = fs.readFileSync(cssPath, 'utf8');
const rawJs = fs.readFileSync(jsPath, 'utf8');

// Hapus referensi asset PNG relatif yang tidak diperlukan karena peta hanya memakai vector markers & polylines
const cleanedCss = rawCss.replace(
  /background-image:\s*url\((?:'|")?images\/[^)'"]+(?:'|")?\)\s*;?/gi,
  'background-image: none;'
);

// Hindari penutupan tag </script> prematur saat disematkan inline di HTML WebView
const safeJs = rawJs.replace(/<\/script/gi, '<\\/script');

const banner = [
  '/*',
  ' * Auto-generated from leaflet@1.9.4 via `npm run sync:leaflet`.',
  ' * Bundled inline so WorkoutMap WebView works reliably offline.',
  ' */',
  '',
  `export const LEAFLET_CSS: string = ${JSON.stringify(cleanedCss)};`,
  '',
  `export const LEAFLET_JS: string = ${JSON.stringify(safeJs)};`,
  '',
].join('\n');

fs.writeFileSync(outPath, banner, 'utf8');
console.log(
  `Synced Leaflet inline assets -> ${path.relative(projectRoot, outPath)} (${cleanedCss.length} CSS bytes, ${safeJs.length} JS bytes)`
);

