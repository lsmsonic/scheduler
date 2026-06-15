/**
 * Synology Docker / Node.js 컨테이너 구동용 Express 서버
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname)); // 현재 디렉토리의 HTML, CSS, JS 정적 제공

// GET API: 데이터 조회
app.get('/api/data', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error('파일 읽기 에러:', err);
      // 만약 파일이 없다면 기본 틀 생성 시도
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'data.json 파일이 없습니다.' });
      }
      return res.status(500).json({ error: '데이터를 읽는 도중 오류가 발생했습니다.' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ error: 'JSON 파싱 에러' });
    }
  });
});

// POST API: 데이터 저장
app.post('/api/data', (req, res) => {
  const updatedData = req.body;
  
  if (!updatedData) {
    return res.status(400).json({ error: '데이터 본문이 비어있습니다.' });
  }

  // JSON 파일에 들여쓰기 2칸으로 정렬하여 저장
  fs.writeFile(DATA_FILE, JSON.stringify(updatedData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('파일 쓰기 에러:', err);
      return res.status(500).json({ error: '데이터를 저장하는 도중 오류가 발생했습니다.' });
    }
    console.log(`[${new Date().toLocaleTimeString()}] 데이터 저장 완료.`);
    res.json({ success: true, message: '데이터가 정상적으로 저장되었습니다.' });
  });
});

// SPA 지원 (선택사항: 라우팅 시 index.html로 폴백)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('===================================================');
  console.log(`  아이 공부 스케줄러 서버가 정상 작동 중입니다.`);
  console.log(`  접속 주소: http://localhost:${PORT}`);
  console.log('===================================================');
});
