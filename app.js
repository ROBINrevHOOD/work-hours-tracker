// State Management
let state = {
    isCheckedIn: false,
    isOnBreak: false,
    checkInTime: null,
    breakStartTime: null,
    totalBreakTime: 0,
    breaks: [],
    currentDate: new Date().toDateString()
};

let settings = {
    monthlyTarget: 160,
    dailyHours: 8,
    overtimeThreshold: 8,
    checkoutReminder: false,
    overtimeAlert: false
};

let timerInterval;
let reminderIntervals = {};

// Initialize
function init() {
    loadState();
    loadSettings();

    const historyMonthInput = document.getElementById('historyMonth');
    if (historyMonthInput) {
        historyMonthInput.value = new Date().toISOString().slice(0, 7);
    }

    updateUI();
    startTimer();
    setupEventListeners();
    loadHistory();
    requestNotificationPermission();
    setupReminders();
    
    // Set current date
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Event Listeners
function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
    
    if (tabName === 'analytics') {
        updateAnalytics();
    }
}

// Timer Functions
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (state.isCheckedIn) {
            updateTimer();
            updateTodayStats();
        }
    }, 1000);
}

function updateTimer() {
    if (!state.checkInTime) return;

    const now = new Date();
    const checkIn = new Date(state.checkInTime);
    let elapsed = now - checkIn;

    // Subtract break time
    if (state.isOnBreak && state.breakStartTime) {
        const currentBreak = now - new Date(state.breakStartTime);
        elapsed -= (state.totalBreakTime + currentBreak);
    } else {
        elapsed -= state.totalBreakTime;
    }

    // Prevent negative elapsed time
    elapsed = Math.max(0, elapsed);

    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    document.getElementById('timer').textContent =
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Check In/Out Functions
function checkIn() {
    state.isCheckedIn = true;
    state.checkInTime = new Date().toISOString();
    state.totalBreakTime = 0;
    state.breaks = [];
    state.overtimeAlerted = false;

    saveState();
    updateUI();
    setupReminders();
    showNotification('Checked in successfully!');
}

function checkOut() {
    if (state.isOnBreak) {
        breakOut(); // Auto break-out if a break is running
    }
    
    const checkOutTime = new Date();
    const checkInTime = new Date(state.checkInTime);
    const workedMs = checkOutTime - checkInTime - state.totalBreakTime;
    const workedHours = workedMs / 3600000;
    
    // Save to history
    const history = getHistory();
    const today = new Date().toDateString();
    const todayEntry = {
        date: today,
        checkIn: state.checkInTime,
        checkOut: checkOutTime.toISOString(),
        breaks: state.breaks,
        totalBreak: state.totalBreakTime,
        totalWorked: workedMs,
        overtime: Math.max(0, workedHours - settings.overtimeThreshold) * 3600000
    };
    
    history[today] = todayEntry;
    localStorage.setItem('workHistory', JSON.stringify(history));
    
    // Reset state
    state = {
        isCheckedIn: false,
        isOnBreak: false,
        checkInTime: null,
        breakStartTime: null,
        totalBreakTime: 0,
        breaks: [],
        currentDate: new Date().toDateString()
    };
    
    saveState();
    updateUI();
    loadHistory();
    showNotification(`Checked out! Worked ${formatDuration(workedMs)}`);
}

function breakIn() {
    if (state.isOnBreak) return;

    state.isOnBreak = true;
    state.breakStartTime = new Date().toISOString();

    saveState();
    updateUI();
    showNotification('Break started');
}

function breakOut() {
    if (!state.isOnBreak || !state.breakStartTime) return;

    const breakEnd = new Date();
    const breakStart = new Date(state.breakStartTime);
    const breakDuration = breakEnd - breakStart;

    state.breaks.push({
        start: state.breakStartTime,
        end: breakEnd.toISOString(),
        duration: breakDuration
    });

    state.totalBreakTime += breakDuration;
    state.isOnBreak = false;
    state.breakStartTime = null;

    saveState();
    updateUI();
    updateBreaksList();
    showNotification(`Break ended (${formatDuration(breakDuration)})`);
}

// UI Update Functions
function updateUI() {
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    const breakOutBtn = document.getElementById('breakOutBtn');
    const breakInBtn = document.getElementById('breakInBtn');
    const currentStatus = document.getElementById('currentStatus');
    
    if (state.isCheckedIn) {
        checkInBtn.disabled = true;
        checkOutBtn.disabled = false;
        
        if (state.isOnBreak) {
            breakOutBtn.disabled = false;
            breakInBtn.disabled = true;
            currentStatus.textContent = 'On Break';
            currentStatus.style.color = '#ea580c';
        } else {
            breakOutBtn.disabled = true;
            breakInBtn.disabled = false;
            currentStatus.textContent = 'Working';
            currentStatus.style.color = '#16a34a';
        }
    } else {
        checkInBtn.disabled = false;
        checkOutBtn.disabled = true;
        breakOutBtn.disabled = true;
        breakInBtn.disabled = true;
        currentStatus.textContent = 'Not Checked In';
        currentStatus.style.color = '#ffffff';
        document.getElementById('timer').textContent = '00:00:00';
    }
    
    updateTodayStats();
    updateMonthlyProgress();
    updateBreaksList();

    const analyticsTab = document.getElementById('analytics');
    if (analyticsTab && analyticsTab.classList.contains('active')) {
        updateAnalytics();
    }
}

function updateTodayStats() {
    const history = getHistory();
    const today = new Date().toDateString();
    let todayWorked = 0;
    let todayBreaks = 0;
    let overtime = 0;
    
    if (history[today]) {
        todayWorked = history[today].totalWorked;
        todayBreaks = history[today].totalBreak;
        overtime = history[today].overtime || 0;
    }
    
    // Add current session if checked in
    if (state.isCheckedIn && state.checkInTime) {
        const now = new Date();
        const checkIn = new Date(state.checkInTime);
        let currentSession = now - checkIn - state.totalBreakTime;
        
        if (state.isOnBreak && state.breakStartTime) {
            const currentBreak = now - new Date(state.breakStartTime);
            currentSession -= currentBreak;
            todayBreaks += state.totalBreakTime + currentBreak;
        } else {
            todayBreaks += state.totalBreakTime;
        }
        
        todayWorked += currentSession;
        overtime = Math.max(0, (todayWorked / 3600000) - settings.overtimeThreshold) * 3600000;
    }
    
    const remaining = Math.max(0, settings.dailyHours * 3600000 - todayWorked);
    
    document.getElementById('todayHours').textContent = formatDuration(todayWorked);
    document.getElementById('todayBreaks').textContent = formatDuration(todayBreaks);
    document.getElementById('remainingToday').textContent = formatDuration(remaining);
    document.getElementById('overtime').textContent = formatDuration(overtime);
    
    // Check for overtime alert
    if (settings.overtimeAlert && overtime > 0 && !state.overtimeAlerted) {
        showNotification('You are now in overtime!', 'warning');
        state.overtimeAlerted = true;
    }
}

function updateMonthlyProgress() {
    const history = getHistory();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthlyTotal = 0;
    
    for (const [date, entry] of Object.entries(history)) {
        const entryDate = new Date(date);
        if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
            monthlyTotal += entry.totalWorked;
        }
    }
    
    // Add current session
    if (state.isCheckedIn && state.checkInTime) {
        const now = new Date();
        const checkIn = new Date(state.checkInTime);
        let currentSession = now - checkIn - state.totalBreakTime;
        
        if (state.isOnBreak && state.breakStartTime) {
            const currentBreak = now - new Date(state.breakStartTime);
            currentSession -= currentBreak;
        }
        
        monthlyTotal += currentSession;
    }
    
    const monthlyHours = monthlyTotal / 3600000;
    const targetHours = settings.monthlyTarget;
    const percentage = Math.min(100, (monthlyHours / targetHours) * 100);
    
    // Update progress ring
    const circumference = 2 * Math.PI * 80;
    const offset = circumference - (percentage / 100) * circumference;
    
    const progressCircle = document.getElementById('progressCircle');
    progressCircle.style.strokeDashoffset = offset;
    
    document.getElementById('progressText').textContent = `${Math.round(percentage)}%`;
    document.getElementById('progressHours').textContent = 
        `${monthlyHours.toFixed(1)} / ${targetHours} hrs`;
    
    document.getElementById('monthlyWorked').textContent = `${monthlyHours.toFixed(1)}h`;
    document.getElementById('monthlyTarget').textContent = `${targetHours}h`;
    
    // Calculate required daily hours for remaining days
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysPassed = now.getDate();
    const remainingDays = daysInMonth - daysPassed;
    const remainingHours = Math.max(0, targetHours - monthlyHours);
    const dailyRequired = remainingDays > 0 ? (remainingHours / remainingDays).toFixed(1) : 0;
    
    document.getElementById('dailyRequired').textContent = `${dailyRequired}h`;
}

