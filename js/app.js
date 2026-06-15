// Child Study Scheduler - Core App Controller

let data = {};
let activeChild = "";
let apiEndpoint = "/api/data";
let roomPinInput = "";
let adminPinInput = "";

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
  await detectBackend();
  await loadData();
  initTheme();
  
  // Live clock updating
  updateLiveClock();
  setInterval(updateLiveClock, 30000);
  
  // Start check for lock or profiles
  checkRoomLock();
});

// Live Clock matching exactly: 2026년 6월 15일 (월요일) 오후 05:08
function updateLiveClock() {
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const now = new Date();
  
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayName = days[now.getDay()];
  
  let hours = now.getHours();
  const ampm = hours >= 12 ? "오후" : "오전";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const timeString = `${year}년 ${month}월 ${date}일 (${dayName}) ${ampm} ${String(hours).padStart(2, '0')}:${minutes}`;
  const clockEl = document.getElementById("current-date-string");
  if (clockEl) {
    clockEl.innerText = timeString;
  }
}

// 1. Environment and Data Persistence
async function detectBackend() {
  if (window.location.protocol === 'file:') {
    apiEndpoint = 'local';
    console.log("Environment: Offline Local Storage Mode");
  } else {
    apiEndpoint = '/api/data';
    console.log("Environment: Serverless API Mode");
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
        throw new Error("Failed to load backend database");
      }
    }
  } catch (err) {
    console.error("Data load error, loading fallback empty data:", err);
    showToast("데이터를 불러오는 데 실패하여 로컬 백업을 사용합니다.", "error");
    const localFallback = localStorage.getItem("study_scheduler_data");
    if (localFallback) {
      data = JSON.parse(localFallback);
    }
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
      if (!response.ok) {
        throw new Error("Failed to sync data to server");
      }
    }
  } catch (err) {
    console.error("Data save error:", err);
    showToast("서버와 동기화하지 못했습니다. 로컬 저장소에 보관합니다.", "warning");
    localStorage.setItem("study_scheduler_data", JSON.stringify(data));
  }
}

// 2. Authentication Logic (Room Lock & Admin Access)
function checkRoomLock() {
  const roomLockPin = data.settings?.roomLockPin;
  if (roomLockPin && roomLockPin !== "0000") {
    document.getElementById("room-lock-screen").classList.add("active");
    document.getElementById("profiles-screen").style.display = "none";
    document.getElementById("dashboard-screen").style.display = "none";
    roomPinInput = "";
    updatePinDots("room");
  } else {
    document.getElementById("room-lock-screen").classList.remove("active");
    showProfilesScreen();
  }
}

function enterRoomPin(num) {
  if (roomPinInput.length < 4) {
    roomPinInput += num;
    updatePinDots("room");
  }
  
  if (roomPinInput.length === 4) {
    setTimeout(() => {
      if (roomPinInput === data.settings.roomLockPin) {
        showToast("인증되었습니다!", "success");
        document.getElementById("room-lock-screen").classList.remove("active");
        showProfilesScreen();
      } else {
        showToast("비밀번호가 맞지 않아요. 다시 시도해보세요.", "error");
        roomPinInput = "";
        updatePinDots("room");
      }
    }, 200);
  }
}

function clearRoomPin() {
  roomPinInput = "";
  updatePinDots("room");
}

function deleteRoomPin() {
  if (roomPinInput.length > 0) {
    roomPinInput = roomPinInput.slice(0, -1);
    updatePinDots("room");
  }
}

// Admin PIN handling
function openAdminAuthModal() {
  adminPinInput = "";
  updatePinDots("admin");
  document.getElementById("admin-auth-modal").classList.add("active");
}

function closeAdminAuthModal() {
  document.getElementById("admin-auth-modal").classList.remove("active");
}

function enterAdminPin(num) {
  if (adminPinInput.length < 4) {
    adminPinInput += num;
    updatePinDots("admin");
  }
  
  if (adminPinInput.length === 4) {
    setTimeout(() => {
      if (adminPinInput === data.settings.parentPin) {
        showToast("부모님 확인 완료!", "success");
        closeAdminAuthModal();
        window.location.href = "/admin.html";
      } else {
        showToast("비밀번호가 올바르지 않습니다.", "error");
        adminPinInput = "";
        updatePinDots("admin");
      }
    }, 200);
  }
}

function clearAdminPin() {
  adminPinInput = "";
  updatePinDots("admin");
}

