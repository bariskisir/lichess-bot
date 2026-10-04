import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createLozzaRuntime } from './lozza-runtime.js';

const version = process.argv[2];
if (version !== '2' && version !== '5') throw new Error('Unknown bundled Lozza version.');
const source = await readFile(new URL(`./vendor/lozza-${version}.js`, import.meta.url), 'utf8');
const command = createLozzaRuntime(source, (line) => process.stdout.write(`${line}\n`));
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line === 'quit') process.exit(0);
  command(line);
});
input.on('close', () => process.exit(0));
