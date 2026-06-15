/**
 * 로컬 개발용 Express 서버
 * npm run dev → http://localhost:3000
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// GET /api/data — 데이터 조회
app.get('/api/data', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, raw) => {
    if (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'data.json 파일이 없습니다.' });
      return res.status(500).json({ error: '데이터를 읽는 도중 오류가 발생했습니다.' });
    }
    try { res.json(JSON.parse(raw)); }
    catch (e) { res.status(500).json({ error: 'JSON 파싱 에러' }); }
  });
});

// POST /api/data — 데이터 저장
app.post('/api/data', (req, res) => {
  if (!req.body) return res.status(400).json({ error: '요청 바디가 비어있습니다.' });
  fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
    if (err) return res.status(500).json({ error: '데이터를 저장하는 도중 오류가 발생했습니다.' });
    console.log(`[${new Date().toLocaleTimeString()}] 데이터 저장 완료.`);
    res.json({ success: true });
  });
});

// SPA 폴백
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('===================================================');
  console.log('  우리아이 공부 스케줄러 서버 정상 작동 중');
  console.log(`  접속: http://localhost:${PORT}`);
  console.log('===================================================');
});
