import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkFiles } from './validate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist');
const data = await checkFiles();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Explicit allowlist: no intake data, admin scripts, credentials or development files.
for (const entry of ['index.html','styles.css','favicon.svg','config.json','src','help','data/catalogue.json']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local' }, null, 2) + '\n');
console.log(`Built dist/ with ${data.resources.length} resources and ${data.collections.length} collections.`);
