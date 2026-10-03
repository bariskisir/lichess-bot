import { resolve } from 'node:path';
import { z } from 'zod';

/** Explicit launch overrides let test servers use isolated ports and data. */
export function readLaunchOptions(args = process.argv.slice(2)) {
  const value = (name: string) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    directory: resolve(value('data-directory') ?? 'data'),
    port: value('port')
      ? z.coerce.number().int().min(0).max(65535).parse(value('port'))
      : undefined,
    development: args.includes('--development'),
    autoStart: !args.includes('--no-autostart'),
  };
}
