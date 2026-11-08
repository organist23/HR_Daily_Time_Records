import fs from 'node:fs';
import { E2E_ROOT } from './helpers.js';

export default function globalTeardown() {
  fs.rmSync(E2E_ROOT, { recursive: true, force: true });
}
