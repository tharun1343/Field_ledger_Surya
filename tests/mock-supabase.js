/*
 * Tiny in-memory stand-in for the parts of Supabase that FieldLedger uses (Auth + PostgREST),
 * so sign-in and sync can be tested without a real project. Not a full implementation.
 */
'use strict';
const http = require('http');
const crypto = require('crypto');

function createMockSupabase() {
  const users = new Map();        // email -> { id, email, password }
  const tokens = new Map();       // access/refresh token -> user id
  const entries = new Map();      // `${user}:${id}` -> row
  const settings = new Map();     // user -> row
  let clock = Date.parse('2026-10-20T00:00:00Z');
  const stamp = () => new Date(clock += 1000).toISOString();
  const calls = [];
  const codes = new Map();        // email -> last 6-digit code sent
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const session = u => {
    // Access tokens look like real Supabase JWTs (header.payload.signature) so the app can read sub/email.
    const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, n: crypto.randomUUID() })}.sig`, refresh = 'rt-' + crypto.randomUUID();
    tokens.set(access, u.id); tokens.set(refresh, u.id);
    return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      calls.push({ method: req.method, path: url.pathname, query: url.search });
      if (!req.headers.apikey) return send(401, { message: 'No API key found in request' });
      const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const uid = tokens.get(bearer);
      if (url.pathname === '/auth/v1/signup') {
        if (users.has(body.email)) return send(422, { msg: 'User already registered' });
        const u = { id: crypto.randomUUID(), email: body.email, password: body.password }; users.set(u.email, u);
        return send(200, session(u));
      }
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'password') {
          const u = users.get(body.email);
          if (!u || u.password !== body.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
          return send(200, session(u));
        }
        const id = tokens.get(body.refresh_token); const u = [...users.values()].find(x => x.id === id);
        return u ? send(200, session(u)) : send(400, { error_description: 'Invalid Refresh Token' });
      }
      if (url.pathname === '/auth/v1/recover') return send(200, {});
      if (url.pathname === '/auth/v1/otp') {
        if (!users.has(body.email)) { if (!body.create_user) return send(422, { msg: 'Signups not allowed for otp' }); users.set(body.email, { id: crypto.randomUUID(), email: body.email }); }
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); codes.set(body.email, code);
        return send(200, {});
      }
      if (url.pathname === '/auth/v1/verify') {
        if (body.type !== 'email' || codes.get(body.email) !== body.token) return send(403, { code: 'otp_expired', msg: 'Token has expired or is invalid' });
        codes.delete(body.email);
        return send(200, session(users.get(body.email)));
      }
      if (url.pathname === '/auth/v1/logout') { tokens.delete(bearer); return send(204); }
      if (!uid) return send(401, { message: 'JWT expired' });
      if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
        const u = [...users.values()].find(x => x.id === uid); if (body.password) u.password = body.password;
        return send(200, { id: u.id, email: u.email });
      }
      if (url.pathname === '/rest/v1/ledger_entries') {
        if (req.method === 'POST') {
          for (const r of body) {
            if (r.user_id !== uid) return send(403, { message: 'new row violates row-level security policy' });
            entries.set(`${uid}:${r.id}`, { ...r, server_updated_at: stamp() });
          }
          return send(201);
        }
        const gt = (url.searchParams.get('server_updated_at') || '').replace(/^gt\./, '');
        const rows = [...entries.values()].filter(r => r.user_id === uid && (!gt || r.server_updated_at > gt)).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at));
        return send(200, rows.slice(0, Number(url.searchParams.get('limit') || 1000)));
      }
      if (url.pathname === '/rest/v1/ledger_settings') {
        if (req.method === 'POST') { const r = body[0]; if (r.user_id !== uid) return send(403, {}); settings.set(uid, { ...r }); return send(201); }
        return send(200, settings.has(uid) ? [settings.get(uid)] : []);
      }
      send(404, { message: 'not found' });
    });
  });
  return {
    start: () => new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    stop: () => server.close(),
    entries, settings, users, calls, codes, session
  };
}
module.exports = { createMockSupabase };
