// Preserve direct production edits and existing asset delivery while applying the reviewed auth repair.
// Input is a privately backed-up deployment bundle, never a secret-bearing environment file.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [baseline, output] = process.argv.slice(2);
if (!baseline || !output) throw Error('Usage: node scripts/prepare-verification-production.mjs baseline.mjs output.mjs');
const original = readFileSync(baseline, 'utf8');
const start = original.indexOf('// server/email-login.mjs\n');
const end = original.indexOf('// server/contact-login.mjs\n', start);
if (start < 0 || end < 0) throw Error('Unsupported production bundle');
let module = original.slice(start, end);
function replaceOnce(text, a, b) {
 if (!text.includes(a) || text.indexOf(a) !== text.lastIndexOf(a)) throw Error('Production baseline mismatch: ' + a.slice(0,70));
 return text.replace(a,b);
}
const bindingStart = module.indexOf('  if (row.purpose === "register") {\n    const browser');
const bindingEnd = module.indexOf('  if (row.claimed_by)', bindingStart);
if (bindingStart < 0 || bindingEnd < 0) throw Error('Registration proof guard missing');
module = module.slice(0,bindingStart) + '  // New account mailbox proof is independent of browser storage; no session is issued.\n' + module.slice(bindingEnd);
module = module.replace('This verification link has expired. In the Safari browser where you joined, request a new verification email with your registration password.', 'This verification link has expired. Request a new email using your email and password.');
module = module.replace('This verification link has expired. Request a new email from the registration browser.', 'This verification link has expired. Request a new email using your email and password.');
module = replaceOnce(module, 'Your email is verified. Please sign in.', 'Email Verified Successfully. Please sign in with your email and password.');
const cookieStart = module.indexOf('    const existingBrowser =');
const cookieEnd = module.indexOf('    if (a === "resend" && matching', cookieStart);
if (cookieStart < 0 || cookieEnd < 0) throw Error('Resend cooldown baseline mismatch');
module = module.slice(0,cookieStart) + '    const matching = purpose === "register" && await first3(db, "SELECT expires FROM roost_email_tokens WHERE workspace_id=? AND email=? AND purpose=\'register\' AND claimed_by IS NULL ORDER BY expires DESC LIMIT 1", w, email);\n' + module.slice(cookieEnd);
module = replaceOnce(module,'Open the latest email in this browser; check Spam before requesting another.','Open the latest email; check Spam before requesting another.');
module = replaceOnce(module,'    const pendingBrowser = matching ? existingBrowser : sessionToken();\n    if (purpose === "register") sessionHash2 = await sessionHash(pendingBrowser);\n','');
const responseStart = module.indexOf('      purpose === "register" ? [\n        `rr_roost_pending_');
const responseEnd = module.indexOf('      ] : []', responseStart);
if (responseStart < 0 || responseEnd < 0) throw Error('Pending cookie response baseline mismatch');
module = module.slice(0,responseStart) + '      []' + module.slice(responseEnd+'      ] : []'.length);
if (module.includes('registration browser') || module.includes('rr_roost_pending_')) throw Error('Obsolete registration browser binding retained');
let result = original.slice(0,start) + module + original.slice(end);
const marker = 'const module = path === "/customer.mjs" ? ';
const uiStart = result.indexOf(marker) + marker.length;
if (uiStart < marker.length) throw Error('Existing customer module delivery not found');
// A JSON string is the existing production asset representation.
const stringMatch = /^"(?:[^"\\]|\\.)*"/.exec(result.slice(uiStart));
if (!stringMatch) throw Error('Customer module representation mismatch');
const customer = readFileSync(new URL('../public/customer.mjs',import.meta.url),'utf8');
result = result.slice(0,uiStart) + JSON.stringify(customer) + result.slice(uiStart + stringMatch[0].length);
// Every production byte outside email-login and the existing customer module stays intact.
writeFileSync(output,result);
console.log(JSON.stringify({baselineSha256:createHash('sha256').update(original).digest('hex'),releaseSha256:createHash('sha256').update(result).digest('hex'),bytes:Buffer.byteLength(result),retainedStaticAssets:true}));
