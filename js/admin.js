// Child Study Scheduler - Admin Panel Controller

let data = {};
let activeChild = "";
let apiEndpoint = "/api/data";
let adminPinInput = "";
let selectedSrcDayForCopy = "";

// Initialize Admin Panel
document.addEventListener("DOMContentLoaded", async () => {
  await detectBackend();
  await loadData();
  initTheme();
  
  // Start in Lock mode, prompting for admin PIN
  resetAdminPin();
});

// Environment & Syncing
async function detectBackend() {
  if (window.location.protocol === 'file:') {
    apiEndpoint = 'local';
  } else {
    apiEndpoint = '/api/data';
  }
}

async function loadData() {
  try {
    if (apiEndpoint === 'local') {
      const localData = localStorage.getItem("study_scheduler_data");
      if (localData) {
        data = JSON.parse(localData);
      } else {
        const response = await fetch("/data.json");
        data = await response.json();
        localStorage.setItem("study_scheduler_data", JSON.stringify(data));
      }
    } else {
      const response = await fetch(apiEndpoint);
      if (response.ok) {
        data = await response.json();
      } else {
        throw new Error("Failed to load server data");
      }
    }
  } catch (err) {
    console.error("Load error in admin:", err);
    showToast("데이터를 읽지 못했습니다. 로컬 백업을 사용합니다.", "error");
    const localFallback = localStorage.getItem("study_scheduler_data");
    if (localFallback) data = JSON.parse(localFallback);
  }
}

async function saveData() {
  try {
    if (apiEndpoint === 'local') {
      localStorage.setItem("study_scheduler_data", JSON.stringify(data));
    } else {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Sync failed");
    }
  } catch (err) {
    console.error("Save error in admin:", err);
    showToast("서버 저장 실패. 로컬에 백업합니다.", "warning");
    localStorage.setItem("study_scheduler_data", JSON.stringify(data));
  }
}

// 1. PIN Lock Screen
function resetAdminPin() {
  adminPinInput = "";
  updatePinDots();
  document.getElementById("admin-lock-screen").style.display = "flex";
  document.getElementById("admin-dashboard").style.display = "none";
}

function enterAdminPin(num) {
  if (adminPinInput.length < 4) {
    adminPinInput += num;
    updatePinDots();
  }
  
  if (adminPinInput.length === 4) {
    setTimeout(() => {
      if (adminPinInput === data.settings.parentPin) {
        showToast("관리자 인증 성공!", "success");
        unlockAdminDashboard();
      } else {
        showToast("비밀번호가 올바르지 않습니다.", "error");
        adminPinInput = "";
        updatePinDots();
      }
    }, 200);
  }
}

function clearAdminPin() {
  adminPinInput = "";
  updatePinDots();
}

function deleteAdminPin() {
  if (adminPinInput.length > 0) {
    adminPinInput = adminPinInput.slice(0, -1);
    updatePinDots();
  }
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`admin-pin-dot-${i}`);
    if (dot) {
      if (i <= adminPinInput.length) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    }
  }
}

function unlockAdminDashboard() {
  document.getElementById("admin-lock-screen").style.display = "none";
  document.getElementById("admin-dashboard").style.display = "grid";
  
  // Populate UI
  populateChildSelector();
  loadSettingsTab();
}

// 2. Child Selector & Tab switching
function populateChildSelector() {
  const selectEl = document.getElementById("admin-child-select");
  selectEl.innerHTML = "";
  
  const childrenKeys = Object.keys(data.children || {});
  childrenKeys.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.innerText = name;
    if (name === data.activeChild) {
      option.selected = true;
      activeChild = name;
    }
    selectEl.appendChild(option);
  });
  
  if (!activeChild && childrenKeys.length > 0) {
    activeChild = childrenKeys[0];
  }
  
  updateChildPreview();
  renderWeeklyPlanner();
  renderHistoryTimeline();
}

function onChildChange() {
  const selectEl = document.getElementById("admin-child-select");
  activeChild = selectEl.value;
  data.activeChild = activeChild;
  saveData();
  
  updateChildPreview();
  renderWeeklyPlanner();
  renderHistoryTimeline();
}

