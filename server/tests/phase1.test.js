import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.GROQ_API_KEY = '';
process.env.GEMINI_API_KEY = 'your_gemini_api_key';
const { requireFeature, features } = require('../config/aiConfig');
const app = require('../app');

describe('phase 1 gate (no DB required)', () => {
  it('placeholder/empty keys disable features', () => {
    expect(features).toEqual({ transcription: false, language: false, search: false });
  });
  it('missing key -> 503 FEATURE_NOT_CONFIGURED', async () => {
    const a = express(); a.get('/x', requireFeature('transcription'), (q, r) => r.json({}));
    const r = await request(a).get('/x');
    expect(r.status).toBe(503); expect(r.body.code).toBe('FEATURE_NOT_CONFIGURED');
  });
  it('/api/ai/status exposes flags only', async () => {
    const r = await request(app).get('/api/ai/status');
    expect(r.status).toBe(200); expect(JSON.stringify(r.body)).not.toMatch(/key/i);
  });
  it('auth required for /me', async () => { expect((await request(app).get('/api/auth/me')).status).toBe(401); });
  it('invalid register body -> 400', async () => {
    const r = await request(app).post('/api/auth/register').send({ email: 'bad' });
    expect(r.status).toBe(400); expect(r.body.code).toBe('VALIDATION_ERROR');
  });
  it('$-keys rejected', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'x' });
    expect(r.status).toBe(400);
  });
});