function deleteAdminPin() {
  if (adminPinInput.length > 0) {
    adminPinInput = adminPinInput.slice(0, -1);
    updatePinDots("admin");
  }
}

function updatePinDots(type) {
  const length = type === "room" ? roomPinInput.length : adminPinInput.length;
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`${type}-pin-dot-${i}`);
    if (dot) {
      if (i <= length) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    }
  }
}

// 3. Profiles Screen Management
function showProfilesScreen() {
  document.getElementById("profiles-screen").style.display = "block";
  document.getElementById("dashboard-screen").style.display = "none";
  
  const listEl = document.getElementById("profiles-list");
  listEl.innerHTML = "";
  
  const childrenKeys = Object.keys(data.children || {});
  if (childrenKeys.length === 0) {
    listEl.innerHTML = `<p style="color: var(--text-secondary);">등록된 자녀 프로필이 없습니다. 부모 관리 모드에서 추가해주세요.</p>`;
    return;
  }
  
  childrenKeys.forEach(name => {
    const child = data.children[name];
    const profileCard = document.createElement("div");
    profileCard.className = "profile-card";
    profileCard.onclick = () => selectProfile(name);
    
    let avatarHtml = `<span style="font-size: 3rem; display: flex; align-items: center; justify-content: center; height: 100%;">${child.avatar || '🧸'}</span>`;
    if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
      avatarHtml = `<img src="${child.avatar}" alt="${name}">`;
    }
    
    profileCard.innerHTML = `
      <div class="profile-avatar-wrapper">
        ${avatarHtml}
      </div>
      <div class="profile-name">${name}</div>
    `;
    
    listEl.appendChild(profileCard);
  });
}

function selectProfile(name) {
  activeChild = name;
  data.activeChild = name;
  saveData();
  
  document.getElementById("profiles-screen").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "block";
  
  initDashboard();
}

function goToProfileSelection() {
  activeChild = "";
  checkRoomLock();
}

// 4. Dashboard Implementation
function initDashboard() {
  const child = data.children[activeChild];
  if (!child) return;
  
  const avatarEl = document.getElementById("current-child-avatar");
  if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
    avatarEl.outerHTML = `<img id="current-child-avatar" class="profile-avatar" style="width: 100%; height: 100%; object-fit: cover;" src="${child.avatar}">`;
  } else {
    if (avatarEl.tagName === "IMG") {
      const span = document.createElement("span");
      span.id = "current-child-avatar";
      span.innerText = child.avatar || "🧸";
      avatarEl.replaceWith(span);
    } else {
      avatarEl.innerText = child.avatar || "🧸";
    }
  }
  
  document.getElementById("welcome-message").innerText = `안녕, ${activeChild}! 👋`;
  if (data.settings.motivationalQuotes && data.settings.motivationalQuotes.length > 0) {
    const quotes = data.settings.motivationalQuotes;
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    document.getElementById("motivational-quote").innerText = randomQuote;
  }
  
  updateLiveClock();
  
  if (!child.history) {
    child.history = {};
  }
  
  const todayKey = getLocalDateString(new Date());
  if (!child.history[todayKey]) {
    child.history[todayKey] = {
      completed: [],
      completedTimes: {},
      todos: []
    };
  }
  
  renderTodoList();
  updateStreakCount();
  renderWeeklyCalendar();
}

function getLocalDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDayOfWeekKey(date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[date.getDay()];
}

