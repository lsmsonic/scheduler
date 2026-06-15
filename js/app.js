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
  
  // Start check for lock or profiles
  checkRoomLock();
});

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
        // Fetch default configuration from seed file
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
    // Fallback to local storage if API fails
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
    // Always backup locally
    localStorage.setItem("study_scheduler_data", JSON.stringify(data));
  }
}

// 2. Authentication Logic (Room Lock & Admin Access)
function checkRoomLock() {
  const roomLockPin = data.settings?.roomLockPin;
  if (roomLockPin && roomLockPin !== "0000") {
    // Show lock screen
    document.getElementById("room-lock-screen").classList.add("active");
    document.getElementById("profiles-screen").style.display = "none";
    document.getElementById("dashboard-screen").style.display = "none";
    roomPinInput = "";
    updatePinDots("room");
  } else {
    // Skip to profile selection
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
        // Redirect to admin panel
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
    
    // Using clean Emoji avatars or images if URLs
    let avatarHtml = `<span style="font-size: 3.5rem; display: flex; align-items: center; justify-content: center; height: 100%;">${child.avatar || '🧸'}</span>`;
    if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
      avatarHtml = `<img class="profile-avatar" src="${child.avatar}" alt="${name}">`;
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
  
  // Transition to dashboard
  document.getElementById("profiles-screen").style.display = "none";
  document.getElementById("dashboard-screen").style.display = "block";
  
  // Initialize dashboard
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
  
  // Set avatar and name
  const avatarEl = document.getElementById("current-child-avatar");
  if (child.avatar && (child.avatar.startsWith("http") || child.avatar.startsWith("/"))) {
    avatarEl.outerHTML = `<img id="current-child-avatar" class="profile-avatar" style="width: 48px; height: 48px; border-radius: 8px; cursor: pointer;" src="${child.avatar}" onclick="goToProfileSelection()">`;
  } else {
    // Reset to span if it was an image
    if (avatarEl.tagName === "IMG") {
      const span = document.createElement("span");
      span.id = "current-child-avatar";
      span.style.fontSize = "2.2rem";
      span.style.cursor = "pointer";
      span.style.transition = "transform 0.3s";
      span.onclick = goToProfileSelection;
      span.innerText = child.avatar || "🧸";
      avatarEl.replaceWith(span);
    } else {
      avatarEl.innerText = child.avatar || "🧸";
    }
  }
  
  document.getElementById("current-child-name-heading").innerText = `${activeChild}의 공부방`;
  
  // Welcome and Quote
  document.getElementById("welcome-message").innerText = `안녕, ${activeChild}! 👋`;
  if (data.settings.motivationalQuotes && data.settings.motivationalQuotes.length > 0) {
    const quotes = data.settings.motivationalQuotes;
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    document.getElementById("motivational-quote").innerText = randomQuote;
  }
  
  // Set current date text
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}`;
  document.getElementById("current-date-string").innerText = dateStr;
  
  // Initialize history object if not exists
  if (!child.history) {
    child.history = {};
  }
  
  const todayKey = getLocalDateString(now);
  if (!child.history[todayKey]) {
    child.history[todayKey] = {
      completed: [],
      completedTimes: {},
      todos: []
    };
  }
  
  // Update UI Elements
  renderTodoList();
  updateStreakCount();
  renderWeeklyCalendar();
}

// Format date to local YYYY-MM-DD
function getLocalDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Get standard day of the week in English key
function getDayOfWeekKey(date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[date.getDay()];
}

function renderTodoList() {
  const child = data.children[activeChild];
  const todayKey = getLocalDateString(new Date());
  const dayKey = getDayOfWeekKey(new Date());
  const dailyHistory = child.history[todayKey];
  
  // Load scheduled subjects for today
  const scheduledTasks = child.weeklySchedule?.[dayKey] || [];
  
  // Load general todos for today
  const generalTodos = dailyHistory.todos || [];
  
  const listEl = document.getElementById("todo-list");
  listEl.innerHTML = "";
  
  if (scheduledTasks.length === 0 && generalTodos.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
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
    itemEl.className = `todo-item ${isCompleted ? 'completed' : ''}`;
    itemEl.onclick = () => toggleTask(task.id, false);
    
    itemEl.innerHTML = `
      <div class="todo-left">
        <div class="todo-checkbox">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="todo-info">
          <span class="todo-subject">${task.subject}</span>
          <div class="todo-meta">
            <span>${task.target || ''}</span>
            ${task.time ? `<span><i class="fa-regular fa-clock"></i> ${task.time}</span>` : ''}
            ${isCompleted && completedTime ? `<span class="todo-completed-time"><i class="fa-solid fa-circle-check"></i> ${completedTime} 완료</span>` : ''}
          </div>
        </div>
      </div>
      <div class="todo-tag">매주 ${getDayLabelKorean(dayKey)}</div>
    `;
    listEl.appendChild(itemEl);
  });
  
  // Render general todos for today
  generalTodos.forEach(todo => {
    const isCompleted = todo.completed;
    if (isCompleted) completedCount++;
    
    const itemEl = document.createElement("div");
    itemEl.className = `todo-item ${isCompleted ? 'completed' : ''}`;
    itemEl.onclick = () => toggleTask(todo.id, true);
    
    itemEl.innerHTML = `
      <div class="todo-left">
        <div class="todo-checkbox">
          <i class="fa-solid fa-check"></i>
        </div>
        <div class="todo-info">
          <span class="todo-subject">${todo.target}</span>
          <div class="todo-meta">
            ${todo.time ? `<span><i class="fa-regular fa-clock"></i> ${todo.time}</span>` : ''}
            ${isCompleted && todo.completedTime ? `<span class="todo-completed-time"><i class="fa-solid fa-circle-check"></i> ${todo.completedTime} 완료</span>` : ''}
          </div>
        </div>
      </div>
      <div class="todo-tag general">오늘 To-Do</div>
    `;
    listEl.appendChild(itemEl);
  });
  
  updateProgress(completedCount, totalTasks);
}

function getDayLabelKorean(key) {
  const mapping = {
    "monday": "월요일", "tuesday": "화요일", "wednesday": "수요일",
    "thursday": "목요일", "friday": "금요일", "saturday": "토요일", "sunday": "일요일"
  };
  return mapping[key] || "";
}

async function toggleTask(id, isGeneralTodo) {
  const child = data.children[activeChild];
  const todayKey = getLocalDateString(new Date());
  const dailyHistory = child.history[todayKey];
  
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let newlyCompleted = false;
  
  if (isGeneralTodo) {
    // Find general todo and toggle
    const todo = dailyHistory.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      todo.completedTime = todo.completed ? timeStr : null;
      newlyCompleted = todo.completed;
    }
  } else {
    // Toggle weekly schedule task
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
  
  // Trigger effects
  if (newlyCompleted) {
    triggerConfetti(false); // Small confetti for checking an item
  }
  
  // Re-render and save
  renderTodoList();
  await saveData();
  
  // Update calendar check in case today's state changed
  renderWeeklyCalendar();
  updateStreakCount();
}

function updateProgress(completed, total) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  const fillEl = document.getElementById("progress-bar-fill");
  const percentEl = document.getElementById("progress-percentage");
  const summaryEl = document.getElementById("progress-text-summary");
  
  fillEl.style.width = `${percentage}%`;
  percentEl.innerText = `${percentage}%`;
  
  if (total === 0) {
    summaryEl.innerText = "오늘 할 일이 정의되어 있지 않습니다.";
  } else if (completed === total) {
    summaryEl.innerText = `🥳 대단해요! 오늘 해야 할 ${total}개 일정을 모두 완료했습니다!`;
    // Trigger giant confetti on 100% completion if not already recorded
    const todayKey = getLocalDateString(new Date());
    const child = data.children[activeChild];
    if (!child.history[todayKey].celebrated) {
      child.history[todayKey].celebrated = true;
      triggerConfetti(true); // Big celebration!
      saveData();
    }
  } else {
    summaryEl.innerText = `오늘 할 일 ${total}개 중에 ${completed}개를 끝마쳤어요! 힘내요!`;
  }
}

// 5. Confetti Celebration Effect
function triggerConfetti(isGiant) {
  if (isGiant) {
    // Full screen blast
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
    // Small localized pop
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#06b6d4', '#ec4899', '#10b981']
    });
  }
}

// 6. Streak Tracker Logic
function updateStreakCount() {
  const child = data.children[activeChild];
  if (!child || !child.history) return;
  
  let streak = 0;
  let checkDate = new Date(); // Start checking from today
  
  // If today is not fully complete, start looking from yesterday
  const todayKey = getLocalDateString(checkDate);
  const todayComplete = isDayFullyCompleted(child, todayKey, checkDate);
  
  if (!todayComplete) {
    checkDate.setDate(checkDate.getDate() - 1); // Yesterday
  }
  
  while (true) {
    const checkKey = getLocalDateString(checkDate);
    const hasTasks = getDayTasksCount(child, checkKey, checkDate);
    
    if (hasTasks === 0) {
      // If no tasks are defined (e.g. weekend with no sched), it doesn't break the streak, skip it
      checkDate.setDate(checkDate.getDate() - 1);
      
      // Safety limit to avoid infinite loop on empty schedules
      if (streak === 0 && checkDate < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
        break;
      }
      continue;
    }
    
    if (isDayFullyCompleted(child, checkKey, checkDate)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break; // Streak is broken
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
  if (totalCount === 0) return false; // If there are no tasks, it's not marked "done" (neutral)
  
  return scheduledDone && generalDone;
}

// 7. Weekly Stamp Board
function renderWeeklyCalendar() {
  const child = data.children[activeChild];
  const calendarEl = document.getElementById("weekly-calendar");
  calendarEl.innerHTML = "";
  
  // Find current week's dates (Monday to Sunday)
  const today = new Date();
  const currentDay = today.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMon = currentDay === 0 ? -6 : 1 - currentDay; // Distance to Monday
  
  const daysKorean = ["월", "화", "수", "목", "금", "토", "일"];
  const daysEng = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  
  for (let i = 0; i < 7; i++) {
    const loopDate = new Date(today);
    loopDate.setDate(today.getDate() + distanceToMon + i);
    
    const loopKey = getLocalDateString(loopDate);
    const dayNameEng = daysEng[i];
    
    const isToday = loopKey === getLocalDateString(today);
    
    // Check completion status
    const scheduled = child.weeklySchedule?.[dayNameEng] || [];
    const historyEntry = child.history?.[loopKey];
    
    const completedSched = historyEntry?.completed || [];
    const generalTodos = historyEntry?.todos || [];
    
    const totalCount = scheduled.length + generalTodos.length;
    
    let stampClass = "";
    let stampIcon = `<i class="fa-solid fa-stamp" style="opacity: 0.2;"></i>`;
    
    if (totalCount > 0 && historyEntry) {
      const completedSchedCount = scheduled.filter(task => completedSched.includes(task.id)).length;
      const completedGeneralCount = generalTodos.filter(todo => todo.completed).length;
      const totalCompleted = completedSchedCount + completedGeneralCount;
      
      if (totalCompleted === totalCount) {
        stampClass = "success";
        stampIcon = `<i class="fa-solid fa-circle-check"></i>`;
      } else if (totalCompleted > 0) {
        stampClass = "partial";
        stampIcon = `<i class="fa-solid fa-circle-dot"></i>`;
      }
    }
    
    const dayCol = document.createElement("div");
    dayCol.className = `calendar-day ${isToday ? 'today' : ''} ${stampClass}`;
    
    dayCol.innerHTML = `
      <span class="day-label">${daysKorean[i]}</span>
      <div class="day-stamp">
        ${stampIcon}
      </div>
    `;
    calendarEl.appendChild(dayCol);
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
  
  // Set appropriate icon
  icon.className = "fa-solid";
  if (type === "success") {
    icon.classList.add("fa-circle-check");
  } else if (type === "error") {
    icon.classList.add("fa-circle-exclamation");
  } else {
    icon.classList.add("fa-triangle-exclamation");
  }
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove("active");
  }, 3000);
}
