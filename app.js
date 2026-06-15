/**
 * 우리아이 공부 스케줄러 - 고도화 메인 대시보드 JS
 */

// 글로벌 상태 저장소
let appData = null;
let apiEndpoint = '';
let activeChild = ''; // 현재 대시보드를 보는 아동 이름
const LOCAL_STORAGE_KEY = 'family_scheduler_data';

// 요일 영어 매핑 및 한글 라벨
const DAY_MAP_ENG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MAP_KOR = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// 페이지 로드 시 초기화
window.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initTheme();
  
  // 백엔드 감지 및 데이터 호출
  await detectBackend();
  await loadData();
  
  // 데이터 검증 및 마이그레이션 실행
  const isMigrated = migrateDataSchema();
  if (isMigrated) {
    await saveData();
  }

  // 프로필 편집 모달 리스너 사전 바인딩
  setupEditProfileModal();

  // 진입 통제 및 잠금장치 초기화
  setupLockScreenAndProfiles();
  
  // 이벤트 리스너 등록
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('profile-switch-btn').addEventListener('click', showProfileSelector);
});

/**
 * 1. 백엔드 환경 스마트 감지
 */
async function detectBackend() {
  // 로컬 컴퓨터에서 더블클릭해서 연 경우 -> LocalStorage 전용 모드
  if (window.location.protocol === 'file:') {
    apiEndpoint = 'local';
    console.log('Detected Environment: Offline (LocalStorage Mode)');
    return;
  }
  
  // 일반적인 웹 서버 환경 (Express 로컬 서버, Vercel 서버리스, 커스텀 도메인 등)
  apiEndpoint = '/api/data';
  console.log('Detected Environment: Web Server API (/api/data)');
}

/**
 * 2. 데이터 조회
 */
async function loadData() {
  if (apiEndpoint === 'local') {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
      appData = JSON.parse(localData);
    } else {
      try {
        const response = await fetch('data.json?t=' + Date.now());
        if (response.ok) {
          appData = await response.json();
          saveDataLocal();
        } else {
          throw new Error();
        }
      } catch (e) {
        appData = getFallbackMockData();
        saveDataLocal();
      }
    }
  } else {
    try {
      const cacheBustUrl = apiEndpoint + (apiEndpoint.includes('?') ? '&' : '?') + 't=' + Date.now();
      const response = await fetch(cacheBustUrl);
      if (response.ok) {
        appData = await response.json();
      } else {
        throw new Error();
      }
    } catch (err) {
      console.error('서버 연결 실패. 기기 로컬 데이터로 임시 로드합니다.', err);
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      appData = localData ? JSON.parse(localData) : getFallbackMockData();
    }
  }
}

/**
 * 3. 데이터 저장
 */
async function saveData() {
  if (apiEndpoint === 'local') {
    saveDataLocal();
    return true;
  }
  
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(appData)
    });
    
    const result = await response.json();
    if (result.success) {
      saveDataLocal();
      return true;
    } else {
      console.error('저장 실패: ', result.error);
      return false;
    }
  } catch (err) {
    console.error('서버 동기화 실패. 로컬에 임시 보관합니다.', err);
    saveDataLocal();
    return true;
  }
}

function saveDataLocal() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
}

/**
 * 4. 레거시 단일 아동 스키마 -> 다자녀 멀티 프로필 스키마 변환 (Migration)
 */
function migrateDataSchema() {
  let migrated = false;
  
  if (!appData) return false;
  
  // 1) 기본 설정 확인
  if (!appData.settings) {
    appData.settings = { parentPin: "1234", motivationalQuotes: [] };
    migrated = true;
  }
  
  // 2) 공부방 잠금 설정 확인
  if (appData.settings.roomLockEnabled === undefined) {
    appData.settings.roomLockEnabled = false;
    appData.settings.roomLockPin = "0000";
    migrated = true;
  }
  
  // 3) 레거시 스케줄 -> 다중 아동 스키마 변환
  if (!appData.children) {
    const oldName = appData.settings.childName || "아름이";
    
    appData.children = {
      [oldName]: {
        avatar: "🧸",
        weeklySchedule: appData.weeklySchedule || {
          monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
        },
        history: appData.history || {}
      }
    };
    
    appData.activeChild = oldName;
    
    // 이전 최상위 키 정리
    delete appData.weeklySchedule;
    delete appData.history;
    delete appData.settings.childName;
    
    migrated = true;
    console.log(`[Migration] 단일 자녀 '${oldName}' 데이터를 다자녀 프로필 구조로 성공적으로 변환 완료.`);
  }
  
  return migrated;
}