function renderTodoList() {
  const child = data.children[activeChild];
  const todayKey = getLocalDateString(new Date());
  const dayKey = getDayOfWeekKey(new Date());
  const dailyHistory = child.history[todayKey];
  
  const scheduledTasks = child.weeklySchedule?.[dayKey] || [];
  const generalTodos = dailyHistory.todos || [];
  
  const listEl = document.getElementById("todo-list");
  listEl.innerHTML = "";
  
  if (scheduledTasks.length === 0 && generalTodos.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 3rem 0;">
      <i class="fa-solid fa-mug-hot" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
      <p>오늘 계획된 공부나 해야 할 일이 없습니다.</p>
    </div>`;
    updateProgress(0, 0);
    return;
  }
  
  let totalTasks = scheduledTasks.length + generalTodos.length;
  let completedCount = 0;
  
  // Render weekly schedule tasks
  scheduledTasks.forEach(task => {
    const isCompleted = dailyHistory.completed.includes(task.id);
    if (isCompleted) completedCount++;
    
    const completedTime = dailyHistory.completedTimes?.[task.id] || "";
    
    const itemEl = document.createElement("div");
    itemEl.className = `task-item-card ${isCompleted ? 'completed' : ''}`;
    itemEl.onclick = () => toggleTask(task.id, false);
    
    // Tag on right: Show task time or "오늘 중"
    const rightBadge = task.time 
      ? `<div class="task-badge-today"><i class="fa-regular fa-clock"></i> ${task.time}</div>`
      : `<div class="task-badge-today"><i class="fa-solid fa-calendar-day"></i> 오늘 중</div>`;
    
    itemEl.innerHTML = `
      <div class="task-card-left">
        <div class="task-checkbox-circle">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="task-card-info">
          <span class="subject-badge">${task.subject}</span>
          <span class="task-name">
            ${task.target || ''}
            ${isCompleted && completedTime ? `<span class="task-completed-time">${completedTime} 완료</span>` : ''}
          </span>
        </div>
      </div>
      ${rightBadge}
    `;
    listEl.appendChild(itemEl);
  });
  
  // Render general todos for today
  generalTodos.forEach(todo => {
    const isCompleted = todo.completed;
    if (isCompleted) completedCount++;
    
    const itemEl = document.createElement("div");
    itemEl.className = `task-item-card ${isCompleted ? 'completed' : ''}`;
    itemEl.onclick = () => toggleTask(todo.id, true);
    
    const rightBadge = todo.time 
      ? `<div class="task-badge-today"><i class="fa-regular fa-clock"></i> ${todo.time}</div>`
      : `<div class="task-badge-today"><i class="fa-solid fa-calendar-day"></i> 오늘 중</div>`;
    
    itemEl.innerHTML = `
      <div class="task-card-left">
        <div class="task-checkbox-circle">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="task-card-info">
          <span class="subject-badge general">오늘 To-Do</span>
          <span class="task-name">
            ${todo.target}
            ${isCompleted && todo.completedTime ? `<span class="task-completed-time">${todo.completedTime} 완료</span>` : ''}
          </span>
        </div>
      </div>
      ${rightBadge}
    `;
    listEl.appendChild(itemEl);
  });
  
  updateProgress(completedCount, totalTasks);
}

async function toggleTask(id, isGeneralTodo) {
  const child = data.children[activeChild];
  const todayKey = getLocalDateString(new Date());
  const dailyHistory = child.history[todayKey];
  
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let newlyCompleted = false;
  
  if (isGeneralTodo) {
    const todo = dailyHistory.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      todo.completedTime = todo.completed ? timeStr : null;
      newlyCompleted = todo.completed;
    }
  } else {
    const index = dailyHistory.completed.indexOf(id);
    if (index > -1) {
      dailyHistory.completed.splice(index, 1);
      if (dailyHistory.completedTimes) {
        delete dailyHistory.completedTimes[id];
      }
    } else {
      dailyHistory.completed.push(id);
      if (!dailyHistory.completedTimes) {
        dailyHistory.completedTimes = {};
      }
      dailyHistory.completedTimes[id] = timeStr;
      newlyCompleted = true;
    }
  }
  
  if (newlyCompleted) {
    triggerConfetti(false);
  }
  
  renderTodoList();
  await saveData();
  renderWeeklyCalendar();
  updateStreakCount();
}

function updateProgress(completed, total) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  const fillEl = document.getElementById("progress-bar-fill");
  const percentEl = document.getElementById("progress-percentage");
  
  fillEl.style.width = `${percentage}%`;
  percentEl.innerText = `${percentage}%`;
  
  if (total > 0 && completed === total) {
    const todayKey = getLocalDateString(new Date());
    const child = data.children[activeChild];
    if (!child.history[todayKey].celebrated) {
      child.history[todayKey].celebrated = true;
      triggerConfetti(true); // Big explosion!
      saveData();
    }
  }
}

// Confetti Pop
function triggerConfetti(isGiant) {
  if (isGiant) {
    const duration = 2 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#6366f1', '#06b6d4', '#ec4899', '#10b981']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#6366f1', '#06b6d4', '#ec4899', '#10b981']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  } else {
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#06b6d4', '#ec4899', '#10b981']
    });
  }
}

// Streak Tracker
function updateStreakCount() {
  const child = data.children[activeChild];
  if (!child || !child.history) return;
  
  let streak = 0;
  let checkDate = new Date();
  
  const todayKey = getLocalDateString(checkDate);
  const todayComplete = isDayFullyCompleted(child, todayKey, checkDate);
  
  if (!todayComplete) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  while (true) {
    const checkKey = getLocalDateString(checkDate);
    const hasTasks = getDayTasksCount(child, checkKey, checkDate);
    
    if (hasTasks === 0) {
      checkDate.setDate(checkDate.getDate() - 1);
      if (streak === 0 && checkDate < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
        break;
      }
      continue;
    }
    
    if (isDayFullyCompleted(child, checkKey, checkDate)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  document.getElementById("streak-days").innerText = streak;
}

function getDayTasksCount(child, dateKey, dateObj) {
  const dayOfWeek = getDayOfWeekKey(dateObj);
  const scheduled = child.weeklySchedule?.[dayOfWeek]?.length || 0;
  const general = child.history?.[dateKey]?.todos?.length || 0;
  return scheduled + general;
}

function isDayFullyCompleted(child, dateKey, dateObj) {
  const dayOfWeek = getDayOfWeekKey(dateObj);
  const scheduled = child.weeklySchedule?.[dayOfWeek] || [];
  const historyEntry = child.history?.[dateKey];
  
  if (!historyEntry) return false;
  
  const completedSched = historyEntry.completed || [];
  const generalTodos = historyEntry.todos || [];
  
  const scheduledDone = scheduled.every(task => completedSched.includes(task.id));
  const generalDone = generalTodos.every(todo => todo.completed);
  
  const totalCount = scheduled.length + generalTodos.length;
  if (totalCount === 0) return false;
  
  return scheduledDone && generalDone;
}

// Weekly Stamp Board matching vertical capsules layout
function renderWeeklyCalendar() {
  const child = data.children[activeChild];
  const calendarEl = document.getElementById("weekly-calendar");
  calendarEl.innerHTML = "";
  
  const today = new Date();
  const currentDay = today.getDay();
  const distanceToMon = currentDay === 0 ? -6 : 1 - currentDay;
  
  const daysKorean = ["월", "화", "수", "목", "금", "토", "일"];
  const daysEng = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  
  for (let i = 0; i < 7; i++) {
    const loopDate = new Date(today);
    loopDate.setDate(today.getDate() + distanceToMon + i);
    
    const loopKey = getLocalDateString(loopDate);
    const dayNameEng = daysEng[i];
    
    const isToday = loopKey === getLocalDateString(today);
    
    const scheduled = child.weeklySchedule?.[dayNameEng] || [];
    const historyEntry = child.history?.[loopKey];
    
    const completedSched = historyEntry?.completed || [];
    const generalTodos = historyEntry?.todos || [];
    
    const totalCount = scheduled.length + generalTodos.length;
    
    let stampClass = "";
    let stampIcon = `<i class="fa-solid fa-circle" style="opacity: 0.1; font-size: 0.4rem;"></i>`;
    
    if (totalCount > 0 && historyEntry) {
      const completedSchedCount = scheduled.filter(task => completedSched.includes(task.id)).length;
      const completedGeneralCount = generalTodos.filter(todo => todo.completed).length;
      const totalCompleted = completedSchedCount + completedGeneralCount;
      
      if (totalCompleted === totalCount) {
        stampClass = "success";
        stampIcon = `<i class="fa-solid fa-check"></i>`;
      } else if (totalCompleted > 0) {
        stampClass = "partial";
        stampIcon = `<i class="fa-solid fa-circle-notch"></i>`;
      }
    }
    
    const capsule = document.createElement("div");
    capsule.className = `weekly-stamp-capsule ${isToday ? 'active-today' : ''} ${stampClass}`;
    
    capsule.innerHTML = `
      <span class="weekly-stamp-day">${daysKorean[i]}</span>
      <div class="weekly-stamp-circle">
        ${stampIcon}
      </div>
    `;
    calendarEl.appendChild(capsule);
  }
}

// 8. Theme Switcher
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeToggleIcons(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeToggleIcons(newTheme);
}

function updateThemeToggleIcons(theme) {
  const isDark = theme === "dark";
  const btnProfiles = document.getElementById("theme-toggle-profiles");
  const btnDashboard = document.getElementById("theme-toggle-dashboard");
  
  const iconHtml = isDark ? `<i class="fa-solid fa-sun"></i>` : `<i class="fa-solid fa-moon"></i>`;
  
  if (btnProfiles) btnProfiles.innerHTML = iconHtml;
  if (btnDashboard) btnDashboard.innerHTML = iconHtml;
}

// 9. Toast Alerts helper
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
