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

// Recursive because sealed monthly reports live in `data/reports/`. They are part of the
// published dataset, not an internal artefact: a citation of a monthly report should be
// able to point at the exact JSON the page was rendered from.
function copyTree(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });
  for (const name of readdirSync(fromDir)) {
    if (name.endsWith('.tmp')) continue;
    const from = join(fromDir, name);
    const stat = statSync(from);
    if (stat.isDirectory()) {
      copyTree(from, join(toDir, name));
      continue;
    }
    if (!stat.isFile()) continue;
    copyFileSync(from, join(toDir, name));
    copied++;
    bytes += stat.size;
  }
}

copyTree(src, dest);

console.log(`Published ${copied} dataset files to public/data (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
