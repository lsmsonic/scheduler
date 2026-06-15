/**
 * 우리아이 공부 스케줄러 - 고도화 부모 관리 대시보드 JS
 */

let appData = null;
let apiEndpoint = '';
const LOCAL_STORAGE_KEY = 'family_scheduler_data';

const DAY_MAP_ENG = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_MAP_KOR = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

// 현재 설정 편집 탭 등에서 선택 중인 자녀 임시 값
let currentSelectedChildPlanner = '';
let currentSelectedChildHistory = '';
let editingChildName = ''; // 현재 수정 중인 자녀 프로필명 (비어있으면 신규 등록 모드)

// 페이지 로드 시 초기화
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupPinInputs();
  
  // 백엔드 감지 및 데이터 로드
  await detectBackend();
  await loadData();
  
  // 데이터 검증 및 마이그레이션 실행
  const isMigrated = migrateDataSchema();
  if (isMigrated) {
    await saveData();
  }

  // 비밀번호 검증 및 어드민 기능 연동
  setupPinVerification();
  setupTabSystem();
  setupSettingsForm();
  setupAnytimeCheckbox();
  setupCopyModal();
});

/**
 * 1. 백엔드 환경 감지
 */
async function detectBackend() {
  if (window.location.protocol === 'file:') {
    apiEndpoint = 'local';
    return;
  }
  
  if (window.location.port === '3000') {
    apiEndpoint = '/api/data';
    return;
  }

  if (window.location.hostname.endsWith('.vercel.app')) {
    apiEndpoint = '/api/data';
    return;
  }

  apiEndpoint = 'api.php';
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
        } else {
          throw new Error('data.json load failed');
        }
      } catch (e) {
        appData = getFallbackMockData();
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
      }
    }
  } else {
    try {
      const cacheBustUrl = apiEndpoint + (apiEndpoint.includes('?') ? '&' : '?') + 't=' + Date.now();
      const response = await fetch(cacheBustUrl);
      if (response.ok) {
        appData = await response.json();
      } else {
        throw new Error('Server API load failed');
      }
    } catch (err) {
      console.error('서버 연결 실패. 로컬 백업 데이터를 로드합니다.', err);
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
    return true;
  }
  
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appData)
    });
    
    const result = await response.json();
    if (result.success) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
      return true;
    } else {
      alert('저장 오류: ' + result.error);
      return false;
    }
  } catch (err) {
    console.error('서버 동기화 실패. 로컬 캐시에 보관합니다.', err);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
    return true;
  }
}

/**
 * 4. 레거시 데이터 마이그레이션 함수
 */
function migrateDataSchema() {
  let migrated = false;
  if (!appData) return false;
  
  if (!appData.settings) {
    appData.settings = { parentPin: "1234", motivationalQuotes: [] };
    migrated = true;
  }
  
  if (appData.settings.roomLockEnabled === undefined) {
    appData.settings.roomLockEnabled = false;
    appData.settings.roomLockPin = "0000";
    migrated = true;
  }
  
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
    
    delete appData.weeklySchedule;
    delete appData.history;
    delete appData.settings.childName;
    
    migrated = true;
  }
  
  return migrated;
}

/**
 * 5. PIN 패스워드 인증 모달 로직
 */