// 프로필 관리 기능용 글로벌 변수
let isProfileManageMode = false;
let parentAuthSuccessCallback = null;

/**
 * 5. 공부방 잠금장치 검증 및 프로필 선택기 핸들링
 */
function setupLockScreenAndProfiles() {
  const isDeviceUnlocked = localStorage.getItem('family_room_unlocked') === 'true' || sessionStorage.getItem('family_room_unlocked') === 'true';
  
  if (!isDeviceUnlocked) {
    // 무조건 잠금 화면을 띄움 (외부 유출 방지용 강제 보호)
    showLockScreen();
  } else {
    // 이미 해제되었으면 프로필 선택으로 유도
    checkActiveProfileSelection();
  }
}

// 공부방 잠금 해제 화면 핸들러
function showLockScreen() {
  const modal = document.getElementById('room-lock-modal');
  modal.classList.add('active');
  
  const inputs = document.querySelectorAll('.room-pin-input');
  inputs.forEach(i => i.value = '');
  setTimeout(() => inputs[0].focus(), 300);
  
  // 숫자 입력 시 다음 칸 점프
  inputs.forEach((input, index) => {
    input.oninput = () => {
      if (input.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      if (Array.from(inputs).every(i => i.value.length === 1)) {
        document.getElementById('room-pin-submit-btn').focus();
      }
    };
    input.onkeydown = (e) => {
      if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
        inputs[index - 1].focus();
      }
    };
  });
  
  const submitBtn = document.getElementById('room-pin-submit-btn');
  submitBtn.onclick = verifyRoomPin;
  
  // 엔터 키 대응
  inputEnterHandler = (e) => {
    if (e.key === 'Enter' && modal.classList.contains('active')) {
      verifyRoomPin();
    }
  };
  window.addEventListener('keypress', inputEnterHandler);
  
  function verifyRoomPin() {
    if (!appData) {
      alert('데이터가 아직 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
      return;
    }
    const enteredPin = Array.from(inputs).map(i => i.value).join('');
    const targetPin = (appData.settings && appData.settings.roomLockPin) ? appData.settings.roomLockPin : '0000';
    const parentBackupPin = (appData.settings && appData.settings.parentPin) ? appData.settings.parentPin : '1234';
    
    // 설정된 공부방 핀 또는 부모 핀(백업용)으로 해제 가능
    if (enteredPin === targetPin || enteredPin === parentBackupPin) {
      modal.classList.remove('active');
      window.removeEventListener('keypress', inputEnterHandler);
      
      // 기기 저장 유무 선택 처리
      const remember = document.getElementById('remember-device').checked;
      if (remember) {
        localStorage.setItem('family_room_unlocked', 'true');
      } else {
        sessionStorage.setItem('family_room_unlocked', 'true');
      }
      
      // 프로필 체크로 이동
      checkActiveProfileSelection();
    } else {
      const modalContent = modal.querySelector('.modal-content');
      modalContent.style.animation = 'wiggle 0.3s ease-in-out 3';
      setTimeout(() => {
        modalContent.style.animation = '';
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
      }, 500);
    }
  }
}

// 등록된 아이 프로필 선택 체크
function checkActiveProfileSelection() {
  const childrenNames = Object.keys(appData.children || {});
  
  if (childrenNames.length === 0) {
    // 등록된 자녀가 없을 경우 온보딩(최초 등록) 화면으로 진입
    showOnboardingScreen();
    return;
  }

  const rememberedProfile = localStorage.getItem('family_active_child');
  
  if (rememberedProfile && appData.children[rememberedProfile]) {
    // 1) 기기에 기억된 아동 프로필이 있으면 바로 메인 대시보드 로드
    activeChild = rememberedProfile;
    renderDashboard();
  } else if (appData.activeChild && appData.children[appData.activeChild]) {
    // 2) 기기 기억은 없으나 서버 DB에 활성 자녀 지정 값이 유효한 경우 바로 진입
    activeChild = appData.activeChild;
    localStorage.setItem('family_active_child', activeChild);
    renderDashboard();
  } else {
    // 3) 그 외에는 서버 DB에 등록된 첫 번째 자녀로 자동 진입 (최초 로그인 편의성)
    activeChild = childrenNames[0];
    localStorage.setItem('family_active_child', activeChild);
    renderDashboard();
  }
}

// 최초 자녀 등록 온보딩 모달 열기
function showOnboardingScreen() {
  const modal = document.getElementById('onboarding-modal');
  modal.classList.add('active');
  
  const childrenNames = Object.keys(appData.children || {});
  const cancelBtn = document.getElementById('onboard-cancel-btn');
  
  // 기존 등록된 아동이 있으면 취소 버튼을 활성화하여 다시 프로필 선택으로 나갈 수 있게 함
  if (childrenNames.length > 0) {
    cancelBtn.style.display = 'block';
    cancelBtn.onclick = () => {
      modal.classList.remove('active');
      showProfileSelector();
    };
  } else {
    cancelBtn.style.display = 'none';
  }
  
  const form = document.getElementById('onboarding-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('onboard-name').value.trim();
    const avatar = document.getElementById('onboard-avatar').value;
    
    if (!name) return;
    if (appData.children[name]) {
      alert('이미 동일한 이름의 아동 프로필이 존재합니다.');
      return;
    }
    
    // 자녀 등록 생성
    appData.children[name] = {
      avatar: avatar,
      weeklySchedule: {
        monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
      },
      history: {}
    };
    
    appData.activeChild = name;
    activeChild = name;
    localStorage.setItem('family_active_child', name);
    
    const isSaved = await saveData();
    if (isSaved) {
      modal.classList.remove('active');
      form.reset();
      isProfileManageMode = false;
      renderDashboard();
    }
  };
}

// 넷플릭스 스타일 프로필 선택 모달 열기
function showProfileSelector() {
  const modal = document.getElementById('profile-selection-modal');
  const container = document.getElementById('profile-list-container');
  const manageBtn = document.getElementById('profile-manage-btn');
  const titleEl = document.getElementById('profile-selection-title');
  const descEl = document.getElementById('profile-selection-desc');
  
  container.innerHTML = '';
  
  const childrenNames = Object.keys(appData.children || {});
  
  // 모드별 헤더 타이틀 및 설명 갱신
  if (isProfileManageMode) {
    titleEl.innerText = '⚙️ 프로필 관리';
    descEl.innerText = '수정하거나 삭제할 프로필을 선택해 주세요.';
    manageBtn.innerHTML = '<i class="fa-solid fa-check"></i> 관리 완료';
    manageBtn.className = 'btn btn-primary';
  } else {
    titleEl.innerText = '🧸 오늘 공부할 사람은 누구인가요?';
    descEl.innerText = '자기 프로필을 터치해 오늘 공부를 확인해 보세요!';
    manageBtn.innerHTML = '<i class="fa-solid fa-user-gear"></i> 프로필 관리';
    manageBtn.className = 'btn btn-secondary';
  }
  
  // 1) 등록된 아이들 프로필 렌더링
  childrenNames.forEach(name => {
    const child = appData.children[name];
    
    const card = document.createElement('div');
    card.className = `profile-card ${isProfileManageMode ? 'manage-mode' : ''}`;
    card.innerHTML = `
      <div class="profile-avatar-wrapper">
        ${child.avatar || '🧸'}
        <div class="edit-indicator"><i class="fa-solid fa-pen"></i></div>
      </div>
      <span class="profile-name">${name}</span>
    `;
    
    card.onclick = () => {
      if (isProfileManageMode) {
        // 프로필 관리(수정) 모드일 때
        openEditProfileModal(name);
      } else {
        // 일반 프로필 진입 모드일 때
        activeChild = name;
        localStorage.setItem('family_active_child', name); // 브라우저 기기에 현재 아동 고정
        modal.classList.remove('active');
        renderDashboard();
      }
    };
    
    container.appendChild(card);
  });
  
  // 2) 프로필 추가 버튼 카드 상시 노출
  const addCard = document.createElement('div');
  addCard.className = 'profile-card add-profile-card';
  addCard.innerHTML = `
    <div class="profile-avatar-wrapper">➕</div>
    <span class="profile-name">새 프로필 등록</span>
  `;
  
  addCard.onclick = () => {
    if (isProfileManageMode) {
      // 이미 부모인증이 되어 있으므로 즉시 온보딩창 노출
      modal.classList.remove('active');
      showOnboardingScreen();
    } else {
      // 접속 잠금 이후 부모 모드 인증 후 자녀 추가
      showParentAuthModal(() => {
        modal.classList.remove('active');
        showOnboardingScreen();
      });
    }
  };
  container.appendChild(addCard);
  
  // 3) 프로필 관리 토글 버튼 클릭 리스너 설정
  manageBtn.onclick = () => {
    if (isProfileManageMode) {
      isProfileManageMode = false;
      showProfileSelector();
    } else {
      // 프로필 관리 진입 시 보안을 위해 부모 비밀번호 확인
      showParentAuthModal(() => {
        isProfileManageMode = true;
        showProfileSelector();
      });
    }
  };
  
  modal.classList.add('active');
}

/**
 * 5-B. 부모 보안 핀(PIN) 번호 입력 확인 모달 (Front-end 단)
 */
function showParentAuthModal(successCallback) {
  parentAuthSuccessCallback = successCallback;
  const modal = document.getElementById('parent-auth-modal');
  modal.classList.add('active');
  
  const inputs = document.querySelectorAll('.parent-pin-input');
  inputs.forEach(i => i.value = '');
  setTimeout(() => inputs[0].focus(), 300);
  
  // 인풋 입력 포커스 이동 처리
  inputs.forEach((input, index) => {
    input.oninput = () => {
      if (input.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    };
    input.onkeydown = (e) => {
      if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
        inputs[index - 1].focus();
      }
    };
  });
  
  const submitBtn = document.getElementById('parent-auth-submit-btn');
  submitBtn.onclick = verifyParentPin;
  
  const cancelBtn = document.getElementById('parent-auth-cancel-btn');
  cancelBtn.onclick = () => {
    modal.classList.remove('active');
    parentAuthSuccessCallback = null;
  };
  
  // 엔터 입력 리스너 대응
  const authEnterHandler = (e) => {
    if (e.key === 'Enter' && modal.classList.contains('active')) {
      verifyParentPin();
    }
  };
  window.addEventListener('keypress', authEnterHandler);
  
  function verifyParentPin() {
    const enteredPin = Array.from(inputs).map(i => i.value).join('');
    const targetPin = appData.settings.parentPin || '1234';
    
    if (enteredPin === targetPin) {
      modal.classList.remove('active');
      window.removeEventListener('keypress', authEnterHandler);
      if (parentAuthSuccessCallback) {
        parentAuthSuccessCallback();
      }
      parentAuthSuccessCallback = null;
    } else {
      const modalContent = modal.querySelector('.modal-content');
      modalContent.style.animation = 'wiggle 0.3s ease-in-out 3';
      setTimeout(() => {
        modalContent.style.animation = '';
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
      }, 500);
    }
  }
}

/**
 * 5-C. 자녀 프로필 수정 모달 동작 설정
 */
function openEditProfileModal(name) {
  const modal = document.getElementById('edit-profile-modal');
  const child = appData.children[name];
  
  document.getElementById('edit-profile-original-name').value = name;
  document.getElementById('edit-profile-name').value = name;
  document.getElementById('edit-profile-avatar').value = child.avatar || '🧸';
  
  modal.classList.add('active');
}

function setupEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  const form = document.getElementById('edit-profile-form');
  const cancelBtn = document.getElementById('edit-profile-cancel-btn');
  const deleteBtn = document.getElementById('edit-profile-delete-btn');
  
  cancelBtn.onclick = () => {
    modal.classList.remove('active');
  };
  
  // 프로필 삭제 핸들러
  deleteBtn.onclick = async () => {
    const originalName = document.getElementById('edit-profile-original-name').value;
    const childrenNames = Object.keys(appData.children || {});
    
    if (childrenNames.length <= 1) {
      alert('최소 1명의 자녀 프로필은 삭제할 수 없습니다. 대신 수정해 주세요.');
      return;
    }
    
    if (confirm(`'${originalName}' 자녀의 모든 요일 스케줄과 완료 히스토리가 완전히 지워집니다. 정말 삭제하시겠습니까?`)) {
      delete appData.children[originalName];
      
      // 만약 지운 프로필이 현재 활성화되어 활성으로 지정되어 있다면 다른 자녀로 대체
      if (activeChild === originalName) {
        const remaining = Object.keys(appData.children);
        activeChild = remaining[0];
        localStorage.setItem('family_active_child', activeChild);
      }
      
      const isSaved = await saveData();
      if (isSaved) {
        modal.classList.remove('active');
        isProfileManageMode = false;
        showProfileSelector();
      }
    }
  };
  
  // 프로필 수정 제출 핸들러
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const originalName = document.getElementById('edit-profile-original-name').value;
    const newName = document.getElementById('edit-profile-name').value.trim();
    const newAvatar = document.getElementById('edit-profile-avatar').value;
    
    if (!newName) return;
    
    if (newName !== originalName && appData.children[newName]) {
      alert('이미 동일한 이름의 자녀 프로필이 존재합니다.');
      return;
    }
    
    const oldChildData = appData.children[originalName];
    
    if (newName !== originalName) {
      // 자녀 이름 변경 대응 (과목 정보 및 히스토리 보존 이전)
      appData.children[newName] = {
        avatar: newAvatar,
        weeklySchedule: oldChildData.weeklySchedule,
        history: oldChildData.history
      };
      delete appData.children[originalName];
      
      if (activeChild === originalName) {
        activeChild = newName;
        localStorage.setItem('family_active_child', newName);
      }
    } else {
      // 아바타 이모지만 수정
      oldChildData.avatar = newAvatar;
    }
    
    const isSaved = await saveData();
    if (isSaved) {
      modal.classList.remove('active');
      isProfileManageMode = false;
      showProfileSelector();
    }
  };
}

