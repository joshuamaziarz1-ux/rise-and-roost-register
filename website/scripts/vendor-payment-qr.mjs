// Reproducible browser copy of the exact MIT-licensed, lockfile-pinned encoder.
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../public/vendor/', import.meta.url), { recursive: true });
await copyFile(new URL(import.meta.resolve('qrcode-generator')), new URL('../public/vendor/qrcode-generator.mjs', import.meta.url));
