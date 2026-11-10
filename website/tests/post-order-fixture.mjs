// Exact downloaded production executable, transformed by the reviewed release.
// No live credentials/data are imported. All mutations use memory SQLite.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { productionBrowserFixture } from './production-browser-fixture.mjs';
export async function postOrderFixture() {
  if (!process.env.RR_CANDIDATE_MODULE || !process.env.RR_SYNTHETIC_SCHEMA || !process.env.RR_PUBLIC_ASSETS) throw Error('Set isolated candidate, schema and asset paths.');
  const { default: runtime } = await import(pathToFileURL(process.env.RR_CANDIDATE_MODULE));
  const f = await productionBrowserFixture({ runtime, schema: readFileSync(process.env.RR_SYNTHETIC_SCHEMA, 'utf8'), assetRoot: process.env.RR_PUBLIC_ASSETS });
  const place = f.order;
  f.order = overrides => place({ policyVersion: '2026-11-09', ...overrides });
  return f;
}