/**
 * 6. 실시간 시계 초기화
 */
function initClock() {
  const clockEl = document.getElementById('live-clock');
  
  function updateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayName = DAY_MAP_KOR[now.getDay()];
    
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');
    
    clockEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${year}년 ${month}월 ${date}일 (${dayName}) ${ampm} ${hoursStr}:${minutes}`;
  }
  
  updateTime();
  setInterval(updateTime, 1000);
}

/**
 * 7. 메인 대시보드 화면 렌더링 (아동 이름 기준)
 */
function renderDashboard() {
  if (!appData || !activeChild || !appData.children[activeChild]) return;
  
  const now = new Date();
  const todayDateStr = getFormattedDate(now);
  const todayDayNameEng = DAY_MAP_ENG[now.getDay()];
  
  const childData = appData.children[activeChild];
  
  // 1) 헤더 아바타 변경
  document.getElementById('child-avatar').innerText = childData.avatar || '🧸';
  
  // 2) 아이 맞춤형 그리팅 & 오늘의 격려 문구
  document.getElementById('welcome-message').innerText = `안녕, ${activeChild}! 👋`;
  
  const quotes = appData.settings.motivationalQuotes || [];
  if (quotes.length > 0) {
    const quoteIndex = now.getDate() % quotes.length;
    document.getElementById('motivational-quote').innerText = quotes[quoteIndex];
  }

  // 3) 오늘 과목 스케줄 가공 & To-Do 리스트 렌더링
  const rawTodaySchedule = childData.weeklySchedule[todayDayNameEng] || [];
  const todayHistory = childData.history[todayDateStr] || [];
  
  // 시간 지정이 있는 것을 우선 정렬하고, 지정이 없는 To-Do (anytime)는 맨 밑으로 정렬
  const todaySchedule = [...rawTodaySchedule].sort((a, b) => {
    const timeA = a.time || "";
    const timeB = b.time || "";
    if (timeA === "" && timeB !== "") return 1;
    if (timeA !== "" && timeB === "") return -1;
    return timeA.localeCompare(timeB);
  });
  
  const listContainer = document.getElementById('todo-list-container');
  listContainer.innerHTML = '';
  
  if (todaySchedule.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <p style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">오늘은 공식 공부 스케줄이 없는 날이에요!</p>
        <p style="font-size: 14px; color: var(--text-secondary);">자유롭게 책을 읽거나 신나게 놀아보세요.</p>
      </div>
    `;
  } else {
    todaySchedule.forEach(task => {
      const isCompleted = todayHistory.some(h => h.id === task.id);
      const completionItem = todayHistory.find(h => h.id === task.id);
      
      const todoItem = document.createElement('div');
      todoItem.className = `todo-item ${isCompleted ? 'completed' : ''}`;
      todoItem.dataset.taskId = task.id;
      
      const timeLabel = task.time ? `<i class="fa-regular fa-clock"></i> ${task.time}` : `<i class="fa-solid fa-calendar-day"></i> 오늘 중`;
      
      todoItem.innerHTML = `
        <div class="todo-left">
          <div class="todo-checkbox-wrapper">
            <div class="todo-checkmark"></div>
          </div>
          <div class="todo-details">
            <span class="todo-subject">${task.subject}</span>
            <span class="todo-title">${task.target}</span>
          </div>
        </div>
        <div class="todo-right">
          <div class="todo-time">${timeLabel}</div>
          ${isCompleted ? `<div class="completed-time"><i class="fa-solid fa-circle-check"></i> ${completionItem.completedAt.substring(0, 5)} 완료</div>` : ''}
        </div>
      `;
      
      todoItem.addEventListener('click', (e) => {
        toggleTaskCompletion(task, e);
      });
      
      listContainer.appendChild(todoItem);
    });
  }
  
  // 4) 달성률 바 갱신
  updateProgressBar(todaySchedule, todayHistory);
  
  // 5) 달성 도장 그리드 생성
  renderWeeklyStatusGrid();

  // 6) 연속 공부 일수 칭찬 보드 갱신
  renderStreakBoard();
}

