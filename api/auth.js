/**
 * Vercel Serverless Function: POST /api/auth
 * PIN(부모/공부방)을 서버에서 해시 대비 검증하고, 성공 시 서명된 세션 토큰을
 * httpOnly 쿠키로 발급한다. PIN 원문/해시는 절대 응답 바디에 담지 않는다.
 */
const { hasKV, verifyPinHash, buildAuthCookie, readCurrentData, migratePinHashes, writeCurrentData, kvCommand } = require('./_lib');

const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_SECONDS = 300;
const ROOM_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24시간 (기기 잠금 해제 후 하루 유지)
const PARENT_TOKEN_TTL_SECONDS = 60 * 60; // 1시간 (관리 세션)

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// 간이 rate limit (KV 있을 때만 동작 — 로컬 개발 환경에서는 생략)
async function getAttempts(key) {
  const val = await kvCommand(['GET', key]);
  return val ? parseInt(val, 10) : 0;
}

async function bumpAttempts(key) {
  const next = (await getAttempts(key)) + 1;
  await kvCommand(['SET', key, String(next), 'EX', String(LOCK_WINDOW_SECONDS)]);
  return next;
}

async function resetAttempts(key) {
  await kvCommand(['DEL', key]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않는 요청 메서드입니다.' });
  }

  const { type, pin } = req.body || {};
  if (type !== 'room' && type !== 'parent') {
    return res.status(400).json({ error: '잘못된 인증 유형입니다.' });
  }
  if (!pin || typeof pin !== 'string' || pin.length !== 4) {
    return res.status(400).json({ error: 'PIN 번호 4자리를 입력해주세요.' });
  }

  const attemptsKey = `auth_attempts:${type}:${clientIp(req)}`;

  try {
    if (hasKV()) {
      const attempts = await getAttempts(attemptsKey);
      if (attempts >= MAX_ATTEMPTS) {
        return res
          .status(423)
          .json({ error: `PIN을 ${MAX_ATTEMPTS}회 이상 잘못 입력했습니다. 5분 후 다시 시도해주세요.` });
      }
    }

    const data = await readCurrentData();
    if (migratePinHashes(data)) {
      await writeCurrentData(data);
    }
    const settings = data.settings || {};

    const parentHash = settings.parentPinHash || null;
    const roomHash = settings.roomLockPinHash || null;

    let ok = false;
    if (type === 'parent') {
      ok = verifyPinHash(pin, parentHash);
    } else {
      // 공부방 진입은 공부방 PIN 또는 부모 마스터 PIN 둘 다 허용 (기존 UX와 동일)
      ok = verifyPinHash(pin, roomHash) || verifyPinHash(pin, parentHash);
    }

    if (!ok) {
      if (hasKV()) await bumpAttempts(attemptsKey);
      return res.status(401).json({ error: 'PIN 번호가 일치하지 않습니다.' });
    }

    if (hasKV()) await resetAttempts(attemptsKey);

    const ttl = type === 'parent' ? PARENT_TOKEN_TTL_SECONDS : ROOM_TOKEN_TTL_SECONDS;
    res.setHeader('Set-Cookie', buildAuthCookie(type, ttl));
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('인증 처리 오류:', err);
    return res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
  }
};