function updateChildPreview() {
  const child = data.children[activeChild];
  const previewEl = document.getElementById("admin-child-preview");
  if (!child) {
    previewEl.innerHTML = "";
    return;
  }
  
  let avatarHtml = `<span style="font-size: 1.5rem;">${child.avatar || '🧸'}</span>`;
  if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
    avatarHtml = `<img src="${child.avatar}" style="width: 28px; height: 28px; border-radius: 4px; object-fit: cover;">`;
  }
  
  previewEl.innerHTML = `${avatarHtml} <span>${activeChild} 스케줄 수정 중</span>`;
}

function switchTab(tabId, navEl) {
  // Toggle Nav active state
  document.querySelectorAll(".admin-nav .nav-item").forEach(item => {
    item.classList.remove("active");
  });
  navEl.classList.add("active");
  
  // Toggle Tab content
  document.querySelectorAll(".tab-content").forEach(tab => {
    tab.classList.remove("active");
  });
  document.getElementById(tabId).classList.add("active");
  
  // Refresh data on select tabs
  if (tabId === 'planner-tab') {
    renderWeeklyPlanner();
  } else if (tabId === 'history-tab') {
    renderHistoryTimeline();
  } else if (tabId === 'settings-tab') {
    loadSettingsTab();
  }
}

// 3. Tab 1: Weekly Planner Grid
const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const dayLabels = {
  monday: "월요일", tuesday: "화요일", wednesday: "수요일",
  thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일"
};

function renderWeeklyPlanner() {
  const child = data.children[activeChild];
  const gridEl = document.getElementById("planner-grid");
  gridEl.innerHTML = "";
  
  if (!child) return;
  
  dayKeys.forEach(day => {
    const card = document.createElement("div");
    card.className = "planner-day-card glass-panel";
    
    const subjects = child.weeklySchedule?.[day] || [];
    let subjectsHtml = "";
    
    if (subjects.length === 0) {
      subjectsHtml = `<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; margin-top: 2rem;">계획된 일정이 없습니다.</div>`;
    } else {
      subjects.forEach((subj, idx) => {
        subjectsHtml += `
          <div class="planner-subject-item">
            <div class="planner-subject-info">
              <span class="planner-subject-name">${subj.subject}</span>
              <span class="planner-subject-time">
                ${subj.target}
                ${subj.time ? `<i class="fa-regular fa-clock" style="margin-left: 0.25rem;"></i> ${subj.time}` : ''}
              </span>
            </div>
            <div style="display: flex; gap: 2px;">
              <button class="planner-subject-delete" onclick="openEditTaskModal('${day}', '${subj.id}')" title="수정"><i class="fa-solid fa-edit"></i></button>
              <button class="planner-subject-delete" onclick="deleteWeeklyTask('${day}', '${subj.id}')" title="삭제"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </div>
        `;
      });
    }
    
    card.innerHTML = `
      <div class="planner-day-header ${day}">
        <span class="day-name">${dayLabels[day]}</span>
        <div class="planner-day-actions">
          <button onclick="openAddTaskModal('${day}')" title="일정 추가"><i class="fa-solid fa-plus"></i></button>
          <button onclick="openCopyModal('${day}')" title="일정 복사"><i class="fa-solid fa-copy"></i></button>
        </div>
      </div>
      <div class="planner-subject-list">
        ${subjectsHtml}
      </div>
    `;
    gridEl.appendChild(card);
  });
}

// Add/Edit Task Modals
function openAddTaskModal(day) {
  document.getElementById("task-modal-title").innerText = `${dayLabels[day]} 일정 추가`;
  document.getElementById("task-edit-id").value = "";
  document.getElementById("task-edit-day").value = day;
  document.getElementById("task-form").reset();
  
  // Show multi-day check options for adding
  document.getElementById("multi-day-selection-group").style.display = "block";
  
  // Pre-check the current day checkbox
  document.querySelectorAll('input[name="multi-day"]').forEach(cb => {
    cb.checked = cb.value === day;
  });
  
  document.getElementById("task-modal").classList.add("active");
}