function setupPinInputs() {
  const inputs = document.querySelectorAll('.pin-dot-input');
  
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      if (input.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      if (Array.from(inputs).every(i => i.value.length === 1)) {
        document.getElementById('pin-submit-btn').focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
        inputs[index - 1].focus();
      }
    });
  });

  document.getElementById('pin-cancel-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

function setupPinVerification() {
  const submitBtn = document.getElementById('pin-submit-btn');
  const modal = document.getElementById('pin-modal');
  const inputs = document.querySelectorAll('.pin-dot-input');
  
  setTimeout(() => inputs[0].focus(), 300);

  submitBtn.addEventListener('click', verifyPin);
  
  window.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && modal.classList.contains('active')) {
      verifyPin();
    }
  });

  function verifyPin() {
    if (!appData) {
      alert('데이터가 아직 로드되지 않았습니다. 페이지를 새로고침 하거나 서버 상태를 확인해주세요.');
      return;
    }
    const enteredPin = Array.from(inputs).map(input => input.value).join('');
    const targetPin = (appData.settings && appData.settings.parentPin) ? appData.settings.parentPin : '1234';
    
    if (enteredPin === targetPin) {
      modal.classList.remove('active');
      
      // 초기 아동 기본값 셋업
      const childrenNames = Object.keys(appData.children || {});
      currentSelectedChildPlanner = childrenNames[0] || '';
      currentSelectedChildHistory = childrenNames[0] || '';
      
      // 드롭다운 셀렉트 박스들 채우기
      updateChildSelectDropdowns();
      
      renderWeeklyPlanner();
      renderHistoryLogs();
    } else {
      const modalContent = modal.querySelector('.modal-content');
      modalContent.style.animation = 'wiggle 0.3s ease-in-out 3';
      
      setTimeout(() => {
        modalContent.style.animation = '';
        inputs.forEach(input => input.value = '');
        inputs[0].focus();
      }, 500);
    }
  }
}

// 자녀 선택 드롭다운 목록 갱신
function updateChildSelectDropdowns() {
  const plannerSelect = document.getElementById('planner-child-select');
  const historySelect = document.getElementById('history-child-select');
  
  plannerSelect.innerHTML = '';
  historySelect.innerHTML = '';
  
  const childrenNames = Object.keys(appData.children || {});
  
  childrenNames.forEach(name => {
    const child = appData.children[name];
    const optionText = `${child.avatar || '🧸'} ${name}`;
    
    plannerSelect.innerHTML += `<option value="${name}">${optionText}</option>`;
    historySelect.innerHTML += `<option value="${name}">${optionText}</option>`;
  });
  
  // 이전 선택 상태 유지 복구
  if (childrenNames.includes(currentSelectedChildPlanner)) {
    plannerSelect.value = currentSelectedChildPlanner;
  } else {
    currentSelectedChildPlanner = plannerSelect.value;
  }
  
  if (childrenNames.includes(currentSelectedChildHistory)) {
    historySelect.value = currentSelectedChildHistory;
  } else {
    currentSelectedChildHistory = historySelect.value;
  }

  // 드롭다운 변경 감지 이벤트 설정
  plannerSelect.onchange = () => {
    currentSelectedChildPlanner = plannerSelect.value;
    renderWeeklyPlanner();
  };
  
  historySelect.onchange = () => {
    currentSelectedChildHistory = historySelect.value;
    renderHistoryLogs();
  };
}

/**
 * 6. 탭 메뉴 전환 연동
 */
function setupTabSystem() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
      
      if (targetId === 'weekly-schedule-tab') {
        renderWeeklyPlanner();
      } else if (targetId === 'history-log-tab') {
        renderHistoryLogs();
      }
    });
  });
}

/**
 * 7. 주간 스케줄 플래너 렌더링 (자녀 이름 기준)
 */
