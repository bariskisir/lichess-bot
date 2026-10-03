import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve('.');
const target = resolve(root, 'dist');
if (target !== `${root}${sep}dist`)
  throw new Error('The build directory must be inside this project.');
await rm(target, { recursive: true, force: true });
