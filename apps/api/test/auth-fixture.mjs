import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
export async function authFixture() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'synthetic-key', alg: 'ES256' };
  const secret = new TextEncoder().encode('synthetic-legacy-only-32-characters');
  let unavailable = false;
  let mismatch = false;
  const server = createServer(async (request, response) => {
    if (unavailable) { response.writeHead(503).end(); return; }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/auth/v1/.well-known/jwks.json') { response.end(JSON.stringify({ keys: [jwk] })); return; }
    try {
      const token = request.headers.authorization?.slice(7);
      const algorithm = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).alg;
      const { payload } = await jwtVerify(token, algorithm === 'HS256' ? secret : publicKey, { algorithms: ['ES256','HS256'] });
      response.end(JSON.stringify({ id: mismatch ? randomUUID() : payload.sub }));
    } catch { response.writeHead(401).end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const issuer = 'http://127.0.0.1:' + server.address().port + '/auth/v1';
  return {
    issuer,
    async token(sub = randomUUID(), session = randomUUID(), overrides = {}, algorithm = 'ES256') {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ sub, session_id: session, iat: now, exp: now + 3600, iss: issuer, aud: 'authenticated', role: 'service_role', group_id: randomUUID(), ...overrides }).setProtectedHeader({ alg: algorithm, kid: 'synthetic-key' }).sign(algorithm === 'HS256' ? secret : privateKey);
    },
    unavailable(value) { unavailable = value; }, mismatch(value) { mismatch = value; },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
