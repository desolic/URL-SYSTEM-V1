import { randomBytes, createHash } from 'node:crypto';

const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');

console.log('Generated a new API token.\n');
console.log('  API token   (give to the client, sent as "Authorization: Bearer <token>"):');
console.log(`    ${token}\n`);
console.log('  AUTH_TOKEN_HASH (set this in the server environment):');
console.log(`    ${hash}\n`);
console.log('The plaintext token is shown only once and is never stored on the server.');
