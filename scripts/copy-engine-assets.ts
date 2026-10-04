import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = 'apps/server/src/adapters/engines/lozza/vendor';
const destination = resolve('dist', directory);
await mkdir(destination, { recursive: true });
await cp(resolve(directory), destination, { recursive: true });