/**
 * 8. To-Do 완료 체크 토글 핸들러
 */
async function toggleTaskCompletion(task, event) {
  const now = new Date();
  const todayDateStr = getFormattedDate(now);
  
  const childData = appData.children[activeChild];
  
  if (!childData.history[todayDateStr]) {
    childData.history[todayDateStr] = [];
  }
  
  const todayHistory = childData.history[todayDateStr];
  const existingIndex = todayHistory.findIndex(h => h.id === task.id);
  
  if (existingIndex > -1) {
    todayHistory.splice(existingIndex, 1);
  } else {
    const completedTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    todayHistory.push({
      id: task.id,
      subject: task.subject,
      target: task.target,
      completedAt: completedTimeStr,
      mood: 'proud'
    });
    
    // 클릭된 좌표 기준 폭죽 파티클 생성
    createConfettiEffect(event.clientX, event.clientY);
  }
  
  await saveData();
  renderDashboard();
}

/**
 * 9. 진척도 프로그레스 바 드로잉
 */
function updateProgressBar(todaySchedule, todayHistory) {
  const total = todaySchedule.length;
  if (total === 0) {
    document.getElementById('progress-bar-fill').style.width = '100%';
    document.getElementById('progress-text').innerText = '100%';
    return;
  }
  
  const completed = todaySchedule.filter(task => todayHistory.some(h => h.id === task.id)).length;
  const percentage = Math.round((completed / total) * 100);
  
  document.getElementById('progress-bar-fill').style.width = `${percentage}%`;
  document.getElementById('progress-text').innerText = `${percentage}%`;
}

