/**
 * Vercel Serverless Function — /api/data
 * Vercel KV가 연결되어 있으면 Redis 사용, 없으면 data.json 폴백
 */
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const useKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

  // GET — 데이터 조회
  if (req.method === 'GET') {
    if (useKV) {
      try {
        const kvRes = await fetch(process.env.KV_REST_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(['GET', 'scheduler_data'])
        });
        const kv = await kvRes.json();
        if (kv.result) return res.status(200).json(JSON.parse(kv.result));
        // KV 비어있으면 data.json으로 시드
        const seed = fs.readFileSync(path.join(process.cwd(), 'data.json'), 'utf8');
        await fetch(process.env.KV_REST_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(['SET', 'scheduler_data', seed])
        });
        return res.status(200).json(JSON.parse(seed));
      } catch (e) { return res.status(500).json({ error: 'KV 읽기 오류' }); }
    }
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), 'data.json'), 'utf8');
      return res.status(200).json(JSON.parse(raw));
    } catch (e) { return res.status(500).json({ error: 'data.json 조회 실패' }); }
  }

  // POST — 데이터 저장
  if (req.method === 'POST') {
    if (!req.body) return res.status(400).json({ error: '빈 요청' });
    if (useKV) {
      try {
        await fetch(process.env.KV_REST_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(['SET', 'scheduler_data', JSON.stringify(req.body)])
        });
        return res.status(200).json({ success: true });
      } catch (e) { return res.status(500).json({ error: 'KV 저장 실패' }); }
    }
    try {
      fs.writeFileSync(path.join(process.cwd(), 'data.json'), JSON.stringify(req.body, null, 2), 'utf8');
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'data.json 저장 실패' }); }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
