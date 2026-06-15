# 📚 우리아이 공부 스케줄러 & 데일리 To-Do

가족 모두가 공유하고 체크하는 아이의 공부 스케줄표 및 데일리 To-Do 시스템입니다.

---

## ✨ 주요 기능

1. **아이 공부방 (메인 대시보드)**
   - 오늘 요일 기반 공부 To-Do 리스트 자동 생성
   - 완료 체크 시 폭죽 효과 애니메이션
   - 오늘의 학습 완료율 프로그레스 바
   - 연속 공부 달성 스트릭 보드
   - 이번 주 달성 현황 캘린더
   - 다크/라이트 테마 전환

2. **부모 관리 모드 (어드민 대시보드)**
   - PIN 인증 기반 접근 제어
   - 주간 스케줄 CRUD (추가/수정/삭제)
   - 요일 간 일정 복사 기능
   - 다중 요일 일괄 과목 추가
   - 학습 히스토리 기록 모니터링
   - 자녀 프로필 관리 (다자녀 지원)
   - 격려 문구 관리
   - 데이터 백업/복원 (JSON Export/Import)

3. **보안 기능**
   - 공부방 접속 비밀번호 (외부 유출 방지)
   - 부모 관리자 PIN 인증
   - 기기 기억하기 옵션

---

## 🛠️ 기술 스택

| 구분 | 기술 |
|------|------|
| **Frontend** | Vanilla HTML5 + CSS3 + JavaScript (ES6+) |
| **Backend (Local)** | Node.js + Express |
| **Backend (Production)** | Vercel Serverless Functions |
| **Database (Production)** | Vercel KV (Redis) |
| **Database (Local)** | `data.json` 파일 |
| **Design** | Glassmorphism, Dark Mode, Google Fonts (Outfit, Noto Sans KR) |
| **Icons** | Font Awesome 6 |
| **배포** | GitHub + Vercel |

---

## 🚀 로컬 개발 환경 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 로컬 서버 실행
```bash
npm run dev
```

### 3. 브라우저에서 접속
- 공부방: `http://localhost:3000` (접속 PIN: `0000`)
- 부모 관리: `http://localhost:3000/admin.html` (관리자 PIN: `1234`)

---

## ☁️ Vercel 배포 방법

### 1. GitHub 저장소 생성 및 Push
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

### 2. Vercel 연동
1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인
2. **New Project** → 방금 Push한 GitHub 저장소 선택
3. **Deploy** 클릭 → 자동 배포 완료

### 3. Vercel KV (Redis) 연결 (영구 데이터 저장)
1. Vercel 대시보드 → 프로젝트 선택 → **Storage** 탭
2. **Create Database** → **KV** 선택
3. 자동으로 환경변수 (`KV_REST_API_URL`, `KV_REST_API_TOKEN`)가 설정됨
4. **Redeploy** 하면 Vercel KV를 통해 가족 모두 같은 데이터를 공유할 수 있음

> **참고**: KV를 연결하지 않아도 앱은 정상 동작합니다. 다만 Vercel Serverless 환경에서는 파일 시스템 쓰기가 불가하므로, KV 없이는 데이터가 영구 저장되지 않습니다. 로컬 개발 시에는 `data.json` 파일에 자동 저장됩니다.

---

## 📂 프로젝트 구조

```
Schedule/
├── api/
│   └── data.js          # Vercel Serverless Function (KV 연동)
├── index.html           # 아이 공부방 (메인 대시보드)
├── admin.html           # 부모 관리 모드
├── app.js               # 메인 대시보드 로직
├── admin.js             # 부모 관리 대시보드 로직
├── style.css            # 공용 스타일시트 (다크모드 포함)
├── data.json            # 기본 데이터 (소은이 스케줄)
├── server.js            # 로컬 개발용 Express 서버
├── package.json         # Node.js 의존성
├── vercel.json          # Vercel 배포 설정
└── .gitignore           # Git 추적 제외 파일
```

---

## ⚙️ 기본 설정 값

| 설정 항목 | 기본값 |
|-----------|--------|
| 공부방 접속 PIN | `0000` |
| 부모 관리자 PIN | `1234` |
| 기본 등록 자녀 | `소은이` (🧸) |

---

## 📄 라이선스

ISC