/**
 * 10. 연속 학습(Streak) 계산 칭찬보드
 */
function renderStreakBoard() {
  let streak = 0;
  const now = new Date();
  const todayDateStr = getFormattedDate(now);
  const childData = appData.children[activeChild];
  
  const todayDayNameEng = DAY_MAP_ENG[now.getDay()];
  const todaySchedule = childData.weeklySchedule[todayDayNameEng] || [];
  const todayHistory = childData.history[todayDateStr] || [];
  const isTodayDone = todaySchedule.length > 0 && todaySchedule.every(task => todayHistory.some(h => h.id === task.id));
  
  let checkDate = new Date(now);
  checkDate.setDate(checkDate.getDate() - 1);
  
  while (true) {
    const checkDateStr = getFormattedDate(checkDate);
    const dayOfWeekEng = DAY_MAP_ENG[checkDate.getDay()];
    const scheduledTasks = childData.weeklySchedule[dayOfWeekEng] || [];
    const completedHistory = childData.history[checkDateStr] || [];
    
    // 태스크가 없는 날은 연속 기록을 끊지 않고 다음 날로 토스
    if (scheduledTasks.length === 0) {
      checkDate.setDate(checkDate.getDate() - 1);
      if (new Date(now) - checkDate > 30 * 24 * 60 * 60 * 1000) {
        break;
      }
      continue;
    }
    
    const allCompleted = scheduledTasks.every(task => completedHistory.some(h => h.id === task.id));
    if (allCompleted) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  if (isTodayDone) {
    streak++;
  }
  
  document.getElementById('streak-days').innerText = `${streak} 일째 이어지는 중!`;
  
  const encouragementEl = document.getElementById('streak-encouragement');
  if (streak === 0) {
    encouragementEl.innerText = "오늘 공부를 완수하면 내일 활활 타오르는 연속 공부 스탬프가 켜져요! 🔥";
  } else if (streak < 3) {
    encouragementEl.innerText = "멋져요! 포기하지 말고 내일 스탬프도 이어서 완성해봐요! 👍";
  } else if (streak < 7) {
    encouragementEl.innerText = "놀라워요! 벌써 며칠이나 연이어 계획을 실천하고 있네요. 최고야! 🌟";
  } else {
    encouragementEl.innerText = "우와! 한 주 넘게 약속을 지키며 대기록을 갱신 중이에요! 진정한 챔피언! 👑";
  }
}

/**
 * 11. 이번 주 요일 도장 캘린더 생성
 */
function renderWeeklyStatusGrid() {
  const now = new Date();
  const childData = appData.children[activeChild];
  
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + i);
    
    const targetDateStr = getFormattedDate(targetDate);
    const dayOfWeekEng = DAY_MAP_ENG[targetDate.getDay()];
    
    const scheduledTasks = childData.weeklySchedule[dayOfWeekEng] || [];
    const completedHistory = childData.history[targetDateStr] || [];
    
    const dayColId = `day-${dayOfWeekEng.substring(0, 3)}`;
    const dayColEl = document.getElementById(dayColId);
    
    if (!dayColEl) continue;
    
    if (targetDateStr === getFormattedDate(now)) {
      dayColEl.classList.add('today');
    } else {
      dayColEl.classList.remove('today');
    }
    
    const statusIconEl = dayColEl.querySelector('.day-status');
    statusIconEl.className = 'day-status';
    
    if (scheduledTasks.length === 0) {
      statusIconEl.innerHTML = '<i class="fa-solid fa-minus"></i>';
      statusIconEl.classList.add('none-task');
      statusIconEl.title = '학습 없음';
    } else {
      const completedCount = scheduledTasks.filter(task => completedHistory.some(h => h.id === task.id)).length;
      
      if (completedCount === scheduledTasks.length) {
        statusIconEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        statusIconEl.classList.add('completed');
        statusIconEl.title = '완료 도장 쾅!';
      } else if (completedCount > 0) {
        statusIconEl.innerHTML = '<i class="fa-solid fa-star-half-stroke"></i>';
        statusIconEl.classList.add('partial');
        statusIconEl.title = `일부 완료 (${completedCount}/${scheduledTasks.length})`;
      } else {
        statusIconEl.innerHTML = '<i class="fa-regular fa-circle"></i>';
        statusIconEl.title = '진행 중';
      }
    }
  }
}