function renderWeeklyPlanner() {
  const plannerContainer = document.getElementById('weekly-planner-container');
  plannerContainer.innerHTML = '';
  
  if (!currentSelectedChildPlanner || !appData.children[currentSelectedChildPlanner]) {
    plannerContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-secondary);">
        등록된 자녀가 없습니다. 환경설정에서 자녀 프로필을 생성해 주세요.
      </div>
    `;
    return;
  }

  const childData = appData.children[currentSelectedChildPlanner];
  
  DAY_MAP_ENG.forEach((dayEng, idx) => {
    const dayKor = DAY_MAP_KOR[idx];
    const tasks = childData.weeklySchedule[dayEng] || [];
    
    const dayCard = document.createElement('div');
    dayCard.className = 'planner-day-card';
    
    // 카드 헤더 (일정 복사 버튼 추가)
    let cardHtml = `
      <div class="day-card-header">
        <span class="day-card-title">${dayKor} (${dayEng.toUpperCase().substring(0,3)})</span>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary copy-day-trigger-btn" data-day="${dayEng}" style="padding: 6px 10px; font-size: 11px;" title="일정 복사">
            <i class="fa-solid fa-copy"></i> 복사
          </button>
          <button class="btn btn-secondary add-task-trigger-btn" data-day="${dayEng}" style="padding: 6px 10px; font-size: 11px;">
            <i class="fa-solid fa-plus"></i> 추가
          </button>
        </div>
      </div>
      <div class="day-card-tasks" id="tasks-list-${dayEng}">
    `;
    
    // 카드 할일 목록
    if (tasks.length === 0) {
      cardHtml += `
        <div style="font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 24px;">
          등록된 공부가 없습니다.
        </div>
      `;
    } else {
      // 시간 지정이 있는 것을 우선 정렬하고, 지정이 없는 To-Do (anytime)는 맨 밑으로 정렬
      const sortedTasks = [...tasks].sort((a, b) => {
        const timeA = a.time || "";
        const timeB = b.time || "";
        if (timeA === "" && timeB !== "") return 1;
        if (timeA !== "" && timeB === "") return -1;
        return timeA.localeCompare(timeB);
      });
      
      sortedTasks.forEach(task => {
        const timeLabel = task.time ? `<i class="fa-regular fa-clock"></i> ${task.time}` : `<i class="fa-solid fa-calendar-day"></i> 오늘 중 (To-Do)`;
        
        cardHtml += `
          <div class="admin-task-item">
            <div class="admin-task-details">
              <span class="admin-task-subject">${task.subject}</span>
              <span class="admin-task-target">${task.target}</span>
              <span class="admin-task-time">${timeLabel}</span>
            </div>
            <div class="admin-task-actions">
              <button class="icon-btn icon-btn-edit edit-task-btn" data-day="${dayEng}" data-id="${task.id}" title="수정">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="icon-btn delete-task-btn" data-day="${dayEng}" data-id="${task.id}" title="삭제">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      });
    }
    
    cardHtml += `</div>`;
    dayCard.innerHTML = cardHtml;
    plannerContainer.appendChild(dayCard);
  });
  
  bindPlannerEvents();
}

function bindPlannerEvents() {
  // 1) 과목 추가 모달 열기 버튼
  document.querySelectorAll('.add-task-trigger-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openTaskModal(btn.dataset.day);
    });
  });

  // 2) 요일 복사 모달 열기 버튼
  document.querySelectorAll('.copy-day-trigger-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openCopyModal(btn.dataset.day);
    });
  });

  // 3) 과목 수정 모달 열기 버튼
  document.querySelectorAll('.edit-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;
      const taskId = btn.dataset.id;
      const childData = appData.children[currentSelectedChildPlanner];
      const task = childData.weeklySchedule[day].find(t => t.id === taskId);
      if (task) {
        openTaskModal(day, task);
      }
    });
  });

  // 4) 과목 삭제 버튼
  document.querySelectorAll('.delete-task-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const day = btn.dataset.day;
      const taskId = btn.dataset.id;
      const childData = appData.children[currentSelectedChildPlanner];
      const task = childData.weeklySchedule[day].find(t => t.id === taskId);
      
      if (confirm(`'${task.subject} - ${task.target}' 과목을 스케줄에서 완전히 삭제하시겠습니까?`)) {
        childData.weeklySchedule[day] = childData.weeklySchedule[day].filter(t => t.id !== taskId);
        await saveData();
        renderWeeklyPlanner();
      }
    });
  });
}

/**
 * 8. 일정 상세정보 기입 팝업 모달 제어
 */
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');

