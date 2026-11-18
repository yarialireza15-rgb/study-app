const SUBJECTS = [
    "حسابان", "حسابان2", "ریاضی", "گسسته",
    "هندسه1", "هندسه2", "هندسه3", "آمار",
    "فیزیک1", "فیزیک2", "فیزیک 3",
    "شیمی1", "شیمی2", "شیمی3",
    "دینی", "فارسی", "زبان", "عربی", "هویت", "سلامت"
];

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];
const SCHOOL_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"];

let studyLogs = JSON.parse(localStorage.getItem("studyLogs")) || [];
let prevWeekMins = Number(localStorage.getItem("prevWeekMins")) || 0;
let notes = JSON.parse(localStorage.getItem("digitalNotes")) || [];
let monthlyExams = JSON.parse(localStorage.getItem("monthlyExams")) || [];
let selectedMonth = localStorage.getItem("selectedMonth") || "آبان";
let todos = JSON.parse(localStorage.getItem("dailyTodos")) || [];
let schoolSchedule = JSON.parse(localStorage.getItem("schoolSchedule")) || {
    "شنبه": ["حسابان2", "فیزیک 3", "دینی", "زبان"],
    "یکشنبه": ["گسسته", "شیمی3", "فارسی", "هندسه3"],
    "دوشنبه": ["فیزیک 3", "حسابان2", "عربی", "هویت"],
    "سه‌شنبه": ["شیمی3", "هندسه3", "سلامت", "فارسی"],
    "چهارشنبه": ["گسسته", "حسابان2", "فیزیک 3", "دینی"]
};

let waveChart = null;
let dailyGoal = Number(localStorage.getItem("dailyGoal")) || 4;
let mistakes = JSON.parse(localStorage.getItem("mistakeBook")) || [];
let weeklyGoals = JSON.parse(localStorage.getItem("weeklyGoals")) || {};
let target = JSON.parse(localStorage.getItem("targetEvent")) || { title: "کنکور", date: "" };
let studyPlan = JSON.parse(localStorage.getItem("studyPlan")) || null;
let userName = localStorage.getItem("userName") || "علیرضا";
let longChart = null;

// جلوگیری از اجرای کد در متن‌های واردشده (XSS)
function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// تاریخ محلی به شکل YYYY-MM-DD؛ بدون مشکل اختلاف منطقه زمانی
function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// شروع هفته از شنبه
function getWeekStart(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
    return start;
}