/**
 * 12. 폭죽 효과 파티클 빌더
 */
function createConfettiEffect(x, y) {
  const colors = ['#6c5ce7', '#00cec9', '#2ecc71', '#f1c40f', '#ff7675', '#e84393', '#fd79a8'];
  const particleCount = 35;
  
  for (let i = 0; i < particleCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 35 + Math.random() * 80;
    const destX = Math.cos(angle) * distance;
    const destY = Math.sin(angle) * distance;
    
    const size = 6 + Math.random() * 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    confetti.style.width = `${size}px`;
    confetti.style.height = `${size}px`;
    confetti.style.backgroundColor = color;
    confetti.style.left = `${x}px`;
    confetti.style.top = `${y}px`;
    
    confetti.style.setProperty('--x', `${destX}px`);
    confetti.style.setProperty('--y', `${destY}px`);
    
    document.body.appendChild(confetti);
    
    confetti.addEventListener('animationend', () => {
      confetti.remove();
    });
  }
}

/**
 * 13. 화면 테마 변경
 */
function initTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    updateThemeIcon(true);
  } else {
    document.body.classList.remove('dark-theme');
    updateThemeIcon(false);
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem('app-theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector('#theme-toggle-btn i');
  if (icon) {
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

function getFormattedDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getFallbackMockData() {
  return {
    "settings": {
      "parentPin": "1234",
      "roomLockEnabled": true,
      "roomLockPin": "0000",
      "motivationalQuotes": [
        "오늘도 멋진 하루를 만들어봐요! ✨",
        "조금씩 꾸준히 하다 보면 기적이 온답니다! 🚀",
        "하루가 쌓이면 위대한 소은이가 온다!"
      ]
    },
    "children": {
      "소은이": {
        "avatar": "🧸",
        "weeklySchedule": {
          "monday": [
            { "id": "monday_1781143161742_160", "subject": "학교숙제", "target": "받아쓰기 공부", "time": "" },
            { "id": "monday_1781143195576_570", "subject": "필사", "target": "영어 필사", "time": "" },
            { "id": "monday_1781143354720_136", "subject": "수학", "target": "연산(기하)", "time": "" },
            { "id": "monday_1781143601854_876", "subject": "영어", "target": "영어학원 숙제", "time": "" },
            { "id": "monday_1781143627360_823", "subject": "영어", "target": "워들리와이즈", "time": "" },
            { "id": "monday_1781143671107_333", "subject": "영어", "target": "문법", "time": "" },
            { "id": "monday_1781143711867_541", "subject": "국어", "target": "기파랑", "time": "" },
            { "id": "monday_1781143758140_352", "subject": "국어", "target": "문법 - 초등/중등", "time": "" },
            { "id": "monday_1781143776786_663", "subject": "한자", "target": "한자", "time": "" }
          ],
          "tuesday": [
            { "id": "tuesday_1781143161742_682", "subject": "학교숙제", "target": "받아쓰기 공부", "time": "" },
            { "id": "tuesday_1781143373960_885", "subject": "수학", "target": "연산(대수)", "time": "" },
            { "id": "tuesday_1781143407474_765", "subject": "수학", "target": "매쓰넛&과외", "time": "" },
            { "id": "tuesday_1781143649960_820", "subject": "영어", "target": "단어시험준비", "time": "" },
            { "id": "tuesday_1781143711867_809", "subject": "국어", "target": "기파랑", "time": "" }
          ],
          "wednesday": [
            { "id": "wednesday_1781143195576_392", "subject": "필사", "target": "영어 필사", "time": "" },
            { "id": "wednesday_1781143238424_130", "subject": "학교숙제", "target": "주제글쓰기", "time": "" },
            { "id": "wednesday_1781143354720_574", "subject": "수학", "target": "연산(기하)", "time": "" },
            { "id": "wednesday_1781143407474_216", "subject": "수학", "target": "매쓰넛&과외", "time": "" },
            { "id": "wednesday_1781143627360_527", "subject": "영어", "target": "워들리와이즈", "time": "" },
            { "id": "wednesday_1781143649960_129", "subject": "영어", "target": "단어시험준비", "time": "" },
            { "id": "wednesday_1781143711867_768", "subject": "국어", "target": "기파랑", "time": "" },
            { "id": "wednesday_1781143776786_729", "subject": "한자", "target": "한자", "time": "" },
            { "id": "wednesday_1781143924504_458", "subject": "음악", "target": "플룻 연습 - 10분", "time": "" },
            { "id": "wednesday_1781143983981_322", "subject": "영재원", "target": "영재원 숙제", "time": "" }
          ],
          "thursday": [
            { "id": "thursday_1781143214824_236", "subject": "필사", "target": "한글 필사", "time": "" },
            { "id": "thursday_1781143260180_303", "subject": "학교숙제", "target": "배움공책", "time": "" },
            { "id": "thursday_1781143373960_525", "subject": "수학", "target": "연산(대수)", "time": "" },
            { "id": "thursday_1781143407474_247", "subject": "수학", "target": "매쓰넛&과외", "time": "" },
            { "id": "thursday_1781143601854_142", "subject": "영어", "target": "영어학원 숙제", "time": "" },
            { "id": "thursday_1781143627360_322", "subject": "영어", "target": "워들리와이즈", "time": "" },
            { "id": "thursday_1781143671107_487", "subject": "영어", "target": "문법", "time": "" },
            { "id": "thursday_1781143726492_208", "subject": "국어", "target": "기파랑 단어", "time": "" },
            { "id": "thursday_1781143820838_541", "subject": "과학", "target": "과학 문제집", "time": "" }
          ],
          "friday": [
            { "id": "friday_1781143214824_281", "subject": "필사", "target": "한글 필사", "time": "" },
            { "id": "friday_1781143373960_981", "subject": "수학", "target": "연산(대수)", "time": "21:00" },
            { "id": "friday_1781143407474_767", "subject": "수학", "target": "매쓰넛&과외", "time": "" },
            { "id": "friday_1781143627360_172", "subject": "영어", "target": "워들리와이즈", "time": "" },
            { "id": "friday_1781143739570_47", "subject": "국어", "target": "한끝 국어", "time": "" },
            { "id": "friday_1781143799449_537", "subject": "한자", "target": "온라인 수업", "time": "21:00" },
            { "id": "friday_1781143924504_681", "subject": "음악", "target": "플룻 연습 - 10분", "time": "" }
          ],
          "saturday": [
            { "id": "saturday_1781143161742_498", "subject": "학교숙제", "target": "받아쓰기 공부", "time": "" },
            { "id": "saturday_1781143326338_534", "subject": "일기", "target": "일기쓰기", "time": "" },
            { "id": "saturday_1781143432522_224", "subject": "수학", "target": "매쓰넛&과외 부족분", "time": "14:00" },
            { "id": "saturday_1781143924504_79", "subject": "음악", "target": "플룻 연습 - 10분", "time": "" },
            { "id": "saturday_1781143983981_830", "subject": "영재원", "target": "영재원 숙제", "time": "" }
          ],
          "sunday": [
            { "id": "sunday_1781143161742_842", "subject": "학교숙제", "target": "받아쓰기 공부", "time": "" },
            { "id": "sunday_1781143283944_976", "subject": "학교숙제", "target": "교과서 읽기", "time": "" },
            { "id": "sunday_1781143326338_273", "subject": "일기", "target": "일기쓰기", "time": "" },
            { "id": "sunday_1781143649960_155", "subject": "영어", "target": "단어시험준비", "time": "" },
            { "id": "sunday_1781143924504_210", "subject": "음악", "target": "플룻 연습 - 10분", "time": "" },
            { "id": "sunday_1781143983981_519", "subject": "영재원", "target": "영재원 숙제", "time": "" }
          ]
        },
        "history": {}
      }
    },
    "activeChild": "소은이"
  };
}