function openTaskModal(day, task = null) {
  taskModal.classList.add('active');
  document.getElementById('task-form-day').value = day;
  
  const titleEl = document.getElementById('task-modal-title');
  const dayKor = DAY_MAP_KOR[DAY_MAP_ENG.indexOf(day)];
  
  const anytimeCheckbox = document.getElementById('form-anytime');
  const timeInput = document.getElementById('form-time');
  const daysGroup = document.getElementById('form-days-group');

  if (task) {
    // 수정 모드
    titleEl.innerHTML = `✍️ '${currentSelectedChildPlanner}' - '${dayKor}' 스케줄 수정`;
    document.getElementById('task-form-id').value = task.id;
    document.getElementById('form-subject').value = task.subject;
    document.getElementById('form-target').value = task.target;
    
    // 요일 일괄 추가 박스 숨김
    daysGroup.style.display = 'none';
    
    if (!task.time) {
      anytimeCheckbox.checked = true;
      timeInput.disabled = true;
      timeInput.required = false;
      timeInput.value = '12:00';
      timeInput.style.opacity = '0.5';
    } else {
      anytimeCheckbox.checked = false;
      timeInput.disabled = false;
      timeInput.required = true;
      timeInput.value = task.time;
      timeInput.style.opacity = '1';
    }
  } else {
    // 신규 추가 모드
    titleEl.innerHTML = `➕ '${currentSelectedChildPlanner}' - '${dayKor}' 스케줄 추가`;
    document.getElementById('task-form-id').value = '';
    document.getElementById('form-subject').value = '';
    document.getElementById('form-target').value = '';
    
    // 요일 일괄 추가 박스 보임 및 클릭한 요일만 활성화
    daysGroup.style.display = 'block';
    const dayCheckboxes = document.querySelectorAll('input[name="form-days"]');
    dayCheckboxes.forEach(cb => {
      cb.checked = (cb.value === day);
    });
    
    anytimeCheckbox.checked = false;
    timeInput.disabled = false;
    timeInput.required = true;
    timeInput.value = '14:00';
    timeInput.style.opacity = '1';
  }
}

function closeTaskModal() {
  taskModal.classList.remove('active');
  taskForm.reset();
}

// 팝업 취소 버튼
document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);