function updateBreaksList() {
    const container = document.getElementById('breaksContainer');
    const breaksList = document.getElementById('breaksList');
    
    if (state.breaks.length === 0 && !state.isOnBreak) {
        breaksList.style.display = 'none';
        return;
    }
    
    breaksList.style.display = 'block';
    container.innerHTML = '';
    
    state.breaks.forEach((brk, index) => {
        const breakItem = document.createElement('div');
        breakItem.className = 'break-item';
        breakItem.innerHTML = `
            <span>Break ${index + 1}</span>
            <span>${formatDuration(brk.duration)}</span>
        `;
        container.appendChild(breakItem);
    });
    
    if (state.isOnBreak && state.breakStartTime) {
        const breakItem = document.createElement('div');
        breakItem.className = 'break-item';
        breakItem.style.background = '#fef3c7';
        breakItem.innerHTML = `
            <span>Current Break</span>
            <span>Ongoing...</span>
        `;
        container.appendChild(breakItem);
    }
}

// History Functions
function loadHistory() {
    const history = getHistory();
    const historyList = document.getElementById('historyList');
    const selectedMonth = document.getElementById('historyMonth').value;
    
    historyList.innerHTML = '';
    
    const [year, month] = selectedMonth.split('-').map(Number);
    const entries = [];
    
    for (const [date, entry] of Object.entries(history)) {
        const entryDate = new Date(date);
        if (entryDate.getFullYear() === year && entryDate.getMonth() === month - 1) {
            entries.push({ date, ...entry });
        }
    }
    
    // Check for leaves
    const leaves = getLeaves();
    for (const leave of leaves) {
        const leaveDate = new Date(leave.date);
        if (leaveDate.getFullYear() === year && leaveDate.getMonth() === month - 1) {
            entries.push({
                date: leave.date,
                isLeave: true,
                leaveType: leave.type,
                leaveNotes: leave.notes
            });
        }
    }
    
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (entries.length === 0) {
        historyList.innerHTML = '<div class="history-item">No entries for this month</div>';
        return;
    }
    
    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        if (entry.isLeave) {
            item.classList.add('leave-day');
            item.innerHTML = `
                <div>
                    <div class="history-date">${formatDate(entry.date)}</div>
                    <div style="font-size: 14px; color: var(--text-light);">
                        ${entry.leaveType.charAt(0).toUpperCase() + entry.leaveType.slice(1)}
                        ${entry.leaveNotes ? ` - ${entry.leaveNotes}` : ''}
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="deleteLeave('${entry.date}')" style="padding: 5px 10px;">Delete</button>
            `;
        } else {
            const overtime = entry.overtime || 0;
            item.innerHTML = `
                <div>
                    <div class="history-date">${formatDate(entry.date)}</div>
                    <div style="font-size: 14px; color: var(--text-light);">
                        ${new Date(entry.checkIn).toLocaleTimeString()} - 
                        ${new Date(entry.checkOut).toLocaleTimeString()}
                        ${overtime > 0 ? '<span class="overtime-badge">OT</span>' : ''}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="history-hours">${formatDuration(entry.totalWorked)}</span>
                    <button class="btn btn-secondary" onclick="editEntry('${entry.date}')" style="padding: 5px 10px;">Edit</button>
                </div>
            `;
        }
        
        historyList.appendChild(item);
    });
}