function openEditTaskModal(day, id) {
  const child = data.children[activeChild];
  const task = child.weeklySchedule[day].find(t => t.id === id);
  if (!task) return;
  
  document.getElementById("task-modal-title").innerText = `${dayLabels[day]} 일정 수정`;
  document.getElementById("task-edit-id").value = id;
  document.getElementById("task-edit-day").value = day;
  
  document.getElementById("task-subject").value = task.subject;
  document.getElementById("task-target").value = task.target;
  document.getElementById("task-time").value = task.time || "";
  
  // Hide multi-day options for editing single task
  document.getElementById("multi-day-selection-group").style.display = "none";
  
  document.getElementById("task-modal").classList.add("active");
}

function closeTaskModal() {
  document.getElementById("task-modal").classList.remove("active");
}

async function saveWeeklyTask(e) {
  e.preventDefault();
  
  const child = data.children[activeChild];
  const editId = document.getElementById("task-edit-id").value;
  const currentDay = document.getElementById("task-edit-day").value;
  
  const subject = document.getElementById("task-subject").value.trim();
  const target = document.getElementById("task-target").value.trim();
  const time = document.getElementById("task-time").value;
  
  if (editId) {
    // Edit existing task
    const taskList = child.weeklySchedule[currentDay] || [];
    const taskIdx = taskList.findIndex(t => t.id === editId);
    if (taskIdx > -1) {
      taskList[taskIdx].subject = subject;
      taskList[taskIdx].target = target;
      taskList[taskIdx].time = time;
    }
    showToast("일정이 수정되었습니다.", "success");
  } else {
    // Add new task(s)
    const selectedDays = [];
    document.querySelectorAll('input[name="multi-day"]:checked').forEach(cb => {
      selectedDays.push(cb.value);
    });
    
    if (selectedDays.length === 0) {
      selectedDays.push(currentDay);
    }
    
    selectedDays.forEach(day => {
      if (!child.weeklySchedule) child.weeklySchedule = {};
      if (!child.weeklySchedule[day]) child.weeklySchedule[day] = [];
      
      const newId = `${day.slice(0, 3)}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      child.weeklySchedule[day].push({
        id: newId,
        subject,
        target,
        time: time || ""
      });
    });
    showToast("일정이 추가되었습니다.", "success");
  }
  
  closeTaskModal();
  renderWeeklyPlanner();
  await saveData();
}

async function deleteWeeklyTask(day, id) {
  if (!confirm("이 일정을 스케줄표에서 삭제하시겠습니까?")) return;
  
  const child = data.children[activeChild];
  const tasks = child.weeklySchedule[day] || [];
  const idx = tasks.findIndex(t => t.id === id);
  
  if (idx > -1) {
    tasks.splice(idx, 1);
    showToast("일정을 삭제했습니다.", "success");
    renderWeeklyPlanner();
    await saveData();
  }
}

// Copy Schedule Modal
function openCopyModal(day) {
  selectedSrcDayForCopy = day;
  document.getElementById("copy-src-day-label").innerText = dayLabels[day];
  
  // Set default dest selection to another day
  const destSelect = document.getElementById("copy-dest-day");
  const defaultDest = dayKeys.find(d => d !== day);
  destSelect.value = defaultDest;
  
  document.getElementById("copy-modal").classList.add("active");
}

function closeCopyModal() {
  document.getElementById("copy-modal").classList.remove("active");
}

async function executeCopySchedule() {
  const child = data.children[activeChild];
  const destDay = document.getElementById("copy-dest-day").value;
  
  if (destDay === selectedSrcDayForCopy) {
    showToast("같은 요일로는 복사할 수 없습니다.", "error");
    return;
  }
  
  if (!confirm(`${dayLabels[destDay]}의 기존 일정이 모두 지워지고 ${dayLabels[selectedSrcDayForCopy]} 일정으로 덮어써집니다. 진행하시겠습니까?`)) {
    return;
  }
  
  const srcTasks = child.weeklySchedule?.[selectedSrcDayForCopy] || [];
  
  // Deep clone and generate brand new IDs to avoid conflicts
  const clonedTasks = srcTasks.map(t => {
    return {
      id: `${destDay.slice(0, 3)}_${Date.now()}_${Math.floor(Math.random()*10000)}`,
      subject: t.subject,
      target: t.target,
      time: t.time || ""
    };
  });
  
  if (!child.weeklySchedule) child.weeklySchedule = {};
  child.weeklySchedule[destDay] = clonedTasks;
  
  showToast("요일 스케줄 복사 완료!", "success");
  closeCopyModal();
  renderWeeklyPlanner();
  await saveData();
}

// 4. Tab 2: Today General To-Do
async function addGeneralTodo(e) {
  e.preventDefault();
  
  const child = data.children[activeChild];
  if (!child) return;
  
  const target = document.getElementById("todo-target").value.trim();
  const time = document.getElementById("todo-time").value;
  
  const todayKey = getLocalDateString(new Date());
  if (!child.history) child.history = {};
  if (!child.history[todayKey]) {
    child.history[todayKey] = {
      completed: [],
      completedTimes: {},
      todos: []
    };
  }
  
  const newId = `gt_${Date.now()}`;
  child.history[todayKey].todos.push({
    id: newId,
    target,
    time: time || "",
    completed: false,
    completedTime: null
  });
  
  showToast("오늘 To-Do 항목을 추가했습니다. 공부방 화면에 즉시 보입니다.", "success");
  document.getElementById("general-todo-form").reset();
  await saveData();
}

function getLocalDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 5. Tab 3: History Timeline
function renderHistoryTimeline() {
  const child = data.children[activeChild];
  const timelineEl = document.getElementById("history-timeline");
  timelineEl.innerHTML = "";
  
  if (!child || !child.history) {
    timelineEl.innerHTML = `<p style="color: var(--text-secondary);">기록된 학습 내역이 없습니다.</p>`;
    return;
  }
  
  const dates = Object.keys(child.history).sort((a,b) => b.localeCompare(a));
  if (dates.length === 0) {
    timelineEl.innerHTML = `<p style="color: var(--text-secondary);">기록된 학습 내역이 없습니다.</p>`;
    return;
  }
  
  dates.forEach(dateStr => {
    const entry = child.history[dateStr];
    const dateObj = new Date(dateStr);
    const dayNameEng = getDayOfWeekKey(dateObj);
    
    // Scheduled tasks for that day of week
    const scheduled = child.weeklySchedule?.[dayNameEng] || [];
    const completedSched = entry.completed || [];
    
    // General todos for that date
    const generalTodos = entry.todos || [];
    
    const totalCount = scheduled.length + generalTodos.length;
    if (totalCount === 0) return; // Skip empty log entries
    
    let completedCount = 0;
    let itemsListHtml = "";
    
    // Process Weekly Scheduled Tasks
    scheduled.forEach(task => {
      const isDone = completedSched.includes(task.id);
      if (isDone) completedCount++;
      const timeStr = entry.completedTimes?.[task.id] || "";
      
      itemsListHtml += `
        <div class="timeline-task ${isDone ? 'completed' : 'pending'}">
          <div>
            <strong>[반복] ${task.subject}</strong> - ${task.target}
          </div>
          <div style="color: var(--text-secondary); font-size: 0.8rem;">
            ${isDone ? `<span style="color: var(--success);"><i class="fa-solid fa-circle-check"></i> ${timeStr} 완료</span>` : `<span style="color: var(--text-muted);"><i class="fa-regular fa-circle"></i> 미완료</span>`}
          </div>
        </div>
      `;
    });
    
    // Process General To-Dos
    generalTodos.forEach(todo => {
      const isDone = todo.completed;
      if (isDone) completedCount++;
      
      itemsListHtml += `
        <div class="timeline-task ${isDone ? 'completed' : 'pending'}">
          <div>
            <strong>[추가] ${todo.target}</strong>
          </div>
          <div style="color: var(--text-secondary); font-size: 0.8rem;">
            ${isDone ? `<span style="color: var(--success);"><i class="fa-solid fa-circle-check"></i> ${todo.completedTime || '완료'} 완료</span>` : `<span style="color: var(--text-muted);"><i class="fa-regular fa-circle"></i> 미완료</span>`}
          </div>
        </div>
      `;
    });
    
    const allDone = completedCount === totalCount;
    
    const itemEl = document.createElement("div");
    itemEl.className = "timeline-item";
    
    itemEl.innerHTML = `
      <div class="timeline-badge" style="border-color: ${allDone ? 'var(--success)' : 'var(--primary)'}"></div>
      <div class="timeline-header">
        <span class="timeline-date">${dateStr} (${getDayLabelKorean(dayNameEng)})</span>
        <span class="timeline-rate ${allDone ? 'all-complete' : ''}">${completedCount} / ${totalCount} 완료 (${Math.round((completedCount/totalCount)*100)}%)</span>
      </div>
      <div class="timeline-tasks-list">
        ${itemsListHtml}
      </div>
    `;
    
    timelineEl.appendChild(itemEl);
  });
}

function getDayOfWeekKey(date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[date.getDay()];
}

function getDayLabelKorean(key) {
  const mapping = {
    "monday": "월", "tuesday": "화", "wednesday": "수",
    "thursday": "목", "friday": "금", "saturday": "토", "sunday": "일"
  };
  return mapping[key] || "";
}

// 6. Tab 4: Settings & Profiles Management
function loadSettingsTab() {
  // Passwords
  document.getElementById("input-parent-pin").value = data.settings.parentPin || "1234";
  document.getElementById("input-room-pin").value = data.settings.roomLockPin || "0000";
  
  // Render Profiles List
  renderSettingsProfiles();
  
  // Render Quotes List
  renderSettingsQuotes();
}

async function savePins() {
  const parentPin = document.getElementById("input-parent-pin").value.trim();
  const roomPin = document.getElementById("input-room-pin").value.trim();
  
  if (parentPin.length !== 4 || isNaN(parentPin)) {
    showToast("부모 관리 PIN은 4자리 숫자여야 합니다.", "error");
    return;
  }
  if (roomPin.length !== 4 || isNaN(roomPin)) {
    showToast("공부방 PIN은 4자리 숫자여야 합니다.", "error");
    return;
  }
  
  data.settings.parentPin = parentPin;
  data.settings.roomLockPin = roomPin;
  
  showToast("비밀번호 설정이 저장되었습니다.", "success");
  await saveData();
}

function renderSettingsProfiles() {
  const listEl = document.getElementById("profile-settings-list");
  listEl.innerHTML = "";
  
  const childrenKeys = Object.keys(data.children || {});
  childrenKeys.forEach(name => {
    const child = data.children[name];
    const item = document.createElement("div");
    item.className = "profile-settings-item";
    
    let avatarHtml = `<span style="font-size: 1.5rem;">${child.avatar || '🧸'}</span>`;
    if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
      avatarHtml = `<img src="${child.avatar}" class="profile-settings-avatar">`;
    }
    
    item.innerHTML = `
      <div class="profile-settings-info">
        ${avatarHtml}
        <strong>${name}</strong>
      </div>
      <button class="btn btn-danger" onclick="deleteChildProfile('${name}')"><i class="fa-solid fa-trash-can"></i> 삭제</button>
    `;
    
    listEl.appendChild(item);
  });
}

function openAddProfileModal() {
  document.getElementById("profile-form").reset();
  document.getElementById("profile-modal").classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profile-modal").classList.remove("active");
}

function setAvatarInput(emoji) {
  document.getElementById("profile-avatar-input").value = emoji;
}

async function saveProfile(e) {
  e.preventDefault();
  
  const name = document.getElementById("profile-name-input").value.trim();
  const avatar = document.getElementById("profile-avatar-input").value.trim();
  
  if (!name) return;
  
  if (data.children && data.children[name]) {
    showToast("이미 등록된 이름입니다.", "error");
    return;
  }
  
  if (!data.children) data.children = {};
  data.children[name] = {
    avatar: avatar || "🧸",
    weeklySchedule: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    },
    history: {}
  };
  
  if (!data.activeChild) {
    data.activeChild = name;
  }
  
  showToast("자녀 프로필을 생성했습니다.", "success");
  closeProfileModal();
  
  await saveData();
  populateChildSelector();
  loadSettingsTab();
}

async function deleteChildProfile(name) {
  const keys = Object.keys(data.children || {});
  if (keys.length <= 1) {
    showToast("최소 한 개의 자녀 프로필이 필요하여 삭제할 수 없습니다.", "error");
    return;
  }
  
  if (!confirm(`정말로 ${name}의 모든 스케줄과 수행 기록을 지우시겠습니까? 복구할 수 없습니다.`)) return;
  
  delete data.children[name];
  
  if (data.activeChild === name) {
    data.activeChild = Object.keys(data.children)[0];
  }
  
  showToast("프로필이 삭제되었습니다.", "success");
  await saveData();
  populateChildSelector();
  loadSettingsTab();
}

// Quotes manager
function renderSettingsQuotes() {
  const listEl = document.getElementById("quote-manager-list");
  listEl.innerHTML = "";
  
  const quotes = data.settings.motivationalQuotes || [];
  quotes.forEach((quote, idx) => {
    const item = document.createElement("div");
    item.className = "quote-manager-item";
    
    item.innerHTML = `
      <span class="quote-text">${quote}</span>
      <button class="planner-subject-delete" onclick="deleteQuote(${idx})"><i class="fa-solid fa-trash-can"></i></button>
    `;
    listEl.appendChild(item);
  });
}

async function addQuote() {
  const input = document.getElementById("new-quote-input");
  const text = input.value.trim();
  
  if (!text) return;
  
  if (!data.settings.motivationalQuotes) {
    data.settings.motivationalQuotes = [];
  }
  
  data.settings.motivationalQuotes.push(text);
  input.value = "";
  
  showToast("격려 문구가 추가되었습니다.", "success");
  renderSettingsQuotes();
  await saveData();
}

async function deleteQuote(idx) {
  data.settings.motivationalQuotes.splice(idx, 1);
  showToast("문구를 삭제했습니다.", "success");
  renderSettingsQuotes();
  await saveData();
}

// 7. Backup and Restore
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  
  const now = new Date();
  const filename = `study_scheduler_backup_${getLocalDateString(now)}.json`;
  downloadAnchor.setAttribute("download", filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("데이터 파일이 다운로드되었습니다.", "success");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      
      // Simple validation checking for expected schema
      if (!parsed.settings || !parsed.children) {
        throw new Error("올바른 백업 형식이 아닙니다.");
      }
      
      if (confirm("경고: 업로드한 데이터로 현재 모든 데이터가 덮어씌워집니다. 계속하시겠습니까?")) {
        data = parsed;
        if (data.children && Object.keys(data.children).length > 0) {
          if (!data.activeChild || !data.children[data.activeChild]) {
            data.activeChild = Object.keys(data.children)[0];
          }
        }
        
        await saveData();
        showToast("데이터 복원이 완료되었습니다!", "success");
        
        // Reload all layouts
        populateChildSelector();
        loadSettingsTab();
      }
    } catch (err) {
      console.error(err);
      showToast("데이터 파일을 파싱하지 못했습니다. 형식을 확인해주세요.", "error");
    }
  };
  reader.readAsText(file);
}

// Theme logic
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeToggleIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeToggleIcon(newTheme);
}

function updateThemeToggleIcon(theme) {
  const isDark = theme === "dark";
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.innerHTML = isDark ? `<i class="fa-solid fa-sun"></i>` : `<i class="fa-solid fa-moon"></i>`;
  }
}

// Toast alerts helper
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toast-icon");
  const msg = document.getElementById("toast-message");
  
  toast.className = `toast active ${type}`;
  msg.innerText = message;
  
  icon.className = "fa-solid";
  if (type === "success") {
    icon.classList.add("fa-circle-check");
  } else if (type === "error") {
    icon.classList.add("fa-circle-exclamation");
  } else {
    icon.classList.add("fa-triangle-exclamation");
  }
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}
