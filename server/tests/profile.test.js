// Profile + avatar tests (real DB). Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
const STORE = '/tmp/intellmeet-profile-storage';

run('profile and avatar', () => {
  const sfx = Date.now();
  let app, T = {}, U = {};
  const auth = (k) => ({ Authorization: `Bearer ${T[k]}` });
  const up = (who, buf, o = {}) => request(app).post('/api/users/me/avatar').set(auth(who)).attach(o.field || 'avatar', buf, { filename: o.filename || 'me.png', contentType: o.type || 'image/png' });
  const onDisk = () => (fs.existsSync(path.join(STORE, 'avatars')) ? fs.readdirSync(path.join(STORE, 'avatars')) : []);

  beforeAll(async () => {
    Object.assign(process.env, { JWT_SECRET: 'x'.repeat(40), STORAGE_DIR: STORE, MAX_AVATAR_MB: '0.002' });   // 2097.152 bytes: fractional on purpose
    fs.rmSync(STORE, { recursive: true, force: true });
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_profile_${sfx}` });
    app = require('../app'); await require('../scripts/ensureIndexes').run();
    for (const k of ['ana', 'raj', 'zed']) { const r = await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' }); T[k] = r.body.token; U[k] = r.body.user.id; }
  });
  afterAll(async () => { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); fs.rmSync(STORE, { recursive: true, force: true }); });

  it('updates the name (trimmed) and rejects empty / unknown fields (no mass assignment)', async () => {
    const ok = await request(app).put('/api/users/me').set(auth('ana')).send({ name: '  Ana Rao  ' });
    expect(ok.status).toBe(200); expect(ok.body.user.name).toBe('Ana Rao');
    expect((await request(app).get('/api/auth/me').set(auth('ana'))).body.user.name).toBe('Ana Rao');
    for (const body of [{ name: '' }, { role: 'admin' }, { avatarUrl: 'http://evil.example/x.png' }, { password: 'newpassword1' }, { email: 'not-an-email' }])
      expect((await request(app).put('/api/users/me').set(auth('ana')).send(body)).status, JSON.stringify(body)).toBe(400);
    expect((await request(app).get('/api/auth/me').set(auth('ana'))).body.user.role).toBe('user');
  });

  it('changing the email requires the current password (403 for a wrong one, never 401), is unique, and takes effect', async () => {
    const put = (b) => request(app).put('/api/users/me').set(auth('raj')).send(b);
    const noPw = await put({ email: `raj2${sfx}@T.dev` }); expect(noPw.status).toBe(400); expect(noPw.body.code).toBe('PASSWORD_REQUIRED');
    const bad = await put({ email: `raj2${sfx}@t.dev`, currentPassword: 'wrongpass99' }); expect(bad.status).toBe(403); expect(bad.body.code).toBe('WRONG_PASSWORD');
    const taken = await put({ email: `ana${sfx}@t.dev`, currentPassword: 'password123' }); expect(taken.status).toBe(409);
    const ok = await put({ email: `RAJ2${sfx}@t.dev`, currentPassword: 'password123', name: 'Raj K' });
    expect(ok.status).toBe(200); expect(ok.body.user.email).toBe(`raj2${sfx}@t.dev`); expect(ok.body.user.name).toBe('Raj K');
    expect((await request(app).post('/api/auth/login').send({ email: `raj2${sfx}@t.dev`, password: 'password123' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: `raj${sfx}@t.dev`, password: 'password123' })).status).toBe(401);   // old email no longer works
    expect((await put({ email: `RAJ2${sfx}@t.dev` })).status).toBe(200);   // same email in another case is not a change: no password needed
    expect(JSON.stringify(ok.body)).not.toMatch(/password|\$2[aby]\$/i);
  });

  it('avatar upload: PNG/JPEG/WebP accepted, stored under a random name, response never exposes the file', async () => {
    expect((await request(app).post('/api/users/me/avatar').attach('avatar', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    const r = await up('zed', PNG, { filename: '../../evil name.png' });
    expect(r.status).toBe(200); expect(r.body.user.avatarUrl).toMatch(new RegExp(`^/api/users/${U.zed}/avatar\\?v=\\d+$`));
    expect(JSON.stringify(r.body)).not.toMatch(/avatarFile|evil|storage|\/tmp/);
    expect(onDisk().filter((f) => /^[0-9a-f]{32}\.png$/.test(f))).toHaveLength(1);
    expect((await request(app).get('/api/auth/me').set(auth('zed'))).body.user.avatarUrl).toBe(r.body.user.avatarUrl);
    expect((await up('ana', JPEG, { type: 'image/jpeg', filename: 'a.jpg' })).status).toBe(200);
    expect((await up('raj', WEBP, { type: 'image/webp', filename: 'a.webp' })).status).toBe(200);
  });

  it('other signed-in users can view it with safe headers; signed-out and unknown ids cannot', async () => {
    const r = await request(app).get(`/api/users/${U.zed}/avatar`).set(auth('ana'));
    expect(r.status).toBe(200); expect(r.headers['content-type']).toMatch(/image\/png/); expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cross-origin-resource-policy']).toBe('same-site'); expect(r.headers['cache-control']).toMatch(/private/);
    expect(Buffer.compare(r.body, PNG)).toBe(0);
    expect((await request(app).get(`/api/users/${U.zed}/avatar`)).status).toBe(401);
    expect((await request(app).get('/api/users/not-an-id/avatar').set(auth('ana'))).status).toBe(400);
    const none = await request(app).post('/api/auth/register').send({ name: 'n', email: `n${sfx}@t.dev`, password: 'password123' });
    expect((await request(app).get(`/api/users/${none.body.user.id}/avatar`).set(auth('ana'))).status).toBe(404);
  });

  it('rejects: lying content-type, SVG, wrong field name, no file, oversize (fractional limit still enforced)', async () => {
    const before = onDisk().length;
    expect((await up('ana', Buffer.from('<script>alert(1)</script> not an image'), { type: 'image/png' })).status).toBe(400);                  // bytes are not an image
    expect((await up('ana', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { type: 'image/svg+xml', filename: 'a.svg' })).status).toBe(400);
    expect((await up('ana', PNG, { field: 'file' })).status).toBe(400);
    expect((await request(app).post('/api/users/me/avatar').set(auth('ana')).field('x', '1')).status).toBe(400);
    const big = await up('ana', Buffer.concat([PNG, Buffer.alloc(4000)])); expect(big.status).toBe(413); expect(big.body.code).toBe('FILE_TOO_LARGE');
    expect(onDisk().length).toBe(before);                                                                                                       // nothing was written for any rejected upload
  });

  it('replacing a picture deletes the old file; removing clears the URL and the file', async () => {
    const first = onDisk();
    const r = await up('zed', PNG); expect(r.status).toBe(200);
    expect(onDisk().length).toBe(first.length);                                                              // old zed file replaced, not accumulated
    const gone = await request(app).delete('/api/users/me/avatar').set(auth('zed'));
    expect(gone.status).toBe(200); expect(gone.body.user.avatarUrl).toBe('');
    expect(onDisk().length).toBe(first.length - 1);
    expect((await request(app).get(`/api/users/${U.zed}/avatar`).set(auth('ana'))).status).toBe(404);
  });

  it('avatar uploads are rate limited per user', async () => {
    let last; for (let i = 0; i < 11; i += 1) last = await up('raj', PNG);
    expect(last.status).toBe(429); expect(last.body.code).toBe('RATE_LIMITED');
    expect((await up('ana', PNG)).status).toBe(200);                                                         // other users unaffected
  });
});