// Analytics Functions
function updateAnalytics() {
    updateAnalyticsStats();

    const analyticsTab = document.getElementById('analytics');
    if (!analyticsTab || !analyticsTab.classList.contains('active')) {
        return;
    }

    updateWeeklyChart();
    updateMonthlyChart();
}

function updateWeeklyChart() {
    const canvas = document.getElementById('weeklyChart');
    if (!canvas) return;

    const displayWidth = canvas.offsetWidth;
    if (!displayWidth) return;
    
    const ctx = canvas.getContext('2d');
    const history = getHistory();
    
    // Get last 7 days
    const days = [];
    const hours = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        
        days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        
        if (history[dateStr]) {
            hours.push((history[dateStr].totalWorked / 3600000).toFixed(1));
        } else {
            hours.push(0);
        }
    }
    
    // Simple bar chart
    drawBarChart(ctx, days, hours, displayWidth);
}

function updateMonthlyChart() {
    const canvas = document.getElementById('monthlyChart');
    if (!canvas) return;

    const displayWidth = canvas.offsetWidth;
    if (!displayWidth) return;
    
    const ctx = canvas.getContext('2d');
    const history = getHistory();
    
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const days = [];
    const hours = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i);
        const dateStr = date.toDateString();
        
        days.push(i);
        
        if (history[dateStr]) {
            hours.push((history[dateStr].totalWorked / 3600000).toFixed(1));
        } else {
            hours.push(0);
        }
    }
    
    drawLineChart(ctx, days, hours, displayWidth);
}