// 팝업 저장 서브밋 핸들러
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const day = document.getElementById('task-form-day').value;
  const taskId = document.getElementById('task-form-id').value;
  const subject = document.getElementById('form-subject').value.trim();
  const target = document.getElementById('form-target').value.trim();
  
  const isAnytime = document.getElementById('form-anytime').checked;
  const time = isAnytime ? "" : document.getElementById('form-time').value;
  
  const childData = appData.children[currentSelectedChildPlanner];
  
  if (taskId) {
    // 1) 수정 처리
    if (!childData.weeklySchedule[day]) childData.weeklySchedule[day] = [];
    const taskIdx = childData.weeklySchedule[day].findIndex(t => t.id === taskId);
    if (taskIdx > -1) {
      childData.weeklySchedule[day][taskIdx] = { id: taskId, subject, target, time };
    }
  } else {
    // 2) 신규 추가 처리 (다중 요일 일괄 추가)
    const selectedDays = Array.from(document.querySelectorAll('input[name="form-days"]:checked')).map(cb => cb.value);
    
    if (selectedDays.length === 0) {
      alert('적용할 요일을 최소 하나 이상 선택해 주세요.');
      return;
    }
    
    selectedDays.forEach(d => {
      if (!childData.weeklySchedule[d]) {
        childData.weeklySchedule[d] = [];
      }
      const newId = `${d}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      childData.weeklySchedule[d].push({ id: newId, subject, target, time });
    });
  }
  
  const isSaved = await saveData();
  if (isSaved) {
    closeTaskModal();
    renderWeeklyPlanner();
  }
});

/**
 * 9. 학습 히스토리 내역 렌더링 (자녀 기준)
 */
function renderHistoryLogs() {
  const container = document.getElementById('history-timeline-container');
  container.innerHTML = '';
  
  if (!currentSelectedChildHistory || !appData.children[currentSelectedChildHistory]) {
    container.innerHTML = `
      <div class="empty-state">
        <p>선택된 아동이 없거나 기록 데이터가 없습니다.</p>
      </div>
    `;
    return;
  }

  const childData = appData.children[currentSelectedChildHistory];
  const history = childData.history || {};
  const dates = Object.keys(history).sort((a, b) => b.localeCompare(a)); // 최신 날짜 역순
  
  if (dates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>'${currentSelectedChildHistory}'의 완료 스탬프 내역이 아직 존재하지 않습니다.</p>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">공부방에서 공부를 완수하고 체크를 클릭하면 기록이 보관됩니다.</p>
      </div>
    `;
    return;
  }
  
  dates.forEach(dateStr => {
    const records = history[dateStr];
    if (!records || records.length === 0) return;
    
    const dateObj = new Date(dateStr);
    const dayLabel = DAY_MAP_KOR[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]; // 월요일 시작 가공
    
    const dayGroup = document.createElement('div');
    dayGroup.className = 'history-day-group';
    
    let groupHtml = `
      <div class="history-day-header">
        <span>📅 ${dateStr} (${dayLabel})</span>
        <span style="color: var(--text-muted); font-size: 13px;">총 ${records.length}과목 완수</span>
      </div>
      <div class="history-task-list">
    `;
    
    const sortedRecords = [...records].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    
    sortedRecords.forEach(rec => {
      groupHtml += `
        <div class="history-task-item">
          <div class="history-task-left">
            <span class="history-badge">참 잘했어요 💮</span>
            <strong style="color: var(--text-primary);">${rec.subject}</strong>
            <span style="color: var(--text-secondary); margin-left: 8px;">${rec.target}</span>
          </div>
          <span class="history-time"><i class="fa-regular fa-clock"></i> ${rec.completedAt} 완료</span>
        </div>
      `;
    });
    
    groupHtml += '</div>';
    dayGroup.innerHTML = groupHtml;
    container.appendChild(dayGroup);
  });
}

/**
 * 10. 환경 설정 양식 연동
 */
function setupSettingsForm() {
  if (!appData || !appData.settings) return;
  const saveBtn = document.getElementById('save-settings-btn');
  const addQuoteBtn = document.getElementById('add-quote-btn');
  const addProfileBtn = document.getElementById('add-child-profile-btn');
  const roomLockPinGroup = document.getElementById('room-lock-pin-group');
  
  // 1) 기본 설정 및 비밀번호 바인딩
  document.getElementById('setting-parent-pin').value = appData.settings.parentPin || '1234';
  document.getElementById('setting-room-lock-pin').value = appData.settings.roomLockPin || '0000';
  roomLockPinGroup.style.display = 'block';
  
  // 2) 자녀 프로필 리스트 렌더링
  renderChildrenProfilesList();
  
  // 3) 자녀 추가 및 수정 버튼 바인딩
  addProfileBtn.onclick = () => {
    const nameInput = document.getElementById('new-child-name');
    const name = nameInput.value.trim();
    const avatar = document.getElementById('new-child-avatar').value;
    
    if (!name) {
      alert('자녀 이름을 기입해주세요.');
      return;
    }
    
    if (editingChildName) {
      if (name !== editingChildName && appData.children[name]) {
        alert('이미 같은 이름의 다른 자녀 프로필이 존재합니다.');
        return;
      }
      
      const oldChildData = appData.children[editingChildName];
      
      if (name !== editingChildName) {
        appData.children[name] = {
          avatar: avatar,
          weeklySchedule: oldChildData.weeklySchedule,
          history: oldChildData.history
        };
        delete appData.children[editingChildName];
        
        if (appData.activeChild === editingChildName) appData.activeChild = name;
        if (currentSelectedChildPlanner === editingChildName) currentSelectedChildPlanner = name;
        if (currentSelectedChildHistory === editingChildName) currentSelectedChildHistory = name;
        
        if (localStorage.getItem('family_active_child') === editingChildName) {
          localStorage.setItem('family_active_child', name);
        }
      } else {
        oldChildData.avatar = avatar;
      }
      
      alert(`'${editingChildName}' 자녀의 프로필 정보가 수정되었습니다! 설정 저장을 눌러 변경 사항을 마쳐주세요.`);
      resetChildEditState();
      
    } else {
      if (appData.children[name]) {
        alert('이미 같은 이름의 자녀 프로필이 존재합니다.');
        return;
      }
      
      appData.children[name] = {
        avatar: avatar,
        weeklySchedule: {
          monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
        },
        history: {}
      };
      
      nameInput.value = '';
      alert(`'${name}' 자녀가 정상 등록되었습니다! 설정 저장을 눌러 변경 사항을 마쳐주세요.`);
    }
    
    renderChildrenProfilesList();
    updateChildSelectDropdowns();
  };

  // 4) 격려 문구 편집기 세팅
  renderQuotesEditor();
  
  addQuoteBtn.addEventListener('click', () => {
    const quotesEditor = document.getElementById('quotes-list-editor');
    const wrapper = createQuoteInputRow('');
    quotesEditor.appendChild(wrapper);
    wrapper.querySelector('input').focus();
  });
  
  // 5) 전체 설정 변경 저장
  saveBtn.addEventListener('click', async () => {
    const parentPin = document.getElementById('setting-parent-pin').value.trim();
    const roomLockPin = document.getElementById('setting-room-lock-pin').value.trim();
    
    if (parentPin.length !== 4 || isNaN(parentPin)) {
      alert('관리자 PIN 번호는 4자리 숫자여야 합니다.');
      return;
    }
    if (roomLockPin.length !== 4 || isNaN(roomLockPin)) {
      alert('공부방 접속 비밀번호는 4자리 숫자여야 합니다.');
      return;
    }
    
    const childrenNames = Object.keys(appData.children || {});
    if (childrenNames.length === 0) {
      alert('최소 한 명 이상의 자녀 프로필이 등록되어 있어야 합니다.');
      return;
    }
    
    const quoteInputs = document.querySelectorAll('.quote-editor-input');
    const newQuotes = Array.from(quoteInputs)
      .map(input => input.value.trim())
      .filter(val => val.length > 0);
      
    if (newQuotes.length === 0) {
      alert('최소 1개 이상의 격려 문구를 입력해주세요.');
      return;
    }
    
    appData.settings.parentPin = parentPin;
    appData.settings.roomLockEnabled = true; // 항상 접속 잠금 강제 사용
    appData.settings.roomLockPin = roomLockPin;
    appData.settings.motivationalQuotes = newQuotes;
    
    const isSaved = await saveData();
    if (isSaved) {
      alert('설정 정보가 정상적으로 동기화되었습니다!');
      renderQuotesEditor();
    }
  });

  // 백업 내보내기/가져오기 연동
  document.getElementById('export-btn').addEventListener('click', exportDatabase);
  
  const importFile = document.getElementById('import-file');
  const importFilename = document.getElementById('import-filename');
  
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importFilename.innerText = file.name;
      importDatabase(file);
    }
  });
}