function getCurrentWeekLogs() {
    const start = getWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return studyLogs.filter(log => {
        if (!log.date) return false; // رکوردهای قدیمی بدون تاریخ حفظ می‌شوند، اما در آمار هفتگی وارد نمی‌شوند.
        const date = new Date(`${log.date}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date >= start && date < end;
    });
}

function init() {
    ["subject-select", "timer-subject", "note-subject", "exam-subject-select", "school-subject-select", "mistake-subject", "goal-subject"].forEach(id => {
        const select = document.getElementById(id);
        SUBJECTS.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            select.appendChild(opt);
        });
    });

    const monthSelect = document.getElementById("month-select");
    monthSelect.value = selectedMonth;
    monthSelect.addEventListener("change", () => {
        selectedMonth = monthSelect.value;
        save();
        renderMonthCalendar();
    });

    const dateInput = document.getElementById("study-date");
    const daySelect = document.getElementById("day-select");

    if (dateInput) {
        dateInput.value = getLocalDateKey();

        const syncStudyDay = () => {
            if (!dateInput.value) return;
            const selectedDate = new Date(`${dateInput.value}T00:00:00`);
            if (Number.isNaN(selectedDate.getTime())) return;
            const dayIndex = (selectedDate.getDay() + 1) % 7;
            daySelect.value = DAYS[dayIndex];
            document.getElementById("study-date-fa").textContent = "📅 " + selectedDate.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        };

        dateInput.addEventListener("change", syncStudyDay);
        syncStudyDay();
    }

    const goalInput = document.getElementById("daily-goal");
    if (goalInput) {
        goalInput.value = dailyGoal;
        goalInput.addEventListener("change", () => {
            const value = Number(goalInput.value);
            if (!Number.isFinite(value)) {
                goalInput.value = dailyGoal;
                return;
            }
            dailyGoal = Math.min(14, Math.max(1, value));
            goalInput.value = dailyGoal;
            save();
        });
    }

    rolloverTodos();
    updateAll();
}

function save() {
    localStorage.setItem("studyLogs", JSON.stringify(studyLogs));
    localStorage.setItem("prevWeekMins", String(prevWeekMins));
    localStorage.setItem("digitalNotes", JSON.stringify(notes));
    localStorage.setItem("monthlyExams", JSON.stringify(monthlyExams));
    localStorage.setItem("selectedMonth", selectedMonth);
    localStorage.setItem("dailyTodos", JSON.stringify(todos));
    localStorage.setItem("schoolSchedule", JSON.stringify(schoolSchedule));
    localStorage.setItem("dailyGoal", String(dailyGoal));
    localStorage.setItem("mistakeBook", JSON.stringify(mistakes));
    localStorage.setItem("weeklyGoals", JSON.stringify(weeklyGoals));
    localStorage.setItem("targetEvent", JSON.stringify(target));
    localStorage.setItem("studyPlan", JSON.stringify(studyPlan));
    localStorage.setItem("userName", userName);
}

function updateAll() {
    renderMonthCalendar();
    renderSchoolTable();
    updateCardsAndRadar();
    renderChart();
    renderHistory();
    renderDigitalNotes();
    renderTodos();
    renderMistakes();
    renderGoals();
    renderCountdown();
    renderLongTerm();
    renderPlan();
}

/* --- ۱. برنامه هفتگی مدرسه --- */
document.getElementById("save-school-slot").addEventListener("click", () => {
    const day = document.getElementById("school-day-select").value;
    const period = parseInt(document.getElementById("school-period-select").value);
    const subj = document.getElementById("school-subject-select").value;
    if (!schoolSchedule[day]) schoolSchedule[day] = ["-", "-", "-", "-"];
    schoolSchedule[day][period] = subj;
    save();
    renderSchoolTable();
});

function renderSchoolTable() {
    const tbody = document.getElementById("school-table-body");
    tbody.innerHTML = "";
    SCHOOL_DAYS.forEach(day => {
        const slots = schoolSchedule[day] || ["-", "-", "-", "-"];
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${day}</strong></td>
            <td><span class="school-pill">${esc(slots[0])}</span></td>
            <td><span class="school-pill">${esc(slots[1])}</span></td>
            <td><span class="school-pill">${esc(slots[2])}</span></td>
            <td><span class="school-pill">${esc(slots[3])}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

/* --- ۲. دفترچه یادداشت دیجیتال --- */
document.getElementById("add-note").addEventListener("click", () => {
    const subj = document.getElementById("note-subject").value;
    const title = document.getElementById("note-title").value.trim() || "یادداشت درسی";
    const body = document.getElementById("note-body").value.trim();
    if (!body) return;

    notes.unshift({
        id: Date.now(),
        subj,
        title,
        body,
        date: new Date().toLocaleDateString("fa-IR")
    });
    document.getElementById("note-title").value = "";
    document.getElementById("note-body").value = "";
    save();
    renderDigitalNotes();
});

document.getElementById("note-search").addEventListener("input", renderDigitalNotes);

function renderDigitalNotes() {
    const grid = document.getElementById("notes-grid");
    const query = document.getElementById("note-search").value.trim().toLowerCase();
    grid.innerHTML = "";

    notes
        .filter(n => n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query) || n.subj.includes(query))
        .forEach(n => {
            const card = document.createElement("div");
            card.className = "digital-note-card";
            card.innerHTML = `
                <header>
                    <span class="note-subj-tag">${esc(n.subj)}</span>
                    <span><button class="del-x" onclick="editNote(${Number(n.id)})">✏️</button><button class="del-x" onclick="removeNote(${n.id})">✕</button></span>
                </header>
                <strong>${esc(n.title)}</strong>
                <p style="white-space: pre-line; line-height: 1.6;">${esc(n.body)}</p>
                <small style="color: var(--text-muted); font-size: 0.7rem;">${esc(n.date || "")}</small>
            `;
            grid.appendChild(card);
        });
}

window.removeNote = function(id) {
    notes = notes.filter(n => n.id !== id);
    save();
    renderDigitalNotes();
};

/* --- دفترچه خطاها (غلط‌نامه) با مرور فاصله‌دار --- */
const MISTAKE_REASONS = ["مفهومی (بلد نبودم)", "محاسباتی", "عجله / بی‌دقتی", "سؤال را اشتباه خواندم", "فرمول یادم نبود", "زمان کم آوردم"];
const REVIEW_INTERVALS = [1, 3, 7, 14]; // روز

(function fillMistakeSelects() {
    const reasonSel = document.getElementById("mistake-reason");
    const filterSel = document.getElementById("mistake-filter");
    MISTAKE_REASONS.forEach(r => {
        reasonSel.add(new Option(r, r));
        filterSel.add(new Option(r, r));
    });
})();

function addDaysToKey(key, n) {
    const d = new Date(`${key}T00:00:00`);
    d.setDate(d.getDate() + n);
    return getLocalDateKey(d);
}

function mistakeIsDue(m) {
    return !!m.nextReview && m.nextReview <= getLocalDateKey();
}

document.getElementById("add-mistake").addEventListener("click", () => {
    const topic = document.getElementById("mistake-topic").value.trim();
    const body = document.getElementById("mistake-body").value.trim();
    if (!topic && !body) return;
    const today = getLocalDateKey();
    mistakes.unshift({
        id: Date.now(),
        subj: document.getElementById("mistake-subject").value,
        topic: topic || "بدون مبحث",
        reason: document.getElementById("mistake-reason").value,
        body,
        date: today,
        stage: 0,
        nextReview: addDaysToKey(today, REVIEW_INTERVALS[0])
    });
    document.getElementById("mistake-topic").value = "";
    document.getElementById("mistake-body").value = "";
    save();
    renderMistakes();
    updateCardsAndRadar();
});

document.getElementById("mistake-filter").addEventListener("change", renderMistakes);

function reviewMistake(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;
    m.stage = (m.stage || 0) + 1;
    m.nextReview = m.stage < REVIEW_INTERVALS.length ? addDaysToKey(getLocalDateKey(), REVIEW_INTERVALS[m.stage]) : null;
    save();
    renderMistakes();
    updateCardsAndRadar();
}

function renderMistakes() {
    const grid = document.getElementById("mistakes-grid");
    const stats = document.getElementById("mistake-stats");
    const filter = document.getElementById("mistake-filter").value;
    grid.innerHTML = "";
    stats.innerHTML = "";

    const chip = (text, cls = "") => {
        const s = document.createElement("span");
        s.className = "note-subj-tag " + cls;
        s.textContent = text;
        stats.appendChild(s);
    };
    const counts = {};
    mistakes.forEach(m => { counts[m.reason] = (counts[m.reason] || 0) + 1; });
    const dueCount = mistakes.filter(mistakeIsDue).length;
    chip(`کل خطاها: ${mistakes.length}`);
    if (dueCount) chip(`مرور امروز: ${dueCount}`, "due-tag");
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => chip(`${r}: ${c}`));

    const visible = mistakes
        .filter(m => filter === "all" || (filter === "due" ? mistakeIsDue(m) : m.reason === filter))
        .sort((a, b) => (mistakeIsDue(b) ? 1 : 0) - (mistakeIsDue(a) ? 1 : 0) || b.id - a.id);

    if (!visible.length) {
        const p = document.createElement("p");
        p.className = "mistake-empty";
        p.textContent = mistakes.length ? "موردی با این فیلتر پیدا نشد." : "هنوز خطایی ثبت نکرده‌ای. بعد از هر آزمون، تست‌های غلط رو اینجا بنویس.";
        grid.appendChild(p);
        return;
    }

    visible.forEach(m => {
        const due = mistakeIsDue(m);
        let status;
        if (!m.nextReview) status = "✅ تسلط کامل";
        else if (due) status = "🔔 امروز مرور شود";
        else status = `مرور بعدی: ${new Date(`${m.nextReview}T00:00:00`).toLocaleDateString("fa-IR")}`;

        const card = document.createElement("div");
        card.className = "digital-note-card mistake-card" + (due ? " due" : "");
        card.innerHTML = `
            <header>
                <span><span class="note-subj-tag">${esc(m.subj)}</span> <span class="note-subj-tag">${esc(m.reason)}</span></span>
                <button class="del-x" data-act="del">✕</button>
            </header>
            <strong>${esc(m.topic)}</strong>
            <p style="white-space: pre-line; line-height: 1.6;">${esc(m.body)}</p>
            <small style="color: var(--text-muted); font-size: 0.75rem;">${status}</small>
        `;
        card.querySelector('[data-act="del"]').addEventListener("click", () => {
            mistakes = mistakes.filter(x => x.id !== m.id);
            save();
            renderMistakes();
            updateCardsAndRadar();
        });
        if (due) {
            const btn = document.createElement("button");
            btn.className = "teal-btn small";
            btn.textContent = "مرور شد ✓";
            btn.addEventListener("click", () => reviewMistake(m.id));
            card.appendChild(btn);
        }
        grid.appendChild(card);
    });
}

/* --- ۳. چک‌لیست کارهای امروز و گزارش پایان روز --- */
document.getElementById("add-todo-btn").addEventListener("click", () => {
    const input = document.getElementById("todo-input");
    if (!input.value.trim()) return;
    todos.push({ id: Date.now(), text: input.value.trim(), done: false, date: getLocalDateKey() });
    input.value = "";
    save();
    renderTodos();
});

function renderTodos() {
    const list = document.getElementById("todo-list");
    list.innerHTML = "";
    todos.forEach(t => {
        const li = document.createElement("li");
        li.innerHTML = `
            <label style="display:flex; align-items:center; gap:6px; margin:0; cursor:pointer;" class="${t.done ? 'todo-done' : ''}">
                <input type="checkbox" style="width:auto;" ${t.done ? "checked" : ""} onchange="toggleTodo(${t.id})">
                <span ondblclick="editTodo(${t.id})" title="دوبار کلیک برای ویرایش">${t.carried ? "↪ " : ""}${esc(t.text)}</span>
            </label>
            <button class="del-x" onclick="removeTodo(${t.id})">✕</button>
        `;
        list.appendChild(li);
    });
}

window.toggleTodo = function(id) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done, doneDate: !t.done ? getLocalDateKey() : null } : t);
    save();
    renderTodos();
};

window.removeTodo = function(id) {
    todos = todos.filter(t => t.id !== id);
    save();
    renderTodos();
};

function openEndOfDayReport() {
    const todayIdx = (new Date().getDay() + 1) % 7;
    const todayName = DAYS[todayIdx];
    const tomorrowName = DAYS[(todayIdx + 1) % 7];

    // زمان مطالعه امروز
    const todayLogs = studyLogs.filter(l => l.date === getLocalDateKey());
    const todayMins = todayLogs.reduce((s, l) => s + l.minutes, 0);
    const todayTests = todayLogs.reduce((s, l) => s + (l.totalTests || 0), 0);
    document.getElementById("eod-study-time").textContent = `${todayMins} دقیقه (${(todayMins / 60).toFixed(1)} ساعت)`;
    document.getElementById("eod-test-summary").textContent = `${todayTests} تست ثبت‌شده در امروز (${todayName})`;

    // درس‌های ضعیف‌تر
    const weak = getWeakSubjects();
    document.getElementById("eod-weak-subjects").textContent = weak.length
        ? weak.slice(0, 5).join("، ")
        : "عالی! هیچ درس عقب‌افتاده‌ای ندارید.";

    // کارهای انجام‌شده امروز
    const completedList = document.getElementById("eod-completed-tasks");
    completedList.innerHTML = "";
    const doneTodos = todos.filter(t => t.done && t.doneDate === getLocalDateKey());
    if (doneTodos.length === 0 && todayLogs.length === 0) {
        completedList.innerHTML = "<li>هنوز موردی برای امروز تیک نخورده است.</li>";
    } else {
        doneTodos.forEach(t => {
            const li = document.createElement("li");
            li.textContent = `✔ ${t.text}`;
            completedList.appendChild(li);
        });
        todayLogs.forEach(l => {
            const li = document.createElement("li");
            li.textContent = `📖 مطالعه ${l.subject} (${l.minutes} دقیقه)`;
            completedList.appendChild(li);
        });
    }

    // برنامه فردا (کلاس‌های مدرسه + درس پیشنهادی)
    const tomorrowClasses = schoolSchedule[tomorrowName]
        ? `کلاس‌های مدرسه (${tomorrowName}): ${schoolSchedule[tomorrowName].join("، ")}`
        : `${tomorrowName} تعطیل است (فرصت طلایی جمع‌بندی و تست).`;
    const planBlocks = studyPlan && studyPlan.days && studyPlan.days[tomorrowName];
    const suggestedReview = planBlocks && planBlocks.length ? ` | برنامه مطالعه فردا: ${planBlocks.map(b => b.subj).join("، ")}` : weak.length ? ` | اولویت مطالعه فردا: ${weak.slice(0, 2).join(" و ")}` : "";
    document.getElementById("eod-tomorrow-plan").textContent = tomorrowClasses + suggestedReview;

    document.getElementById("eod-modal").classList.remove("hidden");
}

document.getElementById("open-eod-btn").addEventListener("click", openEndOfDayReport);
document.getElementById("sidebar-eod-btn").addEventListener("click", openEndOfDayReport);
document.getElementById("close-eod-btn").addEventListener("click", () => {
    document.getElementById("eod-modal").classList.add("hidden");
});

/* --- ۴. صداهای محیطی (Web Audio API بدون نیاز به اینترنت) --- */
let audioCtx = null;
let noiseSource = null;

function stopAmbientSound() {
    if (noiseSource) {
        try { noiseSource.stop(); } catch {}
        noiseSource = null;
    }
}

function playAmbientSound(type) {
    stopAmbientSound();
    if (type === "none") return;

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === "white") {
            output[i] = white * 0.04;
        } else if (type === "rain") {
            output[i] = (lastOut + (0.04 * white)) / 1.04;
            lastOut = output[i];
            output[i] *= 0.25;
        } else {
            // صدای ملایم طبیعت / نسیم
            output[i] = (lastOut + (0.015 * white)) / 1.015;
            lastOut = output[i];
            output[i] *= 0.35;
        }
    }

    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseSource.connect(audioCtx.destination);
    noiseSource.start(0);
}

document.querySelectorAll(".sound-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".sound-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        playAmbientSound(btn.dataset.sound);
    });
});

/* --- ۵. تقویم ماهانه امتحانات --- */
document.getElementById("add-exam-btn").addEventListener("click", () => {
    const day = parseInt(document.getElementById("exam-day-input").value);
    const subject = document.getElementById("exam-subject-select").value;
    if (!day || day < 1 || day > getJalaliMonthInfo(selectedMonth).length) return;
    monthlyExams.push({ id: Date.now(), month: selectedMonth, day, subject });
    monthlyExams.sort((a, b) => a.day - b.day);
    document.getElementById("exam-day-input").value = "";
    save();
    updateAll();
});

window.removeExam = function(id) {
    monthlyExams = monthlyExams.filter(ex => ex.id !== id);
    save();
    updateAll();
};

const PERSIAN_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const jalaliFormatter = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" });
const monthInfoCache = {};

function toJalali(date) {
    const parts = jalaliFormatter.formatToParts(date);
    const get = t => Number(parts.find(p => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day") };
}

// اول ماه (به صورت Date میلادی) و طول واقعی ماه شمسی، شامل کبیسه
function getJalaliMonthInfo(name) {
    const idx = PERSIAN_MONTHS.indexOf(name);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const key = `${toJalali(today).y}-${idx}`;
    if (monthInfoCache[key]) return monthInfoCache[key];

    const cur = new Date(today);
    for (let i = 0; i < 400; i++) {
        const j = toJalali(cur);
        if (j.m === 1 && j.d === 1) break;
        cur.setDate(cur.getDate() - 1);
    }
    while (toJalali(cur).m !== idx + 1) cur.setDate(cur.getDate() + 1);
    const first = new Date(cur);
    let length = 0;
    while (toJalali(cur).m === idx + 1) { length++; cur.setDate(cur.getDate() + 1); }
    return (monthInfoCache[key] = { first, length });
}

function renderMonthCalendar() {
    const grid = document.getElementById("month-calendar-grid");
    const list = document.getElementById("exams-list");
    grid.innerHTML = "";
    list.innerHTML = "";

    const monthExams = monthlyExams.filter(ex => ex.month === selectedMonth);
    const info = getJalaliMonthInfo(selectedMonth);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const todayJ = toJalali(now);
    const isThisMonth = PERSIAN_MONTHS[todayJ.m - 1] === selectedMonth;

    const offset = (info.first.getDay() + 1) % 7; // هفته از شنبه شروع می‌شود
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "month-day-cell empty";
        grid.appendChild(empty);
    }

    for (let d = 1; d <= info.length; d++) {
        const cell = document.createElement("div");
        const dayExams = monthExams.filter(ex => ex.day === d);
        cell.className = "month-day-cell" + (dayExams.length > 0 ? " has-exam" : "") + (isThisMonth && todayJ.d === d ? " today" : "");
        cell.textContent = d;
        if (dayExams.length > 0) {
            cell.title = `امتحان ${d} ${selectedMonth}: ${dayExams.map(e => e.subject).join(" و ")}`;
            const dot = document.createElement("span");
            dot.className = "exam-dot";
            cell.appendChild(dot);
        }
        grid.appendChild(cell);
    }

    monthExams.forEach(ex => {
        const examDate = new Date(info.first);
        examDate.setDate(examDate.getDate() + ex.day - 1);
        const left = Math.round((examDate - now) / 86400000);
        const leftText = left > 0 ? `${left} روز مانده` : left === 0 ? "امروز!" : "گذشته";
        const li = document.createElement("li");
        li.innerHTML = `<span>📌 ${esc(ex.day)} ${esc(ex.month)}: ${esc(ex.subject)} <small class="exam-left">${leftText}</small></span><span><button class="del-x" onclick="editExam(${Number(ex.id)})">✏️</button><button class="del-x" onclick="removeExam(${Number(ex.id)})">✕</button></span>`;
        list.appendChild(li);
    });
}

/* --- ۶. ثبت مطالعه، نمودار و تحلیل دروس --- */
document.getElementById("study-form").addEventListener("submit", e => {
    e.preventDefault();

    const subject = document.getElementById("subject-select").value;
    const date = document.getElementById("study-date").value;
    const type = document.getElementById("study-type").value;
    const minutes = Number(document.getElementById("minutes-input").value);
    const totalTests = Number(document.getElementById("total-tests").value) || 0;
    const correctTests = Number(document.getElementById("correct-tests").value) || 0;

    if (!date) {
        alert("لطفاً تاریخ مطالعه را انتخاب کن.");
        return;
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
        alert("تاریخ واردشده معتبر نیست.");
        return;
    }

    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 720) {
        alert("مدت مطالعه باید بین ۵ تا ۷۲۰ دقیقه باشد.");
        return;
    }

    if (totalTests < 0 || correctTests < 0 || correctTests > totalTests) {
        alert("تعداد تست درست نمی‌تواند بیشتر از تعداد کل تست‌ها باشد.");
        return;
    }

    const dayIndex = (selectedDate.getDay() + 1) % 7;

    studyLogs.unshift({
        id: Date.now(),
        subject,
        date,
        day: DAYS[dayIndex],
        type,
        minutes,
        totalTests,
        correctTests,
        topic: document.getElementById("topic-input").value.trim()
    });

    document.getElementById("minutes-input").value = "";
    document.getElementById("total-tests").value = "";
    document.getElementById("correct-tests").value = "";
    document.getElementById("topic-input").value = "";

    save();
    updateAll();
});

function getWeakSubjects() {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 14);
    const stats = {};
    SUBJECTS.forEach(s => stats[s] = { mins: 0, totalT: 0, correctT: 0 });
    studyLogs.forEach(l => {
        if (!l.date || new Date(`${l.date}T00:00:00`) < since) return;
        if (!stats[l.subject]) stats[l.subject] = { mins: 0, totalT: 0, correctT: 0 };
        stats[l.subject].mins += Number(l.minutes) || 0;
        stats[l.subject].totalT += l.totalTests || 0;
        stats[l.subject].correctT += l.correctTests || 0;
    });
    const weak = [];
    for (const [subj, d] of Object.entries(stats)) {
        const net = d.totalT >= 10 ? netPercent(d.correctT, d.totalT) : null;
        if (d.mins < 45 || (net !== null && net < 40)) weak.push({ subj, net: net === null ? 100 : net, mins: d.mins });
    }
    return weak.sort((a, b) => a.net - b.net || a.mins - b.mins).map(w => w.subj);
}

function getWeakTopics() {
    const t = {};
    studyLogs.forEach(l => {
        if (!l.topic || !l.totalTests) return;
        const k = `${l.subject} ← ${l.topic}`;
        t[k] = t[k] || { tot: 0, cor: 0 };
        t[k].tot += l.totalTests;
        t[k].cor += l.correctTests || 0;
    });
    return Object.entries(t)
        .filter(([, v]) => v.tot >= 5 && netPercent(v.cor, v.tot) < 40)
        .sort((a, b) => netPercent(a[1].cor, a[1].tot) - netPercent(b[1].cor, b[1].tot))
        .map(([k]) => k);
}

function updateCardsAndRadar() {
    const weekLogs = getCurrentWeekLogs();

    const totalMins = weekLogs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
    const descMins = weekLogs
        .filter(log => log.type === "descriptive")
        .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
    const testMins = weekLogs
        .filter(log => log.type === "test")
        .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);

    const totalTests = weekLogs.reduce((sum, log) => sum + (Number(log.totalTests) || 0), 0);
    const correctTests = weekLogs.reduce((sum, log) => sum + (Number(log.correctTests) || 0), 0);

    document.getElementById("stat-hours").textContent = (totalMins / 60).toFixed(1) + " ساعت";

    const currentWeekStart = getWeekStart();
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const previousMins = studyLogs
        .filter(log => {
            if (!log.date) return false;
            const date = new Date(`${log.date}T00:00:00`);
            return !Number.isNaN(date.getTime()) &&
                date >= previousWeekStart &&
                date < currentWeekStart;
        })
        .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);

    const trendEl = document.getElementById("trend-hours");
    if (previousMins > 0) {
        const diff = Math.round(((totalMins - previousMins) / previousMins) * 100);
        trendEl.textContent = `${diff >= 0 ? "+" : ""}${diff}% نسبت به هفته قبل`;
        trendEl.className = "trend-badge " + (diff >= 0 ? "up" : "down");
    } else {
        trendEl.textContent = "هفته جاری";
        trendEl.className = "trend-badge neutral";
    }

    const accuracy = totalTests > 0 ? Math.round(netPercent(correctTests, totalTests)) : 0;
    document.getElementById("stat-accuracy").textContent = accuracy + "%";
    document.getElementById("trend-tests").textContent = `${correctTests} از ${totalTests} تست`;

    const descPct = totalMins > 0 ? Math.round((descMins / totalMins) * 100) : 0;
    const testPct = totalMins > 0 ? 100 - descPct : 0;
    document.getElementById("stat-balance").textContent = `${descPct}% / ${testPct}%`;

    const speed = totalTests > 0 ? (testMins / totalTests).toFixed(1) : "0";
    document.getElementById("stat-speed").textContent = `${speed} دقیقه`;

    const monthExams = monthlyExams.filter(ex => ex.month === selectedMonth);
    const radarText = document.getElementById("radar-text");
    radarText.textContent = monthExams.length > 0
        ? `امتحانات ${selectedMonth}: ${monthExams.map(ex => `${ex.subject} (${ex.day}ام)`).join("، ")}`
        : "امتحانات این ماه را در تقویم سمت چپ وارد کنید تا برنامه بر اساس آن‌ها تنظیم شود.";
    const weakTopics = getWeakTopics();
    if (weakTopics.length) radarText.textContent += ` | 🎯 مباحث ضعیف: ${weakTopics.slice(0, 3).join("، ")}`;
    const cd = getCountdownDays();
    if (cd !== null && cd >= 0) radarText.textContent += ` | ⏳ ${target.title || "هدف"}: ${cd} روز مانده`;
    const dueMistakes = mistakes.filter(mistakeIsDue).length;
    if (dueMistakes > 0) radarText.textContent += ` | ❌ ${dueMistakes} خطا برای مرور امروز`;
}

function renderChart() {
    const weekLogs = getCurrentWeekLogs();

    const descData = DAYS.map(day =>
        +(weekLogs
            .filter(log => log.day === day && log.type === "descriptive")
            .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0) / 60).toFixed(2)
    );

    const testData = DAYS.map(day =>
        +(weekLogs
            .filter(log => log.day === day && log.type === "test")
            .reduce((sum, log) => sum + (Number(log.minutes) || 0), 0) / 60).toFixed(2)
    );

    const canvas = document.getElementById("weeklyWaveChart");
    if (!canvas) return;
    if (typeof Chart === "undefined") { drawBarsFallback(canvas, DAYS, descData.map((v, i) => +(v + testData[i]).toFixed(1))); return; }

    const ctx = canvas.getContext("2d");
    if (waveChart) waveChart.destroy();

    waveChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: DAYS,
            datasets: [
                {
                    label: "تشریحی",
                    data: descData,
                    borderColor: "#53908d",
                    backgroundColor: "rgba(83,144,141,0.14)",
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: "تستی",
                    data: testData,
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245,158,11,0.12)",
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderHistory() {
    const list = document.getElementById("history-list");
    list.innerHTML = "";
    studyLogs.slice(0, 6).forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `<span><strong>${esc(item.subject)}</strong> (${esc(item.day)}) - ${item.minutes} دقیقه</span><span><button class="del-x" onclick="editLog(${Number(item.id)})">✏️</button><button class="del-x" onclick="removeLog(${item.id})">✕</button></span>`;
        list.appendChild(li);
    });
}

window.removeLog = function(id) {
    studyLogs = studyLogs.filter(l => l.id !== id);
    save();
    updateAll();
};

/* --- توابع کمکی: درصد خالص، نام، بکاپ، ویرایش --- */
function netPercent(correct, total) {
    return total > 0 ? ((correct - (total - correct) / 3) / total) * 100 : 0; // نمره منفی کنکور
}

function drawBarsFallback(canvas, labels, data) {
    const w = canvas.width = canvas.parentElement.clientWidth || 400;
    const h = canvas.height = canvas.parentElement.clientHeight || 240;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(document.body).color;
    ctx.font = "12px Vazirmatn, sans-serif";
    ctx.textAlign = "center";
    const max = Math.max(1, ...data), pad = 28, bw = (w - pad * 2) / labels.length;
    labels.forEach((l, i) => {
        const bh = (h - pad * 2) * (data[i] / max), x = pad + i * bw + bw * 0.15;
        ctx.fillStyle = "#53908d";
        ctx.fillRect(x, h - pad - bh, bw * 0.7, bh);
        ctx.fillStyle = color;
        ctx.fillText(l, x + bw * 0.35, h - 8);
        ctx.fillText(String(data[i]), x + bw * 0.35, h - pad - bh - 4);
    });
}

function applyUserName() {
    document.getElementById("user-name").textContent = userName;
    document.getElementById("profile-name").textContent = userName;
    document.getElementById("user-avatar").textContent = userName.charAt(0);
}
document.getElementById("user-name").addEventListener("click", () => {
    const v = prompt("اسمت چیه؟", userName);
    if (v && v.trim()) { userName = v.trim().slice(0, 20); save(); applyUserName(); }
});

function checkBackup() {
    const last = Number(localStorage.getItem("lastBackup")) || 0;
    const hasData = studyLogs.length || notes.length || mistakes.length;
    document.getElementById("backup-banner").classList.toggle("hidden", !(hasData && Date.now() - last > 7 * 86400000));
}
document.getElementById("backup-now-btn").addEventListener("click", () => document.getElementById("export-json").click());

function rolloverTodos() {
    const today = getLocalDateKey();
    let changed = false;
    todos = todos.filter(t => {
        if (!t.date) { t.date = today; changed = true; }
        if (t.date < today && t.done) { changed = true; return false; }
        return true;
    });
    todos.forEach(t => { if (t.date < today) { t.date = today; t.carried = true; changed = true; } });
    if (changed) save();
}

window.editTodo = function(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    const v = prompt("ویرایش کار:", t.text);
    if (v && v.trim()) { t.text = v.trim(); save(); renderTodos(); }
};
window.editLog = function(id) {
    const l = studyLogs.find(x => x.id === id);
    if (!l) return;
    const v = prompt("مدت مطالعه (دقیقه):", l.minutes);
    if (v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 5 || n > 720) { alert("مدت باید بین ۵ تا ۷۲۰ دقیقه باشد."); return; }
    l.minutes = n; save(); updateAll();
};
window.editNote = function(id) {
    const n = notes.find(x => x.id === id);
    if (!n) return;
    const title = prompt("عنوان:", n.title);
    if (title === null) return;
    const body = prompt("متن یادداشت:", n.body);
    if (body === null) return;
    n.title = title.trim() || n.title;
    n.body = body.trim() || n.body;
    save(); renderDigitalNotes();
};
window.editExam = function(id) {
    const ex = monthlyExams.find(x => x.id === id);
    if (!ex) return;
    const v = Number(prompt("روز امتحان:", ex.day));
    if (!v || v < 1 || v > getJalaliMonthInfo(ex.month).length) return;
    ex.day = v;
    monthlyExams.sort((a, b) => a.day - b.day);
    save(); updateAll();
};

/* --- هدف هفتگی هر درس، شمارش معکوس، روند ۸ هفته --- */
document.getElementById("add-goal-btn").addEventListener("click", () => {
    const h = Number(document.getElementById("goal-hours").value);
    if (!(h > 0 && h <= 40)) return;
    weeklyGoals[document.getElementById("goal-subject").value] = h;
    document.getElementById("goal-hours").value = "";
    save(); renderGoals();
});

function renderGoals() {
    const grid = document.getElementById("goals-grid");
    grid.innerHTML = "";
    const mins = {};
    getCurrentWeekLogs().forEach(l => { mins[l.subject] = (mins[l.subject] || 0) + (Number(l.minutes) || 0); });
    const entries = Object.entries(weeklyGoals);
    if (!entries.length) {
        grid.innerHTML = '<p class="mistake-empty">هنوز هدفی نگذاشته‌ای. یک درس و تعداد ساعت هفتگی انتخاب کن.</p>';
        return;
    }
    entries.forEach(([s, h]) => {
        const done = (mins[s] || 0) / 60;
        const pct = Math.min(100, Math.round((done / h) * 100));
        const row = document.createElement("div");
        row.className = "goal-row";
        row.innerHTML = `<span class="goal-name">${esc(s)}</span><div class="goal-bar"><div class="goal-fill${pct >= 100 ? " full" : ""}" style="width:${pct}%"></div></div><span class="goal-num">${done.toFixed(1)} / ${h} ساعت</span><button class="del-x">✕</button>`;
        row.querySelector("button").addEventListener("click", () => { delete weeklyGoals[s]; save(); renderGoals(); });
        grid.appendChild(row);
    });
}

function getCountdownDays() {
    if (!target.date) return null;
    const t = new Date(`${target.date}T00:00:00`);
    if (Number.isNaN(t.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((t - now) / 86400000);
}

function renderCountdown() {
    const el = document.getElementById("countdown-text");
    const d = getCountdownDays();
    if (d === null) { el.textContent = "تاریخ هدف (مثلاً کنکور) را وارد کن."; return; }
    const fa = new Date(`${target.date}T00:00:00`).toLocaleDateString("fa-IR", { day: "numeric", month: "long", year: "numeric" });
    el.textContent = d > 0 ? `${d} روز تا ${target.title || "هدف"} (${fa})` : d === 0 ? `امروز ${target.title || "روز هدف"} است!` : `${target.title || "هدف"} (${fa}) گذشته است.`;
}
document.getElementById("target-title").value = target.title || "";
document.getElementById("target-date").value = target.date || "";
["target-title", "target-date"].forEach(id => document.getElementById(id).addEventListener("change", () => {
    target = { title: document.getElementById("target-title").value.trim(), date: document.getElementById("target-date").value };
    save(); renderCountdown(); updateCardsAndRadar();
}));

function renderLongTerm() {
    const canvas = document.getElementById("longTermChart");
    if (!canvas) return;
    const start = getWeekStart(), labels = [], data = [];
    for (let i = 7; i >= 0; i--) {
        const ws = new Date(start);
        ws.setDate(ws.getDate() - 7 * i);
        const we = new Date(ws);
        we.setDate(we.getDate() + 7);
        const mins = studyLogs.filter(l => {
            if (!l.date) return false;
            const d = new Date(`${l.date}T00:00:00`);
            return d >= ws && d < we;
        }).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
        labels.push(ws.toLocaleDateString("fa-IR", { month: "short", day: "numeric" }));
        data.push(+(mins / 60).toFixed(1));
    }
    if (typeof Chart === "undefined") { drawBarsFallback(canvas, labels, data); return; }
    if (longChart) longChart.destroy();
    longChart = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: { labels, datasets: [{ label: "ساعت", data, backgroundColor: "#53908d", borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
    });
}

/* --- برنامه‌ریز هوشمند: وزن درس‌ها، ضعف، امتحان، ذخیره و ویرایش --- */
// ضریب تقریبی درس‌ها در کنکور ریاضی؛ هر عددی را خودت می‌توانی عوض کنی
const SUBJECT_WEIGHT = {
    "حسابان": 3, "حسابان2": 4, "ریاضی": 3, "گسسته": 3, "هندسه1": 2, "هندسه2": 2, "هندسه3": 3, "آمار": 2,
    "فیزیک1": 2, "فیزیک2": 3, "فیزیک 3": 4, "شیمی1": 2, "شیمی2": 2, "شیمی3": 3,
    "دینی": 2, "فارسی": 2, "زبان": 2, "عربی": 1, "هویت": 1, "سلامت": 1
};

function generatePlan() {
    const goal = parseFloat(document.getElementById("daily-goal").value) || 4;
    const mode = document.getElementById("focus-mode").value;
    let pool = SUBJECTS;
    if (mode === "heavy-math") pool = ["حسابان2", "گسسته", "هندسه3", "حسابان", "فیزیک 3", "شیمی3", "دینی", "زبان"];
    if (mode === "heavy-science") pool = ["فیزیک 3", "شیمی3", "فیزیک2", "شیمی2", "حسابان2", "فیزیک1", "شیمی1", "عربی"];

    const weak = new Set(getWeakSubjects().slice(0, 6));
    const exams = new Set(monthlyExams.filter(ex => ex.month === selectedMonth).map(ex => ex.subject));
    const score = s => mode === "balanced" ? 1 : (SUBJECT_WEIGHT[s] || 1) * (1 + (weak.has(s) ? 0.5 : 0) + (exams.has(s) ? 1.5 : 0));
    const credits = {};
    pool.forEach(s => { credits[s] = 0; });
    const total = pool.reduce((a, s) => a + score(s), 0);

    const days = {};
    DAYS.forEach(day => {
        let hours = goal * (day === "جمعه" ? 1.5 : day === "پنج‌شنبه" ? 1.25 : 1); // آخر هفته وقت آزاد بیشتری داری
        hours = Math.min(14, hours);
        const n = hours >= 6 ? 4 : 3;
        const per = Math.round((hours / n) * 4) / 4;
        const chosen = [];
        for (let i = 0; i < n && chosen.length < pool.length; i++) {
            pool.forEach(s => { credits[s] += score(s); });
            const pick = pool.filter(s => !chosen.includes(s)).sort((a, b) => credits[b] - credits[a])[0];
            credits[pick] -= total;
            chosen.push(pick);
        }
        days[day] = chosen.map(s => ({ subj: s, hours: per, done: false }));
    });
    studyPlan = { generatedAt: getLocalDateKey(), days };
    save();
    renderPlan();
}
document.getElementById("generate-plan").addEventListener("click", generatePlan);

function renderPlan() {
    const box = document.getElementById("plan-output");
    box.innerHTML = "";
    if (!studyPlan || !studyPlan.days) {
        box.innerHTML = '<p class="mistake-empty">برای ساخت برنامه روی «تولید برنامه» بزن. بعد می‌توانی درس هر بلوک را عوض کنی و تیک بزنی.</p>';
        return;
    }
    const todayName = DAYS[(new Date().getDay() + 1) % 7];
    DAYS.forEach(day => {
        const blocks = studyPlan.days[day] || [];
        const row = document.createElement("div");
        row.className = "lesson-row" + (day === todayName ? " today-plan" : "");
        const label = document.createElement("div");
        label.innerHTML = `<strong>${day}</strong>`;
        const wrap = document.createElement("div");
        wrap.className = "plan-blocks";
        blocks.forEach(b => {
            const item = document.createElement("label");
            item.className = "plan-block" + (b.done ? " done" : "");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!b.done;
            cb.style.width = "auto";
            cb.addEventListener("change", () => { b.done = cb.checked; item.classList.toggle("done", b.done); save(); });
            const sel = document.createElement("select");
            SUBJECTS.forEach(s => sel.add(new Option(s, s)));
            sel.value = b.subj;
            sel.addEventListener("change", () => { b.subj = sel.value; save(); });
            const hrs = document.createElement("span");
            hrs.textContent = `${+b.hours.toFixed(2)} ساعت`;
            item.append(cb, sel, hrs);
            wrap.appendChild(item);
        });
        const badge = document.createElement("span");
        badge.className = "lesson-badge";
        badge.textContent = `${+blocks.reduce((s, b) => s + b.hours, 0).toFixed(2)} ساعت`;
        row.append(label, wrap, badge);
        box.appendChild(row);
    });
}

/* --- ۷. تایمر و بکاپ --- */
const BREAK_SECONDS = 5 * 60;
let focusMinutes = Number(localStorage.getItem("focusMinutes")) || 25;
let timerMode = "focus"; // focus | break
let seconds = focusMinutes * 60;
let interval = null;
let timerEndAt = null;   // زمان پایان واقعی؛ تایمر با ساعت سیستم حساب می‌شود
let timerSubject = null;

function modeTotal() { return timerMode === "break" ? BREAK_SECONDS : focusMinutes * 60; }

function saveTimerState() {
    localStorage.setItem("timerState", JSON.stringify({ endAt: timerEndAt, remaining: seconds, subject: timerSubject, mode: timerMode }));
}

function drawTimer() {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    document.getElementById("timer-display").textContent = `${m}:${s}`;
    document.getElementById("zen-timer-display").textContent = `${m}:${s}`;
}

function beep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.15;
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch {}
}

function notify(title, body) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}

function logSession(subj, minutes, endedAt) {
    studyLogs.unshift({
        id: Date.now(), subject: subj, date: getLocalDateKey(endedAt), day: DAYS[(endedAt.getDay() + 1) % 7],
        type: "descriptive", minutes, totalTests: 0, correctTests: 0
    });
    save();
    updateAll();
}

function tick() {
    if (!timerEndAt) return;
    const remain = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    if (remain !== seconds) { seconds = remain; drawTimer(); }
    if (remain <= 0) finishTimer();
}

function startTimer() {
    if (interval) return;
    if (timerMode === "focus" && seconds === modeTotal()) timerSubject = document.getElementById("timer-subject").value;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    timerEndAt = Date.now() + seconds * 1000;
    interval = setInterval(tick, 500);
    saveTimerState();
}

function pauseTimer() {
    if (!interval) return;
    tick();
    if (!interval) return;
    clearInterval(interval);
    interval = null;
    timerEndAt = null;
    saveTimerState();
}

function toggleTimer() { if (interval) pauseTimer(); else startTimer(); }

function resetToFocus() {
    clearInterval(interval);
    interval = null;
    timerEndAt = null;
    timerMode = "focus";
    timerSubject = null;
    seconds = focusMinutes * 60;
    saveTimerState();
    drawTimer();
}

function finishTimer() {
    const endedAt = new Date(timerEndAt || Date.now());
    clearInterval(interval);
    interval = null;
    timerEndAt = null;
    beep();
    if (timerMode === "focus") {
        const subj = timerSubject || document.getElementById("timer-subject").value;
        logSession(subj, focusMinutes, endedAt);
        notify("پایان جلسه مطالعه", `${focusMinutes} دقیقه مطالعه برای ${subj} ثبت شد. ۵ دقیقه استراحت!`);
        timerMode = "break";
        timerSubject = null;
        seconds = BREAK_SECONDS;
        document.getElementById("zen-subject-title").textContent = "☕ استراحت";
        saveTimerState();
        drawTimer();
        alert(`خسته نباشید! ${focusMinutes} دقیقه مطالعه برای ${subj} ثبت شد. ۵ دقیقه استراحت شروع می‌شود.`);
        startTimer();
    } else {
        stopAmbientSound();
        notify("استراحت تمام شد", "آماده‌ی جلسه‌ی بعدی؟");
        document.getElementById("zen-overlay").classList.add("hidden");
        resetToFocus();
    }
}

// ثبت مطالعه‌ی نیمه‌کاره (حداقل ۵ دقیقه)
function finishEarly() {
    if (timerMode === "break") { resetToFocus(); return; }
    if (interval) tick();
    const elapsed = Math.floor((focusMinutes * 60 - seconds) / 60);
    if (elapsed < 5) { alert("برای ثبت، حداقل ۵ دقیقه باید مطالعه کرده باشی."); return; }
    logSession(timerSubject || document.getElementById("timer-subject").value, elapsed, new Date());
    stopAmbientSound();
    document.getElementById("zen-overlay").classList.add("hidden");
    resetToFocus();
}

function restoreTimer() {
    document.getElementById("timer-length").value = String(focusMinutes);
    try {
        const st = JSON.parse(localStorage.getItem("timerState") || "null");
        if (!st) { drawTimer(); return; }
        timerMode = st.mode === "break" ? "break" : "focus";
        if (st.subject) { timerSubject = st.subject; document.getElementById("timer-subject").value = st.subject; }
        if (st.endAt) {
            timerEndAt = st.endAt;
            seconds = Math.max(0, Math.ceil((st.endAt - Date.now()) / 1000));
            drawTimer();
            if (seconds <= 0) finishTimer(); else interval = setInterval(tick, 500);
        } else if (Number.isFinite(st.remaining) && st.remaining > 0 && st.remaining <= modeTotal()) {
            seconds = st.remaining;
            drawTimer();
        }
    } catch {}
}

document.getElementById("timer-length").addEventListener("change", e => {
    const wasFresh = timerMode === "focus" && !interval && seconds === focusMinutes * 60;
    focusMinutes = Number(e.target.value) || 25;
    localStorage.setItem("focusMinutes", String(focusMinutes));
    if (wasFresh) { seconds = focusMinutes * 60; saveTimerState(); drawTimer(); }
});
document.addEventListener("visibilitychange", () => { if (interval) tick(); });
document.getElementById("start-timer").addEventListener("click", startTimer);
document.getElementById("pause-timer").addEventListener("click", pauseTimer);
document.getElementById("finish-early-btn").addEventListener("click", finishEarly);
document.getElementById("zen-pause-btn").addEventListener("click", toggleTimer);

document.getElementById("enter-zen-btn").addEventListener("click", () => {
    document.getElementById("zen-subject-title").textContent = timerMode === "break" ? "☕ استراحت" : document.getElementById("timer-subject").value;
    document.getElementById("zen-overlay").classList.remove("hidden");
    startTimer();
});

document.getElementById("exit-zen-btn").addEventListener("click", () => {
    stopAmbientSound();
    document.getElementById("zen-overlay").classList.add("hidden");
});

document.getElementById("export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ studyLogs, prevWeekMins, notes, monthlyExams, todos, schoolSchedule, dailyGoal, selectedMonth, mistakes, weeklyGoals, target, studyPlan, userName }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "study-backup.json";
    a.click();
    localStorage.setItem("lastBackup", String(Date.now()));
    checkBackup();
});

document.getElementById("import-json").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            studyLogs = Array.isArray(data.studyLogs) ? data.studyLogs : [];
            prevWeekMins = Number(data.prevWeekMins) || 0;
            notes = Array.isArray(data.notes) ? data.notes : [];
            monthlyExams = Array.isArray(data.monthlyExams) ? data.monthlyExams : [];
            todos = Array.isArray(data.todos) ? data.todos : [];
            mistakes = Array.isArray(data.mistakes) ? data.mistakes : [];
            weeklyGoals = data.weeklyGoals && typeof data.weeklyGoals === "object" ? data.weeklyGoals : {};
            if (data.target && typeof data.target === "object") target = data.target;
            studyPlan = data.studyPlan && data.studyPlan.days ? data.studyPlan : null;
            if (typeof data.userName === "string" && data.userName.trim()) userName = data.userName.trim().slice(0, 20);
            applyUserName();
            document.getElementById("target-title").value = target.title || "";
            document.getElementById("target-date").value = target.date || "";
            rolloverTodos();
            if (data.schoolSchedule && typeof data.schoolSchedule === "object") {
                schoolSchedule = data.schoolSchedule;
            }
            if (Number.isFinite(Number(data.dailyGoal))) {
                dailyGoal = Math.min(14, Math.max(1, Number(data.dailyGoal)));
            }
            if (typeof data.selectedMonth === "string") {
                selectedMonth = data.selectedMonth;
                document.getElementById("month-select").value = selectedMonth;
            }
            document.getElementById("daily-goal").value = dailyGoal;
            save();
            updateAll();
            alert("اطلاعات بازیابی شد!");
        } catch {
            alert("فایل نامعتبر است.");
        }
    };
    reader.readAsText(file);
});

document.getElementById("new-week-btn").addEventListener("click", () => {
    alert("آمار هفته‌ها به‌صورت خودکار از شنبه تا جمعه محاسبه می‌شود. تمام سوابق قبلی حفظ شده‌اند.");
});

const savedTheme = localStorage.getItem("studyTheme");
if (savedTheme === "dark") {
    document.body.classList.add("dark");
} else {
    document.body.classList.remove("dark");
}

document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const theme = document.body.classList.contains("dark") ? "dark" : "light";
    localStorage.setItem("studyTheme", theme);
});

window.scrollToSection = function(id) {
    document.getElementById(id).scrollIntoView({ behavior: "smooth" });
};

init();
restoreTimer();
applyUserName();
checkBackup();