function drawBarChart(ctx, labels, data, displayWidth) {
    const canvas = ctx.canvas;
    const width = canvas.width = displayWidth * 2;
    const height = canvas.height = 400;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(2, 2);
    
    const padding = 40;
    const innerWidth = displayWidth - padding * 2;
    if (!labels.length || innerWidth <= 0) {
        return;
    }
    const barWidth = innerWidth / labels.length * 0.6;
    const maxValue = Math.max(...data.map(Number), 10);
    const scale = (200 - padding) / maxValue;
    
    // Draw bars
    ctx.fillStyle = '#1e40af';
    labels.forEach((label, i) => {
        const step = innerWidth / labels.length;
        const value = Number(data[i]);
        const x = padding + (i * step) + (step - barWidth) / 2;
        const barHeight = value * scale;
        const y = 200 - barHeight - padding;
        
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Draw value
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        const labelValue = Number.isFinite(value)
            ? value.toFixed(1).replace(/\.0$/, '')
            : '0';
        ctx.fillText(labelValue, x + barWidth / 2, y - 5);

        // Draw label
        ctx.fillText(label, x + barWidth / 2, 200 - padding + 20);

        ctx.fillStyle = '#1e40af';
    });
}

function drawLineChart(ctx, labels, data, displayWidth) {
    const canvas = ctx.canvas;
    const width = canvas.width = displayWidth * 2;
    const height = canvas.height = 400;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(2, 2);

    const padding = 40;
    const maxValue = Math.max(...data.map(Number), 10);
    const scale = (200 - padding) / maxValue;

    // Prevent division by zero
    const divisor = Math.max(1, labels.length - 1);
    if (!labels.length) {
        return;
    }

    // Draw line
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.beginPath();

    labels.forEach((label, i) => {
        const x = padding + (i * (displayWidth - padding * 2) / divisor);
        const y = 200 - (Number(data[i]) * scale) - padding;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#1e40af';
    labels.forEach((label, i) => {
        const x = padding + (i * (displayWidth - padding * 2) / divisor);
        const y = 200 - (Number(data[i]) * scale) - padding;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function updateAnalyticsStats() {
    const history = getHistory();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let totalDays = 0;
    let totalHours = 0;
    let totalBreaks = 0;
    let totalOvertime = 0;
    
    for (const [date, entry] of Object.entries(history)) {
        const entryDate = new Date(date);
        if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
            totalDays++;
            totalHours += entry.totalWorked;
            totalBreaks += entry.totalBreak;
            totalOvertime += entry.overtime || 0;
        }
    }
    
    const avgDaily = totalDays > 0 ? totalHours / totalDays / 3600000 : 0;
    const avgBreak = totalDays > 0 ? totalBreaks / totalDays / 60000 : 0;
    
    document.getElementById('avgDaily').textContent = `${avgDaily.toFixed(1)}h`;
    document.getElementById('avgBreak').textContent = `${Math.round(avgBreak)}m`;
    document.getElementById('totalOvertime').textContent = `${(totalOvertime / 3600000).toFixed(1)}h`;
}

// Settings Functions
function loadSettings() {
    const saved = localStorage.getItem('workSettings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
    
    document.getElementById('monthlyTargetSetting').value = settings.monthlyTarget;
    document.getElementById('dailyHoursSetting').value = settings.dailyHours;
    document.getElementById('overtimeThreshold').value = settings.overtimeThreshold;
    document.getElementById('checkoutReminder').checked = settings.checkoutReminder;
    document.getElementById('overtimeAlert').checked = settings.overtimeAlert;
    
    loadLeavesList();
}

function saveSettings() {
    settings.monthlyTarget = Number(document.getElementById('monthlyTargetSetting').value);
    settings.dailyHours = Number(document.getElementById('dailyHoursSetting').value);
    settings.overtimeThreshold = Number(document.getElementById('overtimeThreshold').value);
    settings.checkoutReminder = document.getElementById('checkoutReminder').checked;
    settings.overtimeAlert = document.getElementById('overtimeAlert').checked;
    
    localStorage.setItem('workSettings', JSON.stringify(settings));
    updateUI();
    setupReminders();
    showNotification('Settings saved!');
}

// Leave Management
function openLeaveModal() {
    document.getElementById('leaveModal').classList.add('active');
    document.getElementById('leaveDate').value = new Date().toISOString().split('T')[0];
}

function closeLeaveModal() {
    document.getElementById('leaveModal').classList.remove('active');
}

function saveLeave() {
    const type = document.getElementById('leaveType').value;
    const date = document.getElementById('leaveDate').value;
    const notes = document.getElementById('leaveNotes').value;
    
    if (!date) {
        alert('Please select a date');
        return;
    }
    
    const leaves = getLeaves();
    leaves.push({ type, date, notes });
    localStorage.setItem('leaves', JSON.stringify(leaves));
    
    closeLeaveModal();
    loadLeavesList();
    loadHistory();
    showNotification('Leave marked successfully!');
}

function getLeaves() {
    return JSON.parse(localStorage.getItem('leaves') || '[]');
}

function deleteLeave(date) {
    const leaves = getLeaves();
    const filtered = leaves.filter(l => l.date !== date);
    localStorage.setItem('leaves', JSON.stringify(filtered));
    loadLeavesList();
    loadHistory();
    showNotification('Leave deleted');
}

function loadLeavesList() {
    const leaves = getLeaves();
    const container = document.getElementById('leaveList');
    
    if (leaves.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No leaves marked</p>';
        return;
    }
    
    container.innerHTML = leaves.map(leave => `
        <div class="break-item">
            <div>
                <strong>${formatDate(leave.date)}</strong><br>
                <small>${leave.type} ${leave.notes ? `- ${leave.notes}` : ''}</small>
            </div>
            <button class="btn btn-secondary" onclick="deleteLeave('${leave.date}')" style="padding: 5px 10px;">Delete</button>
        </div>
    `).join('');
}

// Modal Functions
function openEditModal(date = null) {
    document.getElementById('editModal').classList.add('active');
    
    if (date) {
        const history = getHistory();
        const entry = history[date];
        
        document.getElementById('editDate').value = new Date(date).toISOString().split('T')[0];
        document.getElementById('editCheckIn').value = new Date(entry.checkIn).toTimeString().slice(0, 5);
        document.getElementById('editCheckOut').value = new Date(entry.checkOut).toTimeString().slice(0, 5);
        document.getElementById('editBreak').value = Math.round(entry.totalBreak / 60000);
    } else {
        document.getElementById('editDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('editCheckIn').value = '09:00';
        document.getElementById('editCheckOut').value = '18:00';
        document.getElementById('editBreak').value = 60;
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

function saveEditEntry() {
    const dateValue = document.getElementById('editDate').value;
    const checkInTime = document.getElementById('editCheckIn').value;
    const checkOutTime = document.getElementById('editCheckOut').value;
    const breakMinutes = Number(document.getElementById('editBreak').value);

    if (!dateValue || !checkInTime || !checkOutTime) {
        alert('Please fill all required fields');
        return;
    }

    const [year, month, day] = dateValue.split('-').map(Number);
    if (!year || !month || !day) {
        alert('Invalid date');
        return;
    }

    const [inHour, inMin] = checkInTime.split(':').map(Number);
    const [outHour, outMin] = checkOutTime.split(':').map(Number);

    const checkIn = new Date(year, month - 1, day, inHour || 0, inMin || 0, 0, 0);
    const checkOut = new Date(year, month - 1, day, outHour || 0, outMin || 0, 0, 0);

    const totalBreak = breakMinutes * 60000;
    const totalWorked = checkOut - checkIn - totalBreak;

    if (totalWorked < 0) {
        alert('Check-out time must be after check-in time once breaks are deducted.');
        return;
    }
    const overtime = Math.max(0, (totalWorked / 3600000) - settings.overtimeThreshold) * 3600000;
    
    const history = getHistory();
    const historyKey = new Date(year, month - 1, day).toDateString();
    history[historyKey] = {
        date: historyKey,
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        breaks: [],
        totalBreak,
        totalWorked,
        overtime
    };
    
    localStorage.setItem('workHistory', JSON.stringify(history));
    
    closeEditModal();
    loadHistory();
    updateUI();
    showNotification('Entry saved successfully!');
}

function editEntry(date) {
    openEditModal(date);
}

// Export Functions
function exportCSV() {
    const history = getHistory();
    const month = document.getElementById('historyMonth').value;
    const [year, monthNum] = month.split('-').map(Number);
    
    let csv = 'Date,Check In,Check Out,Break Duration,Total Worked,Overtime\n';
    
    for (const [date, entry] of Object.entries(history)) {
        const entryDate = new Date(date);
        if (entryDate.getFullYear() === year && entryDate.getMonth() === monthNum - 1) {
            csv += `${formatDate(date)},`;
            csv += `${new Date(entry.checkIn).toLocaleTimeString()},`;
            csv += `${new Date(entry.checkOut).toLocaleTimeString()},`;
            csv += `${formatDuration(entry.totalBreak)},`;
            csv += `${formatDuration(entry.totalWorked)},`;
            csv += `${formatDuration(entry.overtime || 0)}\n`;
        }
    }
    
    downloadFile(csv, `work-hours-${month}.csv`, 'text/csv');
}

function exportPDF() {
    const history = getHistory();
    const month = document.getElementById('historyMonth').value;
    const [year, monthNum] = month.split('-').map(Number);
    
    let html = `
        <html>
        <head>
            <title>Work Hours Report - ${month}</title>
            <style>
                body { font-family: Arial, sans-serif; }
                h1 { color: #1e40af; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            <h1>Work Hours Report - ${month}</h1>
            <table>
                <tr>
                    <th>Date</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Break</th>
                    <th>Total Worked</th>
                    <th>Overtime</th>
                </tr>
    `;
    
    let totalWorked = 0;
    let totalOvertime = 0;
    
    for (const [date, entry] of Object.entries(history)) {
        const entryDate = new Date(date);
        if (entryDate.getFullYear() === year && entryDate.getMonth() === monthNum - 1) {
            totalWorked += entry.totalWorked;
            totalOvertime += entry.overtime || 0;
            
            html += `
                <tr>
                    <td>${formatDate(date)}</td>
                    <td>${new Date(entry.checkIn).toLocaleTimeString()}</td>
                    <td>${new Date(entry.checkOut).toLocaleTimeString()}</td>
                    <td>${formatDuration(entry.totalBreak)}</td>
                    <td>${formatDuration(entry.totalWorked)}</td>
                    <td>${formatDuration(entry.overtime || 0)}</td>
                </tr>
            `;
        }
    }
    
    html += `
            </table>
            <h3>Summary</h3>
            <p>Total Hours Worked: ${formatDuration(totalWorked)}</p>
            <p>Total Overtime: ${formatDuration(totalOvertime)}</p>
        </body>
        </html>
    `;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

function exportAllData() {
    const data = {
        history: getHistory(),
        settings: settings,
        leaves: getLeaves(),
        exportDate: new Date().toISOString()
    };
    
    downloadFile(JSON.stringify(data, null, 2), 'work-hours-backup.json', 'application/json');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (data.history) {
                    localStorage.setItem('workHistory', JSON.stringify(data.history));
                }
                if (data.settings) {
                    localStorage.setItem('workSettings', JSON.stringify(data.settings));
                }
                if (data.leaves) {
                    localStorage.setItem('leaves', JSON.stringify(data.leaves));
                }
                
                location.reload();
            } catch (error) {
                alert('Invalid file format');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

function clearData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone!')) {
        localStorage.clear();
        location.reload();
    }
}

// Utility Functions
function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.background = type === 'warning' ? 'var(--warning)' : 'var(--success)';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Notification Functions
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '⏰' });
    }
}

function setupReminders() {
    // Clear existing intervals
    Object.values(reminderIntervals).forEach(clearInterval);
    reminderIntervals = {};
    
    // Checkout reminder (at expected checkout time)
    if (settings.checkoutReminder && state.isCheckedIn) {
        const checkIn = new Date(state.checkInTime);
        const expectedCheckout = new Date(checkIn.getTime() + settings.dailyHours * 3600000 + 3600000); // +1 hour for break
        const now = new Date();
        
        if (expectedCheckout > now) {
            const delay = expectedCheckout - now;
            reminderIntervals.checkout = setTimeout(() => {
                sendNotification('Checkout Reminder', 'Time to check out for the day!');
            }, delay);
        }
    }
}

// Storage Functions
function saveState() {
    localStorage.setItem('workState', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('workState');
    if (saved) {
        const savedState = JSON.parse(saved);
        
        // Check if it's a new day
        if (savedState.currentDate !== new Date().toDateString()) {
            // Reset for new day
            state = {
                isCheckedIn: false,
                isOnBreak: false,
                checkInTime: null,
                breakStartTime: null,
                totalBreakTime: 0,
                breaks: [],
                currentDate: new Date().toDateString()
            };
        } else {
            state = savedState;
        }
    }
}

function getHistory() {
    return JSON.parse(localStorage.getItem('workHistory') || '{}');
}

// Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.error('Service worker registration failed:', error);
        });
    });
}

// Initialize on load
window.addEventListener('load', init);
