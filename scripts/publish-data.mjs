/**
 * Copy the dataset into `public/` so it is downloadable at /data/*.
 *
 * The files are the product, not a build artefact, so they live in `data/` under version
 * control and are copied to `public/data/` at build time rather than being authored there.
 * Keeping one canonical copy means the crawler and the site can never disagree about what
 * the dataset says.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'data');
const dest = join(process.cwd(), 'public', 'data');

if (!existsSync(src)) {
  console.log('No data directory yet. Nothing to publish.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

let copied = 0;
let bytes = 0;
for (const name of readdirSync(src)) {
  if (name.endsWith('.tmp')) continue;
  const from = join(src, name);
  if (!statSync(from).isFile()) continue;
  copyFileSync(from, join(dest, name));
  copied++;
  bytes += statSync(from).size;
}

console.log(`Published ${copied} dataset files to public/data (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
