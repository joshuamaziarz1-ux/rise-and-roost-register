// Run the same synthetic auth cases against the exact deployed api implementation.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const bundle = resolve(process.argv[2] || '');
const testable = bundle + '.test-only.mjs';
const test = new URL('../tests/verification-deployment.generated.mjs', import.meta.url);
if (!process.argv[2]) throw Error('Provide the prepared bundle path.');
try {
 writeFileSync(testable, readFileSync(bundle,'utf8') + '\nexport { api };\n');
 writeFileSync(test,readFileSync(new URL('../tests/email-login.test.mjs',import.meta.url),'utf8').replace('"../server/service.mjs"',JSON.stringify(pathToFileURL(testable).href)));
 execFileSync(process.execPath,['--test',test.pathname],{stdio:'inherit'});
} finally { try { unlinkSync(test); } catch {} try { unlinkSync(testable); } catch {} }
