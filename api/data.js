/**
 * Vercel Serverless Function (Node.js)
 * 경로: /api/data.js
 * 
 * Vercel 환경에서는 Vercel KV(무료 Redis)를 연결하여 데이터를 공유하고 저장합니다.
 * 로컬 개발 환경(Vercel CLI)이나 KV가 연결되지 않은 경우 자동으로 로컬 data.json 파일 쓰기로 폴백(Fallback)합니다.
 */

const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // CORS 헤더 설정 (가족 구성원들이 다양한 기기에서 접근할 수 있도록 개방)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // OPTIONS 프리플라이트 요청 대응
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Vercel KV 환경 변수 등록 확인
  const useKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

  // 1. GET 요청 처리 (데이터 조회)
  if (req.method === 'GET') {
    if (useKV) {
      try {
        // Vercel KV REST API를 호출하여 데이터 읽기
        const kvResponse = await fetch(process.env.KV_REST_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['GET', 'scheduler_data'])
        });
        const kvResult = await kvResponse.json();
        
        if (kvResult.result) {
          // 데이터가 존재하면 반환
          return res.status(200).json(JSON.parse(kvResult.result));
        } else {
          // 최초 실행 시 키가 없는 경우: 로컬 data.json의 기본 구조를 읽어 디비 초기 세팅(Seeding)
          const localDataPath = path.join(process.cwd(), 'data.json');
          const localDataStr = fs.readFileSync(localDataPath, 'utf8');
          
          await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(['SET', 'scheduler_data', localDataStr])
          });
          
          return res.status(200).json(JSON.parse(localDataStr));
        }
      } catch (err) {
        console.error('KV Database 읽기 오류:', err);
        return res.status(500).json({ error: 'KV 데이터베이스에서 값을 가져올 수 없습니다.' });
      }
    } else {
      // 로컬 개발/파일 시스템 폴백 (data.json 조회)
      try {
        const localDataPath = path.join(process.cwd(), 'data.json');
        const localData = fs.readFileSync(localDataPath, 'utf8');
        return res.status(200).json(JSON.parse(localData));
      } catch (err) {
        return res.status(500).json({ error: '로컬 data.json 파일을 조회할 수 없습니다.' });
      }
    }
  }

  // 2. POST 요청 처리 (데이터 업데이트)
  if (req.method === 'POST') {
    const updatedData = req.body;
    if (!updatedData) {
      return res.status(400).json({ error: '요청 바디가 비어있습니다.' });
    }

    if (useKV) {
      try {
        // Vercel KV REST API를 호출하여 데이터 저장
        await fetch(process.env.KV_REST_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['SET', 'scheduler_data', JSON.stringify(updatedData)])
        });
        
        return res.status(200).json({ success: true, message: 'Vercel KV 데이터베이스에 성공적으로 동기화되었습니다.' });
      } catch (err) {
        console.error('KV Database 쓰기 에러:', err);
        return res.status(500).json({ error: 'KV 데이터베이스에 저장하지 못했습니다.' });
      }
    } else {
      // 로컬 개발/파일 시스템 폴백 (data.json 쓰기)
      try {
        const localDataPath = path.join(process.cwd(), 'data.json');
        fs.writeFileSync(localDataPath, JSON.stringify(updatedData, null, 2), 'utf8');
        return res.status(200).json({ success: true, message: '로컬 data.json 파일에 성공적으로 저장되었습니다.' });
      } catch (err) {
        return res.status(500).json({ error: '로컬 data.json 파일 수정에 실패했습니다.' });
      }
    }
  }

  res.status(405).json({ error: '허용되지 않는 요청 메서드입니다.' });
};
