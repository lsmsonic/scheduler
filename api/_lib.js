/**
 * 공용 보안/데이터 헬퍼 (Vercel 서버리스 함수 간 공유)
 * 파일명이 _ 로 시작하므로 Vercel이 별도 라우트로 노출하지 않음.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me-in-vercel-env';
const DATA_KEY = 'scheduler_data';

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

function kvUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}
function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}
function hasKV() {
  return !!(kvUrl() && kvToken());
}

async function kvCommand(command) {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const result = await response.json();
  return result.result;
}

/** salt:hash(hex) 형태 문자열 반환 */
function hashPin(pin, existingSalt) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPinHash(pin, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.pbkdf2Sync(String(pin), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signToken(type, expiresAt) {
  const payload = `${type}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token, expectedType) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [type, expiresAtStr, sig] = parts;
  if (type !== expectedType) return false;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!expiresAt || Date.now() > expiresAt) return false;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${type}.${expiresAtStr}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = (req.headers && req.headers.cookie) || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

const COOKIE_NAMES = { room: 'room_token', parent: 'parent_token' };

/** parent 토큰은 room 권한도 포함(상위 권한). */
function isAuthed(req, requiredType) {
  const cookies = parseCookies(req);
  if (requiredType === 'parent') {
    return verifyToken(cookies[COOKIE_NAMES.parent], 'parent');
  }
  return (
    verifyToken(cookies[COOKIE_NAMES.room], 'room') ||
    verifyToken(cookies[COOKIE_NAMES.parent], 'parent')
  );
}

function buildAuthCookie(type, maxAgeSeconds) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const token = signToken(type, expiresAt);
  const name = COOKIE_NAMES[type];
  return `${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

function localDataPath() {
  return path.join(process.cwd(), 'public', 'data.json');
}

/** 현재 데이터 조회 (KV 우선, 없으면 로컬 data.json 시딩/폴백) */
async function readCurrentData() {
  if (hasKV()) {
    const result = await kvCommand(['GET', DATA_KEY]);
    if (result) return JSON.parse(result);
    const seedStr = fs.readFileSync(localDataPath(), 'utf8');
    await kvCommand(['SET', DATA_KEY, seedStr]);
    return JSON.parse(seedStr);
  }
  return JSON.parse(fs.readFileSync(localDataPath(), 'utf8'));
}

async function writeCurrentData(data) {
  const str = JSON.stringify(data, null, 2);
  if (hasKV()) {
    await kvCommand(['SET', DATA_KEY, str]);
    return;
  }
  fs.writeFileSync(localDataPath(), str, 'utf8');
}

/** 평문 PIN이 남아있으면 해시로 변환(구조 변경). 변경되었으면 true. */
function migratePinHashes(data) {
  if (!data || !data.settings) return false;
  let changed = false;
  if (data.settings.parentPin && !data.settings.parentPinHash) {
    data.settings.parentPinHash = hashPin(data.settings.parentPin);
    delete data.settings.parentPin;
    changed = true;
  }
  if (data.settings.roomLockPin && !data.settings.roomLockPinHash) {
    data.settings.roomLockPinHash = hashPin(data.settings.roomLockPin);
    delete data.settings.roomLockPin;
    changed = true;
  }
  return changed;
}

/** 클라이언트로 내려보내기 전 PIN(해시 포함) 필드 제거 */
function redactPins(data) {
  const clone = JSON.parse(JSON.stringify(data));
  if (clone.settings) {
    delete clone.settings.parentPin;
    delete clone.settings.parentPinHash;
    delete clone.settings.roomLockPin;
    delete clone.settings.roomLockPinHash;
  }
  return clone;
}

module.exports = {
  hasKV,
  kvCommand,
  hashPin,
  verifyPinHash,
  signToken,
  verifyToken,
  parseCookies,
  isAuthed,
  buildAuthCookie,
  COOKIE_NAMES,
  readCurrentData,
  writeCurrentData,
  migratePinHashes,
  redactPins
};