// 자녀 목록 렌더링 함수
function renderChildrenProfilesList() {
  const container = document.getElementById('children-profiles-list');
  container.innerHTML = '';
  
  const childrenNames = Object.keys(appData.children || {});
  
  childrenNames.forEach(name => {
    const child = appData.children[name];
    
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justify = 'space-between';
    div.style.alignItems = 'center';
    div.style.padding = '8px 12px';
    div.style.background = 'var(--card-bg)';
    div.style.border = '1px solid var(--card-border)';
    div.style.borderRadius = '6px';
    
    div.innerHTML = `
      <div style="font-weight: 700; display:flex; align-items:center; gap:8px;">
        <span style="font-size:20px;">${child.avatar || '🧸'}</span>
        <span>${name}</span>
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-secondary edit-child-profile-trigger" data-name="${name}" style="padding: 6px 12px; font-size: 12px;">
          <i class="fa-solid fa-user-pen"></i> 수정
        </button>
        <button class="btn btn-danger delete-child-profile-trigger" data-name="${name}" style="padding: 6px 12px; font-size: 12px;">
          <i class="fa-solid fa-trash-can"></i> 삭제
        </button>
      </div>
    `;
    
    // 수정 핸들러 설정
    div.querySelector('.edit-child-profile-trigger').onclick = () => {
      editingChildName = name;
      document.getElementById('new-child-name').value = name;
      document.getElementById('new-child-avatar').value = child.avatar || '🧸';
      
      const addProfileBtn = document.getElementById('add-child-profile-btn');
      addProfileBtn.innerHTML = '<i class="fa-solid fa-user-pen"></i> 수정 완료';
      
      // 취소 버튼 동적 생성
      let cancelBtn = document.getElementById('cancel-edit-child-btn');
      if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cancel-edit-child-btn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.padding = '11px 18px';
        cancelBtn.innerText = '취소';
        cancelBtn.onclick = () => {
          resetChildEditState();
        };
        addProfileBtn.parentNode.appendChild(cancelBtn);
      }
      
      document.getElementById('new-child-name').focus();
    };
    
    // 삭제 핸들러 설정
    div.querySelector('.delete-child-profile-trigger').onclick = async () => {
      if (childrenNames.length <= 1) {
        alert('최소 1명의 자녀 프로필은 지우지 않고 보관해야 합니다.');
        return;
      }
      
      if (confirm(`'${name}'의 프로필과 모든 주간 스케줄, 학습 완료 기록이 영구히 삭제됩니다. 정말 삭제하시겠습니까?`)) {
        if (editingChildName === name) {
          resetChildEditState();
        }
        
        delete appData.children[name];
        
        if (currentSelectedChildPlanner === name) {
          const remainNames = Object.keys(appData.children);
          currentSelectedChildPlanner = remainNames[0];
        }
        if (currentSelectedChildHistory === name) {
          const remainNames = Object.keys(appData.children);
          currentSelectedChildHistory = remainNames[0];
        }
        if (appData.activeChild === name) {
          const remainNames = Object.keys(appData.children);
          appData.activeChild = remainNames[0];
        }
        
        if (localStorage.getItem('family_active_child') === name) {
          localStorage.removeItem('family_active_child');
        }
        
        alert(`'${name}'의 정보가 삭제되었습니다. 설정을 최종 적용하려면 '전체 설정 변경 사항 저장' 버튼을 꼭 클릭해주세요.`);
        
        renderChildrenProfilesList();
        updateChildSelectDropdowns();
      }
    };
    
    container.appendChild(div);
  });
}

