/**
 * Vercel Serverless Function (Node.js)
 * 경로: /api/data
 *
 * Vercel 환경에서는 Vercel KV(무료 Redis)를 연결하여 데이터를 공유하고 저장합니다.
 * 로컬 개발 환경(Vercel CLI)이나 KV가 연결되지 않은 경우 자동으로 로컬 data.json 파일 쓰기로 폴백(Fallback)합니다.
 *
 * 보안: PIN(부모/공부방)은 절대 이 응답에 담기지 않는다(redactPins). PIN 검증은 /api/auth 에서
 * 서버사이드로만 수행한다. 쓰기(POST)는 최소 공부방 인증(room)을 요구하며, 설정/자녀 목록처럼
 * 민감한 변경은 부모 인증(parent)을 추가로 요구한다.
 */
const {
  isAuthed,
  readCurrentData,
  writeCurrentData,
  migratePinHashes,
  redactPins
} = require('./_lib');

// settings 안에서 "PIN 변경 시도" 또는 실제로 눈에 보이는 값 변경이 있었는지만 판단한다.
// (client는 GET 응답에서 PIN/해시 필드를 받은 적이 없으므로, 그 필드의 유무만으로 diff하면 항상 달라 보이게 됨)
function settingsChangeRequiresParentAuth(currentSettings, updatedSettings) {
  const cur = currentSettings || {};
  const upd = updatedSettings || {};

  if (upd.parentPin || upd.roomLockPin) return true; // 새 PIN 입력 시도
  if (JSON.stringify(upd.motivationalQuotes || []) !== JSON.stringify(cur.motivationalQuotes || [])) return true;
  if (Boolean(upd.roomLockEnabled) !== Boolean(cur.roomLockEnabled)) return true;

  return false;
}

module.exports = async (req, res) => {
  // 프론트엔드와 API가 동일한 Vercel 도메인에서 서빙되므로 별도 CORS 허용이 필요 없음(same-origin).

  if (req.method === 'GET') {
    try {
      const data = await readCurrentData();
      if (migratePinHashes(data)) {
        await writeCurrentData(data);
      }
      return res.status(200).json(redactPins(data));
    } catch (err) {
      console.error('데이터 조회 오류:', err);
      return res.status(500).json({ error: '데이터를 가져올 수 없습니다.' });
    }
  }

  if (req.method === 'POST') {
    if (!isAuthed(req, 'room')) {
      return res.status(401).json({ error: '인증이 필요합니다. 공부방 비밀번호를 다시 확인해주세요.' });
    }

    const updatedData = req.body;
    if (!updatedData) {
      return res.status(400).json({ error: '요청 바디가 비어있습니다.' });
    }

    try {
      const current = await readCurrentData();

      const currentChildKeys = Object.keys(current.children || {}).sort().join(',');
      const newChildKeys = Object.keys(updatedData.children || {}).sort().join(',');
      const childrenChanged = currentChildKeys !== newChildKeys;
      const settingsChanged = settingsChangeRequiresParentAuth(current.settings, updatedData.settings);

      if ((settingsChanged || childrenChanged) && !isAuthed(req, 'parent')) {
        return res.status(401).json({ error: '이 변경 사항은 부모 인증이 필요합니다.' });
      }

      // 클라이언트가 새 평문 PIN을 보냈으면 해시로 변환하고, 그렇지 않으면 기존 해시를 보존한다.
      // (클라이언트는 GET 응답에서 해시를 받아본 적이 없어 updatedData.settings에는 해시가 없음)
      migratePinHashes(updatedData);
      if (updatedData.settings && current.settings) {
        if (!updatedData.settings.parentPinHash && current.settings.parentPinHash) {
          updatedData.settings.parentPinHash = current.settings.parentPinHash;
        }
        if (!updatedData.settings.roomLockPinHash && current.settings.roomLockPinHash) {
          updatedData.settings.roomLockPinHash = current.settings.roomLockPinHash;
        }
      }

      await writeCurrentData(updatedData);
      return res.status(200).json({ success: true, message: '데이터가 정상적으로 저장되었습니다.' });
    } catch (err) {
      console.error('데이터 저장 오류:', err);
      return res.status(500).json({ error: '데이터를 저장하지 못했습니다.' });
    }
  }

  res.status(405).json({ error: '허용되지 않는 요청 메서드입니다.' });
};