// 자녀 수정 모드 리셋 취소 함수
function resetChildEditState() {
  editingChildName = '';
  document.getElementById('new-child-name').value = '';
  document.getElementById('new-child-avatar').value = '🧸';
  
  const addProfileBtn = document.getElementById('add-child-profile-btn');
  addProfileBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> 등록';
  
  const cancelBtn = document.getElementById('cancel-edit-child-btn');
  if (cancelBtn) {
    cancelBtn.remove();
  }
}

function renderQuotesEditor() {
  const quotesEditor = document.getElementById('quotes-list-editor');
  quotesEditor.innerHTML = '';
  const quotes = appData.settings.motivationalQuotes || [];
  quotes.forEach(quote => {
    const wrapper = createQuoteInputRow(quote);
    quotesEditor.appendChild(wrapper);
  });
}

function createQuoteInputRow(value) {
  const div = document.createElement('div');
  div.className = 'quote-item-editor';
  
  div.innerHTML = `
    <input type="text" class="form-control quote-editor-input" style="flex: 1;" placeholder="예: 오늘도 한 걸음 성장했단다! 😊" value="${value}">
    <button class="btn btn-danger delete-quote-btn" style="padding: 10px 14px;" title="문구 삭제">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  
  div.querySelector('.delete-quote-btn').addEventListener('click', () => {
    div.remove();
  });
  
  return div;
}

/**
 * 11. 백업 데이터 처리 (JSON)
 */
function exportDatabase() {
  if (!appData) return;
  const jsonStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const yyyymmdd = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `공부스케줄러_통합백업_${yyyymmdd}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importDatabase(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedJson = JSON.parse(e.target.result);
      
      if (!importedJson.settings || (!importedJson.weeklySchedule && !importedJson.children)) {
        alert('올바른 스케줄러 백업 파일이 아닙니다.');
        return;
      }
      
      if (confirm('가져오기를 계속하시면 현재 보관된 모든 스케줄과 아이들의 통계 히스토리가 덮어씌워집니다. 진행하시겠습니까?')) {
        appData = importedJson;
        migrateDataSchema();
        
        const isSaved = await saveData();
        if (isSaved) {
          alert('가져오기가 완료되었습니다!');
          window.location.reload();
        }
      }
    } catch (err) {
      alert('JSON 해석에 실패했습니다.');
    }
  };
  reader.readAsText(file);
}

/**
 * 12. 공용 기능 리스너 셋업
 */
function setupAnytimeCheckbox() {
  const anytimeCheckbox = document.getElementById('form-anytime');
  const timeInput = document.getElementById('form-time');
  
  anytimeCheckbox.addEventListener('change', () => {
    if (anytimeCheckbox.checked) {
      timeInput.disabled = true;
      timeInput.required = false;
      timeInput.style.opacity = '0.5';
    } else {
      timeInput.disabled = false;
      timeInput.required = true;
      timeInput.style.opacity = '1';
    }
  });
}

function setupCopyModal() {
  const copyModal = document.getElementById('copy-modal');
  const copyForm = document.getElementById('copy-form');
  const cancelBtn = document.getElementById('copy-modal-cancel');
  
  cancelBtn.addEventListener('click', () => {
    copyModal.classList.remove('active');
    copyForm.reset();
  });
  
  copyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const sourceDay = document.getElementById('copy-source-day').value;
    const targetCheckboxes = document.querySelectorAll('input[name="copy-target"]:checked');
    const targetDays = Array.from(targetCheckboxes).map(cb => cb.value);
    
    if (targetDays.length === 0) {
      alert('복사 대상 요일을 최소 1개 이상 골라주세요.');
      return;
    }
    
    const sourceDayKor = DAY_MAP_KOR[DAY_MAP_ENG.indexOf(sourceDay)];
    const targetDaysKor = targetDays.map(d => DAY_MAP_KOR[DAY_MAP_ENG.indexOf(d)]).join(', ');
    
    if (confirm(`정말로 '${sourceDayKor}'의 모든 일정을 [${targetDaysKor}]에 덮어씌우시겠습니까?`)) {
      const childData = appData.children[currentSelectedChildPlanner];
      const sourceTasks = childData.weeklySchedule[sourceDay] || [];
      
      targetDays.forEach(targetDay => {
        childData.weeklySchedule[targetDay] = sourceTasks.map(t => ({
          id: `${targetDay}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          subject: t.subject,
          target: t.target,
          time: t.time
        }));
      });
      
      const isSaved = await saveData();
      if (isSaved) {
        alert('일정이 정상적으로 복사/대체 되었습니다.');
        copyModal.classList.remove('active');
        copyForm.reset();
        renderWeeklyPlanner();
      }
    }
  });
}

function openCopyModal(sourceDay) {
  const copyModal = document.getElementById('copy-modal');
  const sourceDayInput = document.getElementById('copy-source-day');
  const sourceDayLabel = document.getElementById('copy-source-day-name');
  const targetsGrid = document.getElementById('copy-target-days-grid');
  
  sourceDayInput.value = sourceDay;
  const sourceDayKor = DAY_MAP_KOR[DAY_MAP_ENG.indexOf(sourceDay)];
  sourceDayLabel.innerText = sourceDayKor;
  
  targetsGrid.innerHTML = '';
  DAY_MAP_ENG.forEach((dayEng, idx) => {
    if (dayEng === sourceDay) return;
    const dayKor = DAY_MAP_KOR[idx];
    targetsGrid.innerHTML += `
      <label style="font-size: 13px; cursor:pointer; display: flex; align-items: center; gap: 4px;">
        <input type="checkbox" name="copy-target" value="${dayEng}"> ${dayKor}
      </label>
    `;
  });
  
  copyModal.classList.add('active');
}

function initTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
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
            { "id": "friday_1781143373960_981", "subject": "수학", "target": "연산(대수)", "time": "" },
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
