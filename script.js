/* --- اتصال امن به دیتابیس ابری Supabase --- */
const SUPABASE_URL = "https://sshotppczbgjogoueebt.supabase.co";
const SUPABASE_KEY = "sb_publishable_woyVPRZ6JbCC8DtiVlpPog_MgMOb-nS";
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let currentUser = null;
let cloudReady = false; // تا داده ابری با موفقیت دریافت نشده، ذخیره‌سازی ممنوع است
let syncTimeout = null;

/* --- ورود اختصاصی اعضا --- */
document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("auth-error");
    const btn = document.getElementById("auth-submit-btn");
    errEl.classList.add("hidden");

    if (!sb) {
        errEl.textContent = "کتابخانه ارتباط با سرور لود نشد. اتصال اینترنت را بررسی و صفحه را رفرش کنید.";
        errEl.classList.remove("hidden");
        return;
    }

    const rawUser = document.getElementById("auth-username").value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const password = document.getElementById("auth-password").value;

    if (rawUser.length < 2) {
        errEl.textContent = "لطفاً نام کاربری انگلیسی خود را وارد کنید.";
        errEl.classList.remove("hidden");
        return;
    }

    const virtualEmail = `${rawUser}@studyapp.local`;
    btn.disabled = true;
    btn.textContent = "در حال ورود...";

    try {
        const { data, error } = await sb.auth.signInWithPassword({
            email: virtualEmail,
            password
        });
        if (error) throw error;
        if (data && data.user) {
            await onUserAuthenticated(data.user);
            document.getElementById("auth-password").value = "";
        }
    } catch (err) {
        errEl.textContent = (err.code === "invalid_credentials" || err.message.includes("Invalid login"))
            ? "نام کاربری یا رمز عبور اشتباه است."
            : "خطا در ورود: " + err.message;
        errEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
        btn.textContent = "ورود به داشبورد";
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    clearInterval(interval);
    interval = null;
    timerEndAt = null;
    timerMode = "focus";
    seconds = focusMinutes * 60;
    drawTimer();
    stopAmbientSound();
    document.getElementById("zen-overlay").classList.add("hidden");
    document.getElementById("eod-modal").classList.add("hidden");
    await flushSave();
    if (sb) await sb.auth.signOut();
    currentUser = null;
    cloudReady = false;
    document.getElementById("auth-form").reset();
    document.getElementById("main-app").classList.add("hidden");
    document.getElementById("auth-screen").classList.remove("hidden");
});

const SUBJECTS = [
    "حسابان", "حسابان2", "ریاضی", "گسسته",
    "هندسه1", "هندسه2", "هندسه3", "آمار",
    "فیزیک1", "فیزیک2", "فیزیک 3",
    "شیمی1", "شیمی2", "شیمی3",
    "دینی", "فارسی", "زبان", "عربی", "هویت", "سلامت"
];

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];
const SCHOOL_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"];

const DEFAULT_SCHOOL = {
    "شنبه": ["حسابان2", "فیزیک 3", "دینی", "زبان"],
    "یکشنبه": ["گسسته", "شیمی3", "فارسی", "هندسه3"],
    "دوشنبه": ["فیزیک 3", "حسابان2", "عربی", "هویت"],
    "سه‌شنبه": ["شیمی3", "هندسه3", "سلامت", "فارسی"],
    "چهارشنبه": ["گسسته", "حسابان2", "فیزیک 3", "دینی"]
};

let studyLogs = [];
let mockTests = [];
let notes = [];
let monthlyExams = [];
let selectedMonth = "آبان";
let todos = [];
let schoolSchedule = JSON.parse(JSON.stringify(DEFAULT_SCHOOL));
let dailyGoal = 4;
let mistakes = [];
let weeklyGoals = {};
let target = { title: "کنکور", date: "" };
let studyPlan = null;
let userName = "کاربر";

let waveChart = null;
let longChart = null;
let mockChart = null;
let selectsInitialized = false;

async function onUserAuthenticated(user) {
    currentUser = user;
    const uname = user.user_metadata?.username || user.email.split("@")[0];
    document.getElementById("profile-username").textContent = `@${uname}`;

    await loadFromCloud(user);

    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");

    if (!selectsInitialized) {
        initSelectsAndEvents();
        selectsInitialized = true;
    }

    document.getElementById("month-select").value = selectedMonth;
    document.getElementById("daily-goal").value = dailyGoal;
    document.getElementById("target-title").value = target.title || "";
    document.getElementById("target-date").value = target.date || "";
    syncJalaliPickers();

    rolloverTodos();
    applyUserName();
    updateAll();
}

function resetUserState(name) {
    studyLogs = [];
    notes = [];
    monthlyExams = [];
    selectedMonth = "آبان";
    todos = [];
    schoolSchedule = JSON.parse(JSON.stringify(DEFAULT_SCHOOL));
    dailyGoal = 4;
    mistakes = [];
    weeklyGoals = {};
    target = { title: "کنکور", date: "" };
    studyPlan = null;
    mockTests = [];
    userName = name || "کاربر";
}

const LOCAL_PREFIX = "studyData:";
let cloudUpdatedAt = null;

function snapshot() {
    return { studyLogs, mockTests, notes, monthlyExams, selectedMonth, todos, schoolSchedule, dailyGoal, mistakes, weeklyGoals, target, studyPlan, userName };
}

function applyPayload(p, fallbackName) {
    studyLogs = Array.isArray(p.studyLogs) ? p.studyLogs : [];
    mockTests = Array.isArray(p.mockTests) ? p.mockTests : [];
    notes = Array.isArray(p.notes) ? p.notes : [];
    monthlyExams = Array.isArray(p.monthlyExams) ? p.monthlyExams : [];
    monthlyExams.forEach(e => { if (!e.year) e.year = toJalali(new Date()).y; });
    selectedMonth = typeof p.selectedMonth === "string" ? p.selectedMonth : "آبان";
    todos = Array.isArray(p.todos) ? p.todos : [];
    schoolSchedule = p.schoolSchedule && typeof p.schoolSchedule === "object" ? p.schoolSchedule : JSON.parse(JSON.stringify(DEFAULT_SCHOOL));
    dailyGoal = Number.isFinite(Number(p.dailyGoal)) ? Number(p.dailyGoal) : 4;
    mistakes = Array.isArray(p.mistakes) ? p.mistakes : [];
    weeklyGoals = p.weeklyGoals && typeof p.weeklyGoals === "object" ? p.weeklyGoals : {};
    target = p.target && typeof p.target === "object" ? p.target : { title: "کنکور", date: "" };
    studyPlan = p.studyPlan && p.studyPlan.days ? p.studyPlan : null;
    userName = typeof p.userName === "string" && p.userName.trim() ? p.userName : (fallbackName || "کاربر");
}

function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + currentUser.id) || "null"); } catch (e) { return null; }
}
function writeLocal(dirty) {
    try { localStorage.setItem(LOCAL_PREFIX + currentUser.id, JSON.stringify({ at: Date.now(), dirty, payload: snapshot() })); } catch (e) {}
}

function setSyncBadge(text, title = "") {
    const el = document.getElementById("sync-status");
    if (el) { el.textContent = text; el.title = title; }
}

async function loadFromCloud(user) {
    setSyncBadge("⏳ در حال دریافت...");
    const fallbackName = user.user_metadata?.full_name || user.email.split("@")[0];
    const local = readLocal();
    let res;
    try {
        res = await sb.from("user_data").select("payload, updated_at").eq("user_id", user.id).maybeSingle();
    } catch (e) { res = { error: e }; }
    const { data, error } = res;
    if (error) {
        console.error("Supabase load error:", error);
        const emsg = error.message || String(error), ecode = `${emsg} ${error.code || ""}`;
        const hint = /does not exist|schema cache|42P01|PGRST205/i.test(ecode) ? " ← فایل supabase-setup.sql را در SQL Editor اجرا کن."
            : /permission denied for table/i.test(ecode) ? " ← بخش GRANT فایل supabase-setup.sql را اجرا کن."
            : /policy|row-level/i.test(ecode) ? " ← بخش policy فایل supabase-setup.sql را اجرا کن." : "";
        toast("خطای دیتابیس: " + emsg + hint, { ms: 14000 });
        cloudReady = false;
        if (local && local.payload) applyPayload(local.payload, fallbackName); else resetUserState(fallbackName);
        setSyncBadge("📴 آفلاین (کلیک: تلاش دوباره)", error.message || String(error));
        return;
    }
    cloudUpdatedAt = data ? data.updated_at : null;
    if (local && local.dirty && local.payload &&
        confirm("روی این دستگاه تغییراتی هست که در ابر ذخیره نشده.\nOK = همین دستگاه نگه داشته شود\nCancel = نسخه‌ی ابر نگه داشته شود")) {
        applyPayload(local.payload, fallbackName);
        cloudReady = true;
        await pushToCloud();
        return;
    }
    if (data && data.payload) {
        applyPayload(data.payload, fallbackName);
        cloudReady = true;
        writeLocal(false);
        setSyncBadge("☁️ همگام با ابر");
    } else {
        resetUserState(fallbackName);
        cloudReady = true;
        await pushToCloud();
    }
}

async function pushToCloud() {
    if (!currentUser || !sb) return;
    if (!cloudReady) { writeLocal(true); return; }
    setSyncBadge("⏳ در حال ذخیره...");
    writeLocal(true);
    try {
        const head = await sb.from("user_data").select("updated_at").eq("user_id", currentUser.id).maybeSingle();
        if (head.data && cloudUpdatedAt && Date.parse(head.data.updated_at) > Date.parse(cloudUpdatedAt)) {
            cloudReady = false;
            setSyncBadge("⚠️ تغییر از دستگاه دیگر (کلیک)");
            toast("داده‌ی ابری از دستگاه دیگری تغییر کرده؛ روی نشان همگام‌سازی کلیک کن.");
            return;
        }
        const now = new Date().toISOString();
        const { error } = await sb.from("user_data").upsert({ user_id: currentUser.id, payload: snapshot(), updated_at: now });
        if (error) throw error;
        cloudUpdatedAt = now;
        writeLocal(false);
        setSyncBadge("☁️ ذخیره شد");
    } catch (e) {
        console.error("Supabase save error:", e);
        setSyncBadge("⚠️ ذخیره در ابر نشد", e.message || String(e));
    }
}

function save() {
    if (!currentUser) return;
    writeLocal(true);
    if (!cloudReady) return;
    clearTimeout(syncTimeout);
    setSyncBadge("⏳ در حال ذخیره...");
    syncTimeout = setTimeout(() => { syncTimeout = null; pushToCloud(); }, 600);
}

/* --- ذخیره فوری هنگام بستن تب / خروج --- */
async function flushSave() {
    if (!syncTimeout) return;
    clearTimeout(syncTimeout); syncTimeout = null;
    await pushToCloud();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
window.addEventListener("pagehide", flushSave);

function fmtNoteDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? new Date(`${v}T00:00:00`).toLocaleDateString("fa-IR") : (v || "");
}

/* --- توابع کمکی تاریخ و امنیت --- */
function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

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
        if (!log.date) return false;
        const date = new Date(`${log.date}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date >= start && date < end;
    });
}

function initSelectsAndEvents() {
    ["subject-select", "timer-subject", "note-subject", "exam-subject-select", "school-subject-select", "mistake-subject", "goal-subject"].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = "";
        SUBJECTS.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            select.appendChild(opt);
        });
    });

    const reasonSel = document.getElementById("mistake-reason");
    const filterSel = document.getElementById("mistake-filter");
    ["مفهومی (بلد نبودم)", "محاسباتی", "عجله / بی‌دقتی", "سؤال را اشتباه خواندم", "فرمول یادم نبود", "زمان کم آوردم"].forEach(r => {
        reasonSel.add(new Option(r, r));
        filterSel.add(new Option(r, r));
    });

    const monthSelect = document.getElementById("month-select");
    monthSelect.addEventListener("change", () => {
        selectedMonth = monthSelect.value;
        save();
        renderMonthCalendar();
    });

    const dateInput = document.getElementById("study-date");
    dateInput.value = getLocalDateKey();
    dateInput.max = getLocalDateKey();
    const syncStudyDay = () => {
        if (!dateInput.value) return;
        const selectedDate = new Date(`${dateInput.value}T00:00:00`);
        if (Number.isNaN(selectedDate.getTime())) return;
        document.getElementById("study-date-fa").textContent = "📅 " + selectedDate.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    };
    dateInput.addEventListener("change", syncStudyDay);
    syncStudyDay();

    const goalInput = document.getElementById("daily-goal");
    goalInput.addEventListener("change", () => {
        const value = Number(goalInput.value);
        if (!Number.isFinite(value)) { goalInput.value = dailyGoal; return; }
        dailyGoal = Math.min(14, Math.max(1, value));
        goalInput.value = dailyGoal;
        save();
    });

    document.getElementById("mock-date").value = getLocalDateKey();
    ["study-date", "target-date", "mock-date"].forEach(initJalaliPicker);
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
    renderMocks();
    renderHeatmap();
    renderWeekInsights();
}

/* --- برنامه هفتگی مدرسه --- */
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
        tr.innerHTML = `<td><strong>${day}</strong></td><td><span class="school-pill">${esc(slots[0])}</span></td><td><span class="school-pill">${esc(slots[1])}</span></td><td><span class="school-pill">${esc(slots[2])}</span></td><td><span class="school-pill">${esc(slots[3])}</span></td>`;
        tbody.appendChild(tr);
    });
}

/* --- دفترچه یادداشت دیجیتال --- */
document.getElementById("add-note").addEventListener("click", () => {
    const subj = document.getElementById("note-subject").value;
    const title = document.getElementById("note-title").value.trim() || "یادداشت درسی";
    const body = document.getElementById("note-body").value.trim();
    if (!body) return;
    notes.unshift({ id: Date.now(), subj, title, body, date: getLocalDateKey() });
    document.getElementById("note-title").value = "";
    document.getElementById("note-body").value = "";
    save();
    renderDigitalNotes();
});

document.getElementById("note-search").addEventListener("input", renderDigitalNotes);

function renderDigitalNotes() {
    const grid = document.getElementById("notes-grid");
    const query = document.getElementById("note-search").value.trim().toLowerCase();
    grid.innerHTML = notes.length ? "" : '<p class="mistake-empty">هنوز یادداشتی ننوشته‌ای.</p>';
    notes.filter(n => n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query) || n.subj.includes(query))
        .forEach(n => {
            const card = document.createElement("div");
            card.className = "digital-note-card";
            card.innerHTML = `<header><span class="note-subj-tag">${esc(n.subj)}</span><span><button class="del-x" aria-label="ویرایش" onclick="editNote(${Number(n.id)})">✏️</button><button class="del-x" aria-label="حذف" onclick="removeNote(${Number(n.id)})">✕</button></span></header><strong>${esc(n.title)}</strong><p style="white-space: pre-line; line-height: 1.6;">${esc(n.body)}</p><small style="color: var(--text-muted); font-size: 0.8rem;">${esc(fmtNoteDate(n.date))}</small>`;
            grid.appendChild(card);
        });
}

window.removeNote = function(id) { notes = notes.filter(n => n.id !== id); save(); renderDigitalNotes(); };

/* --- دفترچه خطاها --- */
const REVIEW_INTERVALS = [1, 3, 7, 14];
function addDaysToKey(key, n) { const d = new Date(`${key}T00:00:00`); d.setDate(d.getDate() + n); return getLocalDateKey(d); }
function mistakeIsDue(m) { return !!m.nextReview && m.nextReview <= getLocalDateKey(); }

document.getElementById("add-mistake").addEventListener("click", () => {
    const topic = document.getElementById("mistake-topic").value.trim();
    const body = document.getElementById("mistake-body").value.trim();
    if (!topic && !body) return;
    const today = getLocalDateKey();
    mistakes.unshift({ id: Date.now(), subj: document.getElementById("mistake-subject").value, topic: topic || "بدون مبحث", reason: document.getElementById("mistake-reason").value, body, date: today, stage: 0, nextReview: addDaysToKey(today, REVIEW_INTERVALS[0]) });
    document.getElementById("mistake-topic").value = "";
    document.getElementById("mistake-body").value = "";
    save(); renderMistakes(); updateCardsAndRadar();
});

document.getElementById("mistake-filter").addEventListener("change", renderMistakes);

function reviewMistake(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;
    m.stage = (m.stage || 0) + 1;
    m.nextReview = m.stage < REVIEW_INTERVALS.length ? addDaysToKey(getLocalDateKey(), REVIEW_INTERVALS[m.stage]) : null;
    save(); renderMistakes(); updateCardsAndRadar();
}

function renderMistakes() {
    const grid = document.getElementById("mistakes-grid");
    const stats = document.getElementById("mistake-stats");
    const filter = document.getElementById("mistake-filter").value;
    grid.innerHTML = ""; stats.innerHTML = "";
    const chip = (text, cls = "") => { const s = document.createElement("span"); s.className = "note-subj-tag " + cls; s.textContent = text; stats.appendChild(s); };
    const counts = {};
    mistakes.forEach(m => { counts[m.reason] = (counts[m.reason] || 0) + 1; });
    const dueCount = mistakes.filter(mistakeIsDue).length;
    chip(`کل خطاها: ${mistakes.length}`);
    if (dueCount) chip(`مرور امروز: ${dueCount}`, "due-tag");
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => chip(`${r}: ${c}`));

    const visible = mistakes.filter(m => filter === "all" || (filter === "due" ? mistakeIsDue(m) : m.reason === filter))
        .sort((a, b) => (mistakeIsDue(b) ? 1 : 0) - (mistakeIsDue(a) ? 1 : 0) || b.id - a.id);

    if (!visible.length) {
        grid.innerHTML = `<p class="mistake-empty">${mistakes.length ? "موردی با این فیلتر پیدا نشد." : "هنوز خطایی ثبت نکرده‌ای."}</p>`;
        return;
    }

    visible.forEach(m => {
        const due = mistakeIsDue(m);
        const status = !m.nextReview ? "✅ تسلط کامل" : due ? "🔔 امروز مرور شود" : `مرور بعدی: ${new Date(`${m.nextReview}T00:00:00`).toLocaleDateString("fa-IR")}`;
        const card = document.createElement("div");
        card.className = "digital-note-card mistake-card" + (due ? " due" : "");
        card.innerHTML = `<header><span><span class="note-subj-tag">${esc(m.subj)}</span> <span class="note-subj-tag">${esc(m.reason)}</span></span><button class="del-x" aria-label="حذف" data-act="del">✕</button></header><strong>${esc(m.topic)}</strong><p style="white-space: pre-line; line-height: 1.6;">${esc(m.body)}</p><small style="color: var(--text-muted); font-size: 0.8rem;">${status}</small>`;
        card.querySelector('[data-act="del"]').addEventListener("click", () => withUndo("خطا حذف شد", () => { mistakes = mistakes.filter(x => x.id !== m.id); save(); renderMistakes(); updateCardsAndRadar(); }));
        if (due) {
            const btn = document.createElement("button");
            btn.className = "btn-primary small";
            btn.textContent = "مرور شد ✓";
            btn.addEventListener("click", () => reviewMistake(m.id));
            card.appendChild(btn);
        }
        grid.appendChild(card);
    });
}

/* --- چک‌لیست و گزارش پایان روز --- */
document.getElementById("add-todo-btn").addEventListener("click", () => {
    const input = document.getElementById("todo-input");
    if (!input.value.trim()) return;
    todos.push({ id: Date.now(), text: input.value.trim(), done: false, date: getLocalDateKey() });
    input.value = ""; save(); renderTodos();
});

function renderTodos() {
    const list = document.getElementById("todo-list");
    list.innerHTML = todos.length ? "" : '<li class="empty-li">کاری برای امروز نداری.</li>';
    todos.forEach(t => {
        const li = document.createElement("li");
        li.innerHTML = `<label style="display:flex; align-items:center; gap:6px; margin:0; cursor:pointer;" class="${t.done ? 'todo-done' : ''}"><input type="checkbox" style="width:auto;" ${t.done ? "checked" : ""} onchange="toggleTodo(${Number(t.id)})"><span ondblclick="editTodo(${Number(t.id)})">${t.carried ? "↪ " : ""}${esc(t.text)}</span></label><span><button class="del-x" aria-label="ویرایش" onclick="editTodo(${Number(t.id)})">✏️</button><button class="del-x" aria-label="حذف" onclick="removeTodo(${Number(t.id)})">✕</button></span>`;
        list.appendChild(li);
    });
}

window.toggleTodo = function(id) { todos = todos.map(t => t.id === id ? { ...t, done: !t.done, doneDate: !t.done ? getLocalDateKey() : null } : t); save(); renderTodos(); };
window.removeTodo = function(id) { todos = todos.filter(t => t.id !== id); save(); renderTodos(); };

function openEndOfDayReport() {
    const todayIdx = (new Date().getDay() + 1) % 7;
    const todayName = DAYS[todayIdx];
    const tomorrowName = DAYS[(todayIdx + 1) % 7];
    const todayLogs = studyLogs.filter(l => l.date === getLocalDateKey());
    const todayMins = todayLogs.reduce((s, l) => s + l.minutes, 0);
    const todayTests = todayLogs.reduce((s, l) => s + (l.totalTests || 0), 0);
    document.getElementById("eod-study-time").textContent = `${todayMins} دقیقه (${(todayMins / 60).toFixed(1)} ساعت)`;
    document.getElementById("eod-test-summary").textContent = `${todayTests} تست ثبت‌شده در امروز (${todayName})`;

    const weak = getWeakSubjects();
    document.getElementById("eod-weak-subjects").textContent = weak.length ? weak.slice(0, 5).join("، ") : "عالی! هیچ درس عقب‌افتاده‌ای ندارید.";

    const completedList = document.getElementById("eod-completed-tasks");
    completedList.innerHTML = "";
    const doneTodos = todos.filter(t => t.done && t.doneDate === getLocalDateKey());
    if (!doneTodos.length && !todayLogs.length) {
        completedList.innerHTML = "<li>هنوز موردی برای امروز تیک نخورده است.</li>";
    } else {
        doneTodos.forEach(t => { const li = document.createElement("li"); li.textContent = `✔ ${t.text}`; completedList.appendChild(li); });
        todayLogs.forEach(l => { const li = document.createElement("li"); li.textContent = `📖 مطالعه ${l.subject} (${l.minutes} دقیقه)`; completedList.appendChild(li); });
    }

    const tomorrowClasses = schoolSchedule[tomorrowName] ? `کلاس‌های مدرسه (${tomorrowName}): ${schoolSchedule[tomorrowName].join("، ")}` : `${tomorrowName} تعطیل است.`;
    const planBlocks = studyPlan && studyPlan.days && studyPlan.days[tomorrowName];
    const suggestedReview = planBlocks && planBlocks.length ? ` | برنامه مطالعه فردا: ${planBlocks.map(b => b.subj).join("، ")}` : weak.length ? ` | اولویت مطالعه فردا: ${weak.slice(0, 2).join(" و ")}` : "";
    document.getElementById("eod-tomorrow-plan").textContent = tomorrowClasses + suggestedReview;
    document.getElementById("eod-modal").classList.remove("hidden");
}

document.getElementById("open-eod-btn").addEventListener("click", openEndOfDayReport);
document.getElementById("sidebar-eod-btn").addEventListener("click", openEndOfDayReport);
document.getElementById("close-eod-btn").addEventListener("click", () => document.getElementById("eod-modal").classList.add("hidden"));

/* --- صداهای محیطی واقعی و باکیفیت --- */
const AMBIENT_TRACKS = {
    rain: "https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg",
    nature: "https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg",
    cafe: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg"
};

let currentAudio = null;

function stopAmbientSound(resetUI = true) {
    if (resetUI) document.querySelectorAll(".sound-btn").forEach(b => b.classList.toggle("active", b.dataset.sound === "none"));
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

function playAmbientSound(type) {
    stopAmbientSound(false);
    if (type === "none" || !AMBIENT_TRACKS[type]) return;

    currentAudio = new Audio(AMBIENT_TRACKS[type]);
    currentAudio.loop = true;
    const volSlider = document.getElementById("ambient-volume");
    currentAudio.volume = volSlider ? Number(volSlider.value) : 0.65;
    currentAudio.play().catch(err => {
        console.warn("خطا در پخش صدا:", err);
        toast("مرورگر اجازه پخش خودکار صدا را نداد؛ لطفاً دوباره روی دکمه صدا کلیک کنید.");
    });
}

document.getElementById("ambient-volume")?.addEventListener("input", (e) => {
    if (currentAudio) {
        currentAudio.volume = Number(e.target.value);
    }
});

document.querySelectorAll(".sound-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".sound-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        playAmbientSound(btn.dataset.sound);
    });
});

/* --- تقویم شمسی --- */
document.getElementById("add-exam-btn").addEventListener("click", () => {
    const day = parseInt(document.getElementById("exam-day-input").value);
    const subject = document.getElementById("exam-subject-select").value;
    if (!day || day < 1 || day > getJalaliMonthInfo(selectedMonth).length) return;
    monthlyExams.push({ id: Date.now(), month: selectedMonth, day, subject, year: toJalali(new Date()).y });
    monthlyExams.sort((a, b) => a.day - b.day);
    document.getElementById("exam-day-input").value = "";
    save(); updateAll();
});

window.removeExam = function(id) { monthlyExams = monthlyExams.filter(ex => ex.id !== id); save(); updateAll(); };

const PERSIAN_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const jalaliFormatter = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" });
const monthInfoCache = {};

function toJalali(date) {
    const parts = jalaliFormatter.formatToParts(date);
    const get = t => Number(parts.find(p => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day") };
}

function getJalaliMonthInfo(name) {
    const idx = PERSIAN_MONTHS.indexOf(name);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const key = `${toJalali(today).y}-${idx}`;
    if (monthInfoCache[key]) return monthInfoCache[key];
    const cur = new Date(today);
    for (let i = 0; i < 400; i++) { const j = toJalali(cur); if (j.m === 1 && j.d === 1) break; cur.setDate(cur.getDate() - 1); }
    while (toJalali(cur).m !== idx + 1) cur.setDate(cur.getDate() + 1);
    const first = new Date(cur);
    let length = 0;
    while (toJalali(cur).m === idx + 1) { length++; cur.setDate(cur.getDate() + 1); }
    return (monthInfoCache[key] = { first, length });
}

function getUpcomingExamSubjects(limitDays = 30) {
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const out = [];
    monthlyExams.filter(isThisYearExam).forEach(ex => {
        const d = new Date(getJalaliMonthInfo(ex.month).first); d.setDate(d.getDate() + ex.day - 1);
        const left = Math.round((d - now) / 86400000);
        if (left >= 0 && left <= limitDays) out.push({ ...ex, left });
    });
    return out.sort((a, b) => a.left - b.left);
}

function renderMonthCalendar() {
    const grid = document.getElementById("month-calendar-grid");
    const list = document.getElementById("exams-list");
    grid.innerHTML = ""; list.innerHTML = "";
    const monthExams = monthlyExams.filter(ex => ex.month === selectedMonth && isThisYearExam(ex));
    const info = getJalaliMonthInfo(selectedMonth);
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const todayJ = toJalali(now);
    const isThisMonth = PERSIAN_MONTHS[todayJ.m - 1] === selectedMonth;
    const offset = (info.first.getDay() + 1) % 7;

    for (let i = 0; i < offset; i++) { const empty = document.createElement("div"); empty.className = "month-day-cell empty"; grid.appendChild(empty); }
    for (let d = 1; d <= info.length; d++) {
        const cell = document.createElement("div");
        const dayExams = monthExams.filter(ex => ex.day === d);
        cell.className = "month-day-cell" + (dayExams.length > 0 ? " has-exam" : "") + (isThisMonth && todayJ.d === d ? " today" : "");
        cell.textContent = d;
        if (dayExams.length > 0) {
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
        li.innerHTML = `<span>📌 ${esc(ex.day)} ${esc(ex.month)}: ${esc(ex.subject)} <small class="exam-left">${leftText}</small></span><span><button class="del-x" aria-label="ویرایش" onclick="editExam(${Number(ex.id)})">✏️</button><button class="del-x" aria-label="حذف" onclick="removeExam(${Number(ex.id)})">✕</button></span>`;
        list.appendChild(li);
    });
}

/* --- ثبت مطالعه و تحلیل دروس --- */
document.getElementById("study-form").addEventListener("submit", e => {
    e.preventDefault();
    const subject = document.getElementById("subject-select").value;
    const date = document.getElementById("study-date").value;
    const type = document.getElementById("study-type").value;
    const minutes = Number(document.getElementById("minutes-input").value);
    const totalTests = Number(document.getElementById("total-tests").value) || 0;
    const correctTests = Number(document.getElementById("correct-tests").value) || 0;
    const blankTests = Number(document.getElementById("blank-tests").value) || 0;

    if (!date || !Number.isFinite(minutes) || minutes < 5 || minutes > 720 || totalTests < 0 || correctTests < 0 || correctTests > totalTests || blankTests < 0 || correctTests + blankTests > totalTests) {
        toast("لطفاً مقادیر را به‌درستی وارد کنید.");
        return;
    }

    if (date > getLocalDateKey()) { toast("تاریخ مطالعه نمی‌تواند در آینده باشد."); return; }
    const selectedDate = new Date(`${date}T00:00:00`);
    studyLogs.unshift({
        id: Date.now(), subject, date, day: DAYS[(selectedDate.getDay() + 1) % 7],
        type, minutes, totalTests, correctTests, blankTests, topic: document.getElementById("topic-input").value.trim()
    });

    document.getElementById("minutes-input").value = "";
    document.getElementById("total-tests").value = "";
    document.getElementById("correct-tests").value = "";
    document.getElementById("topic-input").value = "";
    save(); updateAll();
});

function netPercent(correct, total, blank = 0) {
    if (total <= 0) return 0;
    const wrong = Math.max(0, total - correct - blank);
    return ((correct - wrong / 3) / total) * 100;
}

function getWeakSubjects() {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 14);
    const stats = {};
    studyLogs.forEach(l => {
        if (!l.date || new Date(`${l.date}T00:00:00`) < since) return;
        if (!stats[l.subject]) stats[l.subject] = { mins: 0, totalT: 0, correctT: 0 };
        stats[l.subject].mins += Number(l.minutes) || 0;
        stats[l.subject].totalT += l.totalTests || 0;
        stats[l.subject].correctT += l.correctTests || 0;
        stats[l.subject].blankT = (stats[l.subject].blankT || 0) + (l.blankTests || 0);
    });
    SUBJECTS.forEach(s => { if (!stats[s]) stats[s] = { mins: 0, totalT: 0, correctT: 0 }; });
    const weak = [];
    for (const [subj, d] of Object.entries(stats)) {
        const net = d.totalT >= 10 ? netPercent(d.correctT, d.totalT, d.blankT || 0) : null;
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
        t[k].tot += l.totalTests; t[k].cor += l.correctTests || 0; t[k].blank = (t[k].blank || 0) + (l.blankTests || 0);
    });
    return Object.entries(t).filter(([, v]) => v.tot >= 5 && netPercent(v.cor, v.tot, v.blank || 0) < 40).map(([k]) => k);
}

function updateCardsAndRadar() {
    const weekLogs = getCurrentWeekLogs();
    const totalMins = weekLogs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
    const descMins = weekLogs.filter(log => log.type === "descriptive").reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
    const testMins = weekLogs.filter(log => log.type === "test").reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
    const totalTests = weekLogs.reduce((sum, log) => sum + (Number(log.totalTests) || 0), 0);
    const correctTests = weekLogs.reduce((sum, log) => sum + (Number(log.correctTests) || 0), 0);
    const blankWeek = weekLogs.reduce((sum, log) => sum + (Number(log.blankTests) || 0), 0);

    document.getElementById("stat-hours").textContent = (totalMins / 60).toFixed(1) + " ساعت";

    const currentWeekStart = getWeekStart();
    const previousWeekStart = new Date(currentWeekStart); previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousMins = studyLogs.filter(log => log.date && new Date(`${log.date}T00:00:00`) >= previousWeekStart && new Date(`${log.date}T00:00:00`) < currentWeekStart)
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

    const accuracy = totalTests > 0 ? Math.round(netPercent(correctTests, totalTests, blankWeek)) : 0;
    document.getElementById("stat-accuracy").textContent = accuracy + "%";
    document.getElementById("trend-tests").textContent = `${correctTests} از ${totalTests} تست`;

    const descPct = totalMins > 0 ? Math.round((descMins / totalMins) * 100) : 0;
    const testPct = totalMins > 0 ? 100 - descPct : 0;
    document.getElementById("stat-balance").textContent = `${descPct}% / ${testPct}%`;

    const balBadge = document.getElementById("balance-badge");
    if (totalMins > 60 && testPct < 30) {
        balBadge.textContent = "هشدار: تست کم!";
        balBadge.className = "trend-badge down";
    } else {
        balBadge.textContent = "توازن مناسب";
        balBadge.className = "trend-badge up";
    }

    const testTotal = weekLogs.filter(l => l.type === "test").reduce((s, l) => s + (Number(l.totalTests) || 0), 0);
    const speed = testTotal > 0 ? (testMins / testTotal).toFixed(1) : "0";
    document.getElementById("stat-speed").textContent = `${speed} دقیقه`;

    renderTodayCard();
}

function chartTheme() {
    const dark = document.documentElement.classList.contains("dark");
    return {
        text: dark ? "#9aa6cf" : "#636b8c",
        grid: dark ? "rgba(197, 208, 240, 0.12)" : "rgba(43, 58, 103, 0.12)",
        blue: dark ? "#c5d0f0" : "#2b3a67",
        blueFill: dark ? "rgba(197, 208, 240, 0.16)" : "rgba(43, 58, 103, 0.14)",
        orange: dark ? "#ffc247" : "#e69500",
        orangeFill: dark ? "rgba(255, 194, 71, 0.16)" : "rgba(245, 166, 35, 0.14)"
    };
}

function renderChart() {
    const weekLogs = getCurrentWeekLogs();
    const descData = DAYS.map(day => +(weekLogs.filter(log => log.day === day && log.type === "descriptive").reduce((sum, log) => sum + (Number(log.minutes) || 0), 0) / 60).toFixed(2));
    const testData = DAYS.map(day => +(weekLogs.filter(log => log.day === day && log.type === "test").reduce((sum, log) => sum + (Number(log.minutes) || 0), 0) / 60).toFixed(2));
    const canvas = document.getElementById("weeklyWaveChart");
    if (!canvas || typeof Chart === "undefined") return;
    Chart.defaults.font.family = "Vazirmatn, system-ui, sans-serif";
    canvas.parentElement.classList.toggle("is-empty", ![...descData, ...testData].some(Boolean));
    if (waveChart) waveChart.destroy();

    const th = chartTheme();
    waveChart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
            labels: DAYS,
            datasets: [
                { label: "تشریحی", data: descData, borderColor: th.blue, backgroundColor: th.blueFill, borderWidth: 3, tension: 0.4, fill: true },
                { label: "تستی", data: testData, borderColor: th.orange, backgroundColor: th.orangeFill, borderWidth: 3, tension: 0.4, fill: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: chartScales(th) }
    });
}

function renderHistory() {
    const list = document.getElementById("history-list");
    list.innerHTML = studyLogs.length ? "" : '<li class="empty-li">هنوز فعالیتی ثبت نشده؛ از تایمر یا فرم ثبت مطالعه شروع کن.</li>';
    studyLogs.slice(0, 6).forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `<span><strong>${esc(item.subject)}</strong> (${esc(item.day)}) - ${Number(item.minutes) || 0} دقیقه</span><span><button class="del-x" aria-label="ویرایش" onclick="editLog(${Number(item.id)})">✏️</button><button class="del-x" aria-label="حذف" onclick="removeLog(${Number(item.id)})">✕</button></span>`;
        list.appendChild(li);
    });
}

window.removeLog = function(id) { studyLogs = studyLogs.filter(l => l.id !== id); save(); updateAll(); };

function applyUserName() {
    document.getElementById("user-name").textContent = userName;
    document.getElementById("profile-name").textContent = userName;
    document.getElementById("user-avatar").textContent = userName.charAt(0);
}

document.getElementById("user-name").addEventListener("click", () => {
    const v = prompt("نام نمایشی شما:", userName);
    if (v && v.trim()) { userName = v.trim().slice(0, 25); save(); applyUserName(); }
});

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

window.editTodo = function(id) { const t = todos.find(x => x.id === id); if (!t) return; const v = prompt("ویرایش کار:", t.text); if (v && v.trim()) { t.text = v.trim(); save(); renderTodos(); } };
window.editLog = function(id) { const l = studyLogs.find(x => x.id === id); if (!l) return; const v = prompt("مدت مطالعه (دقیقه):", l.minutes); if (v === null) return; const n = Number(v); if (Number.isFinite(n) && n >= 5 && n <= 720) { l.minutes = n; save(); updateAll(); } };
window.editNote = function(id) { const n = notes.find(x => x.id === id); if (!n) return; const title = prompt("عنوان:", n.title); if (title === null) return; const body = prompt("متن یادداشت:", n.body); if (body === null) return; n.title = title.trim() || n.title; n.body = body.trim() || n.body; save(); renderDigitalNotes(); };
window.editExam = function(id) { const ex = monthlyExams.find(x => x.id === id); if (!ex) return; const v = Number(prompt("روز امتحان:", ex.day)); if (v >= 1 && v <= getJalaliMonthInfo(ex.month).length) { ex.day = v; monthlyExams.sort((a, b) => a.day - b.day); save(); updateAll(); } };

/* --- هدف‌ها و روند ۸ هفته --- */
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
    if (!entries.length) { grid.innerHTML = '<p class="mistake-empty">هنوز هدفی نگذاشته‌ای.</p>'; return; }
    entries.forEach(([s, h]) => {
        const done = (mins[s] || 0) / 60;
        const pct = Math.min(100, Math.round((done / h) * 100));
        const row = document.createElement("div");
        row.className = "goal-row";
        row.innerHTML = `<span class="goal-name">${esc(s)}</span><div class="goal-bar"><div class="goal-fill${pct >= 100 ? " full" : ""}" style="width:${pct}%"></div></div><span class="goal-num">${done.toFixed(1)} / ${h} ساعت</span><button class="del-x" aria-label="حذف">✕</button>`;
        row.querySelector("button").addEventListener("click", () => withUndo("هدف حذف شد", () => { delete weeklyGoals[s]; save(); renderGoals(); }));
        grid.appendChild(row);
    });
}

function getCountdownDays() {
    if (!target.date) return null;
    const t = new Date(`${target.date}T00:00:00`);
    if (Number.isNaN(t.getTime())) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((t - now) / 86400000);
}

function renderCountdown() {
    const el = document.getElementById("countdown-text");
    const d = getCountdownDays();
    if (d === null) { el.textContent = "تاریخ هدف (مثلاً کنکور) را وارد کن."; return; }
    const fa = new Date(`${target.date}T00:00:00`).toLocaleDateString("fa-IR", { day: "numeric", month: "long", year: "numeric" });
    el.textContent = d > 0 ? `${d} روز تا ${target.title || "هدف"} (${fa})` : d === 0 ? `امروز ${target.title || "روز هدف"} است!` : `${target.title || "هدف"} (${fa}) گذشته است.`;
}

["target-title", "target-date"].forEach(id => document.getElementById(id).addEventListener("change", () => {
    target = { title: document.getElementById("target-title").value.trim(), date: document.getElementById("target-date").value };
    save(); renderCountdown(); updateCardsAndRadar();
}));

function renderLongTerm() {
    const canvas = document.getElementById("longTermChart");
    if (!canvas || typeof Chart === "undefined") return;
    Chart.defaults.font.family = "Vazirmatn, system-ui, sans-serif";
    const start = getWeekStart(), labels = [], data = [];
    for (let i = 7; i >= 0; i--) {
        const ws = new Date(start); ws.setDate(ws.getDate() - 7 * i);
        const we = new Date(ws); we.setDate(we.getDate() + 7);
        const mins = studyLogs.filter(l => l.date && new Date(`${l.date}T00:00:00`) >= ws && new Date(`${l.date}T00:00:00`) < we).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
        labels.push(ws.toLocaleDateString("fa-IR", { month: "short", day: "numeric" }));
        data.push(+(mins / 60).toFixed(1));
    }
    canvas.parentElement.classList.toggle("is-empty", !data.some(Boolean));
    if (longChart) longChart.destroy();
    const th = chartTheme();
    longChart = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: { labels, datasets: [{ label: "ساعت", data, backgroundColor: th.blue, borderRadius: 6, maxBarThickness: 44 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: chartScales(th) }
    });
}

/* --- برنامه‌ریز هوشمند --- */
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
    const exams = new Set(getUpcomingExamSubjects().map(ex => ex.subject));
    const score = s => mode === "balanced" ? 1 : (SUBJECT_WEIGHT[s] || 1) * (1 + (weak.has(s) ? 0.5 : 0) + (exams.has(s) ? 1.5 : 0));
    const credits = {}; pool.forEach(s => { credits[s] = 0; });
    const total = pool.reduce((a, s) => a + score(s), 0);

    const days = {};
    DAYS.forEach(day => {
        let hours = Math.min(14, goal * (day === "جمعه" ? 1.5 : day === "پنج‌شنبه" ? 1.25 : 1));
        const n = hours >= 6 ? 4 : 3;
        const per = Math.round((hours / n) * 4) / 4;
        const chosen = [];
        for (let i = 0; i < n && chosen.length < pool.length; i++) {
            pool.forEach(s => { credits[s] += score(s); });
            const pick = pool.filter(s => !chosen.includes(s)).sort((a, b) => credits[b] - credits[a])[0];
            credits[pick] -= total; chosen.push(pick);
        }
        days[day] = chosen.map(s => ({ subj: s, hours: per, done: false }));
    });
    studyPlan = { generatedAt: getLocalDateKey(), days };
    save(); renderPlan(); renderTodayCard();
}
document.getElementById("generate-plan").addEventListener("click", generatePlan);

function renderPlan() {
    const box = document.getElementById("plan-output");
    box.innerHTML = "";
    if (!studyPlan || !studyPlan.days) { box.innerHTML = '<p class="mistake-empty">برای ساخت برنامه روی «تولید برنامه» بزن.</p>'; return; }
    const todayName = DAYS[(new Date().getDay() + 1) % 7];
    DAYS.forEach(day => {
        const blocks = studyPlan.days[day] || [];
        const row = document.createElement("div");
        row.className = "lesson-row" + (day === todayName ? " today-plan" : "");
        const label = document.createElement("div"); label.innerHTML = `<strong>${day}</strong>`;
        const wrap = document.createElement("div"); wrap.className = "plan-blocks";
        blocks.forEach(b => {
            const item = document.createElement("label");
            item.className = "plan-block" + (b.done ? " done" : "");
            const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!b.done; cb.style.width = "auto";
            cb.addEventListener("change", () => { b.done = cb.checked; item.classList.toggle("done", b.done); save(); });
            const sel = document.createElement("select"); SUBJECTS.forEach(s => sel.add(new Option(s, s))); sel.value = b.subj;
            sel.addEventListener("change", () => { b.subj = sel.value; save(); });
            const hrs = document.createElement("span"); hrs.textContent = `${+b.hours.toFixed(2)} ساعت`;
            item.append(cb, sel, hrs); wrap.appendChild(item);
        });
        const badge = document.createElement("span"); badge.className = "lesson-badge"; badge.textContent = `${+blocks.reduce((s, b) => s + b.hours, 0).toFixed(2)} ساعت`;
        row.append(label, wrap, badge); box.appendChild(row);
    });
}

/* --- تایمر و بکاپ --- */
const BREAK_SECONDS = 5 * 60;
let focusMinutes = 25, timerMode = "focus", seconds = 25 * 60, interval = null, timerEndAt = null, timerSubject = null;

function drawTimer() {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    document.getElementById("timer-display").textContent = `${m}:${s}`;
    document.getElementById("zen-timer-display").textContent = `${m}:${s}`;
}

function logSession(subj, minutes, endedAt) {
    const typeSel = document.getElementById("timer-type");
    studyLogs.unshift({ id: Date.now(), subject: subj, date: getLocalDateKey(endedAt), day: DAYS[(endedAt.getDay() + 1) % 7], type: typeSel ? typeSel.value : "descriptive", minutes, totalTests: 0, correctTests: 0 });
    save(); updateAll();
}

function tick() {
    if (!timerEndAt) return;
    const remain = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    if (remain !== seconds) { seconds = remain; drawTimer(); }
    if (remain <= 0) finishTimer();
}

function startTimer() {
    if (interval) return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    if (timerMode === "focus" && seconds === focusMinutes * 60) timerSubject = document.getElementById("timer-subject").value;
    timerEndAt = Date.now() + seconds * 1000;
    interval = setInterval(tick, 500);
}

function pauseTimer() {
    if (!interval) return;
    tick(); clearInterval(interval); interval = null; timerEndAt = null;
}

function finishTimer() {
    const endedAt = new Date(timerEndAt || Date.now());
    clearInterval(interval); interval = null; timerEndAt = null;
    if (timerMode === "focus") {
        const subj = timerSubject || document.getElementById("timer-subject").value;
        logSession(subj, focusMinutes, endedAt);
        timerMode = "break"; seconds = BREAK_SECONDS;
        document.getElementById("zen-subject-title").textContent = "☕ استراحت";
        drawTimer();
        notifyDone(`خسته نباشید! ${focusMinutes} دقیقه مطالعه برای ${subj} ثبت شد.`);
        startTimer();
    } else {
        stopAmbientSound();
        document.getElementById("zen-overlay").classList.add("hidden");
        timerMode = "focus"; seconds = focusMinutes * 60; drawTimer();
    }
}

function finishEarly() {
    if (timerMode === "break") { clearInterval(interval); interval = null; timerMode = "focus"; seconds = focusMinutes * 60; drawTimer(); return; }
    if (interval) tick();
    const elapsed = Math.floor((focusMinutes * 60 - seconds) / 60);
    if (elapsed < 5) { toast("حداقل ۵ دقیقه باید مطالعه کرده باشی."); return; }
    logSession(timerSubject || document.getElementById("timer-subject").value, elapsed, new Date());
    stopAmbientSound(); document.getElementById("zen-overlay").classList.add("hidden");
    clearInterval(interval); interval = null; seconds = focusMinutes * 60; drawTimer();
}

document.getElementById("timer-length").addEventListener("change", e => {
    focusMinutes = Number(e.target.value) || 25;
    if (!interval) { seconds = focusMinutes * 60; drawTimer(); }
});
document.getElementById("start-timer").addEventListener("click", startTimer);
document.getElementById("pause-timer").addEventListener("click", pauseTimer);
document.getElementById("finish-early-btn").addEventListener("click", finishEarly);
document.getElementById("zen-pause-btn").addEventListener("click", () => interval ? pauseTimer() : startTimer());
document.getElementById("enter-zen-btn").addEventListener("click", () => {
    document.getElementById("zen-subject-title").textContent = document.getElementById("timer-subject").value;
    document.getElementById("zen-overlay").classList.remove("hidden");
    startTimer();
});
document.getElementById("exit-zen-btn").addEventListener("click", () => { stopAmbientSound(); document.getElementById("zen-overlay").classList.add("hidden"); });

document.getElementById("export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ studyLogs, mockTests, notes, monthlyExams, todos, schoolSchedule, dailyGoal, selectedMonth, mistakes, weeklyGoals, target, studyPlan, userName }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "study-backup.json"; a.click();
});

function sanitizeImport(d) {
    if (!d || typeof d !== "object") throw new Error("bad");
    const arr = a => Array.isArray(a) ? a.filter(x => x && typeof x === "object" && Number.isFinite(Number(x.id))).map(x => ({ ...x, id: Number(x.id) })) : [];
    const out = { ...d };
    out.studyLogs = arr(d.studyLogs).map(l => ({ ...l, minutes: Number(l.minutes) || 0, totalTests: Number(l.totalTests) || 0, correctTests: Number(l.correctTests) || 0, blankTests: Number(l.blankTests) || 0 }));
    out.notes = arr(d.notes); out.mockTests = arr(d.mockTests).map(m => ({ ...m, percent: Number(m.percent) || 0 })); out.todos = arr(d.todos); out.mistakes = arr(d.mistakes);
    out.monthlyExams = arr(d.monthlyExams).map(e => ({ ...e, day: Number(e.day) || 1, year: Number(e.year) || toJalali(new Date()).y }));
    if (out.studyPlan && out.studyPlan.days) Object.values(out.studyPlan.days).forEach(bl => Array.isArray(bl) && bl.forEach(b => { b.hours = Number(b.hours) || 0; }));
    else out.studyPlan = null;
    return out;
}

document.getElementById("import-json").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = sanitizeImport(JSON.parse(ev.target.result));
            if (!confirm("اطلاعات فعلی با فایل بکاپ جایگزین می‌شود. ادامه می‌دهی؟")) return;
            studyLogs = Array.isArray(data.studyLogs) ? data.studyLogs : [];
            notes = Array.isArray(data.notes) ? data.notes : [];
            mockTests = Array.isArray(data.mockTests) ? data.mockTests : [];
            monthlyExams = Array.isArray(data.monthlyExams) ? data.monthlyExams : [];
            todos = Array.isArray(data.todos) ? data.todos : [];
            mistakes = Array.isArray(data.mistakes) ? data.mistakes : [];
            weeklyGoals = data.weeklyGoals || {};
            if (data.target) target = data.target;
            if (data.studyPlan) studyPlan = data.studyPlan;
            if (data.schoolSchedule) schoolSchedule = data.schoolSchedule;
            if (Number.isFinite(Number(data.dailyGoal))) dailyGoal = Math.min(14, Math.max(1, Number(data.dailyGoal)));
            if (PERSIAN_MONTHS.includes(data.selectedMonth)) selectedMonth = data.selectedMonth;
            if (typeof data.userName === "string" && data.userName.trim()) userName = data.userName.trim().slice(0, 25);
            document.getElementById("daily-goal").value = dailyGoal;
            document.getElementById("month-select").value = selectedMonth;
            applyUserName();
            save(); updateAll(); toast("اطلاعات بازیابی و در ابر ذخیره شد!");
        } catch { toast("فایل نامعتبر است."); }
    };
    reader.readAsText(file);
});


function toggleAppTheme() {
    document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("studyTheme", document.documentElement.classList.contains("dark") ? "dark" : "light"); } catch (e) {}
    renderChart();
    renderLongTerm();
    renderMocks();
}
document.getElementById("theme-toggle").addEventListener("click", toggleAppTheme);
document.getElementById("auth-theme-toggle")?.addEventListener("click", toggleAppTheme);

window.scrollToSection = function(id) { document.getElementById(id).scrollIntoView({ behavior: "smooth" }); };

/* --- بررسی خودکار وضعیت ورود هنگام باز کردن صفحه --- */
(async function checkSession() {
    const showAuth = () => document.getElementById("auth-screen").classList.remove("hidden");
    if (!sb) { showAuth(); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
        try { await onUserAuthenticated(session.user); } catch (e) { showAuth(); }
    } else {
        showAuth();
    }
})();

/* --- کیبورد، چاپ گزارش روز --- */
document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    document.getElementById("eod-modal").classList.add("hidden");
    if (!document.getElementById("zen-overlay").classList.contains("hidden")) document.getElementById("exit-zen-btn").click();
});
document.getElementById("user-name").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
});
window.printEod = function() { document.body.classList.add("print-eod"); window.print(); };
window.addEventListener("afterprint", () => document.body.classList.remove("print-eod"));


/* ===== ابزارهای رابط: اعلان، برگردان، اعداد فارسی ===== */
const faNum = n => Number(n).toLocaleString("fa-IR", { useGrouping: false, maximumFractionDigits: 2 });

function toast(msg, opts = {}) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const el = document.createElement("div");
    el.className = "toast";
    const span = document.createElement("span");
    span.textContent = msg;
    el.appendChild(span);
    if (opts.action) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = opts.action;
        b.addEventListener("click", () => { opts.onAction(); el.remove(); });
        el.appendChild(b);
    }
    root.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || (opts.action ? 7000 : 4000));
}

function withUndo(label, fn) {
    const before = JSON.parse(JSON.stringify(snapshot()));
    fn();
    toast(label, { action: "برگردان", onAction: () => { applyPayload(before, userName); save(); updateAll(); } });
}
["removeNote", "removeLog", "removeTodo", "removeExam"].forEach(name => {
    const f = window[name];
    window[name] = id => withUndo("حذف شد", () => f(id));
});

function beep() {
    try {
        const c = new (window.AudioContext || window.webkitAudioContext)();
        const o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.frequency.value = 880; g.gain.value = 0.15;
        o.start(); o.stop(c.currentTime + 0.35);
    } catch (e) {}
}
function notifyDone(msg) {
    toast(msg); beep();
    if ("Notification" in window && Notification.permission === "granted") new Notification(msg);
}

function chartScales(th, extra = {}) {
    return {
        y: { beginAtZero: true, suggestedMax: 2, position: "right", ticks: { color: th.text, maxTicksLimit: 6, callback: v => faNum(v) }, grid: { color: th.grid }, ...extra },
        x: { reverse: true, ticks: { color: th.text }, grid: { display: false } }
    };
}

/* ===== انتخاب تاریخ شمسی (بدون کتابخانه) ===== */
function jalaliToDate(jy, jm, jd) {
    const d = new Date(jy + 621, 2, 21 + (jm <= 6 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd - 1, 12);
    const key = jy * 10000 + jm * 100 + jd;
    for (let i = 0; i < 6; i++) {
        const j = toJalali(d), k = j.y * 10000 + j.m * 100 + j.d;
        if (k === key) break;
        d.setDate(d.getDate() + (k < key ? 1 : -1));
    }
    return d;
}
function jalaliMonthLen(y, m) {
    return m <= 6 ? 31 : m <= 11 ? 30 : Math.round((jalaliToDate(y + 1, 1, 1) - jalaliToDate(y, 12, 1)) / 86400000);
}
function initJalaliPicker(id) {
    const input = document.getElementById(id);
    if (!input || input.dataset.jalali) return;
    input.dataset.jalali = "1"; input.required = false; input.type = "hidden";
    const wrap = document.createElement("div");
    wrap.className = "jdate";
    const mk = (label) => { const s = document.createElement("select"); s.setAttribute("aria-label", label); wrap.appendChild(s); return s; };
    const sd = mk("روز"), sm = mk("ماه"), sy = mk("سال");
    PERSIAN_MONTHS.forEach((n, i) => sm.add(new Option(n, i + 1)));
    const cy = toJalali(new Date()).y;
    for (let y = cy - 1; y <= cy + 2; y++) sy.add(new Option(faNum(y), y));
    const fillDays = () => {
        const n = jalaliMonthLen(+sy.value, +sm.value), keep = +sd.value || 1;
        sd.innerHTML = "";
        for (let i = 1; i <= n; i++) sd.add(new Option(faNum(i), i));
        sd.value = Math.min(keep, n);
    };
    const push = () => {
        input.value = getLocalDateKey(jalaliToDate(+sy.value, +sm.value, +sd.value));
        input.dispatchEvent(new Event("change"));
    };
    input._jpull = () => {
        const d = input.value ? new Date(`${input.value}T12:00:00`) : new Date();
        const j = toJalali(Number.isNaN(d.getTime()) ? new Date() : d);
        if (![...sy.options].some(o => +o.value === j.y)) sy.add(new Option(faNum(j.y), j.y));
        sy.value = j.y; sm.value = j.m; fillDays(); sd.value = j.d;
    };
    sy.onchange = sm.onchange = () => { fillDays(); push(); };
    sd.onchange = push;
    input.after(wrap);
    input._jpull();
}
function syncJalaliPickers() {
    document.querySelectorAll("input[data-jalali]").forEach(i => i._jpull && i._jpull());
}

/* ===== کارت «امروز» ===== */
function renderTodayCard() {
    const box = document.getElementById("today-card");
    if (!box) return;
    const dayName = DAYS[(new Date().getDay() + 1) % 7], key = getLocalDateKey();
    const mins = studyLogs.filter(l => l.date === key).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
    const pct = Math.min(100, Math.round(mins / (Math.max(1, dailyGoal) * 60) * 100));
    const cd = getCountdownDays(), ex = getUpcomingExamSubjects()[0];
    const due = mistakes.filter(mistakeIsDue).length;
    const classes = schoolSchedule[dayName] || [];
    const blocks = (studyPlan && studyPlan.days && studyPlan.days[dayName]) || [];
    const inSchool = new Set(Object.values(schoolSchedule).flat());
    const weak = studyLogs.length ? getWeakSubjects().filter(s => inSchool.has(s)).slice(0, 3) : [];
    const chip = t => `<span class="note-subj-tag">${esc(t)}</span>`;
    const row = (title, html) => `<div class="today-row"><h4>${title}</h4><div>${html}</div></div>`;
    const count = cd !== null && cd >= 0
        ? `<strong>${faNum(cd)}</strong><span>روز تا ${esc(target.title || "هدف")}</span>`
        : `<span>تاریخ کنکور تنظیم نشده</span> <button type="button" class="link-btn" data-goto="progress">تنظیم</button>`;
    box.innerHTML = `
      <div class="today-hero">
        <div class="today-count">${count}</div>
        <div class="today-progress"><div class="goal-bar"><div class="goal-fill${pct >= 100 ? " full" : ""}" style="width:${pct}%"></div></div>
        <small>${faNum((mins / 60).toFixed(1))} از ${faNum(dailyGoal)} ساعت مطالعه‌ی امروز</small></div>
      </div>
      <div class="today-body">
        ${row(`مدرسه (${esc(dayName)})`, classes.length ? classes.map(chip).join("") : '<span class="muted">تعطیل</span>')}
        ${row("برنامه‌ی مطالعه‌ی امروز", blocks.length ? blocks.map(b => chip(`${b.subj}: ${faNum(b.hours)} ساعت${b.done ? " ✓" : ""}`)).join("") : '<span class="muted">برنامه‌ای ساخته نشده</span> <button type="button" class="link-btn" data-goto="plan">ساخت برنامه</button>')}
        ${due ? row("مرور غلط‌نامه", `<span class="note-subj-tag due-tag">${faNum(due)} خطا امروز مرور شود</span>`) : ""}
        ${ex ? row("نزدیک‌ترین امتحان", chip(`${ex.subject}: ${ex.left === 0 ? "امروز" : faNum(ex.left) + " روز دیگر"}`)) : ""}
        ${weak.length ? row("نیازمند مرور", weak.map(chip).join("")) : ""}
      </div>`;
    box.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => setView(b.dataset.goto)));
}

/* ===== آزمون‌های آزمایشی و نقشه‌ی مطالعه ===== */
document.getElementById("add-mock").addEventListener("click", () => {
    const pEl = document.getElementById("mock-percent");
    const percent = Number(pEl.value), date = document.getElementById("mock-date").value;
    if (pEl.value === "" || !Number.isFinite(percent) || percent < -34 || percent > 100 || !date) {
        toast("درصد (بین ۳۴- تا ۱۰۰) و تاریخ را درست وارد کن."); return;
    }
    mockTests.push({ id: Date.now(), title: document.getElementById("mock-title").value.trim() || "آزمون آزمایشی", percent, date });
    mockTests.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    document.getElementById("mock-title").value = ""; pEl.value = "";
    save(); renderMocks();
});
window.removeMock = id => withUndo("آزمون حذف شد", () => { mockTests = mockTests.filter(m => m.id !== id); save(); renderMocks(); });

function renderMocks() {
    const list = document.getElementById("mock-list"), canvas = document.getElementById("mockChart");
    if (!list) return;
    const fa = (d, o) => new Date(`${d}T00:00:00`).toLocaleDateString("fa-IR", o);
    list.innerHTML = mockTests.length ? "" : '<li class="empty-li">هنوز آزمونی ثبت نشده.</li>';
    [...mockTests].reverse().slice(0, 8).forEach(m => {
        const li = document.createElement("li");
        li.innerHTML = `<span><strong>${esc(m.title)}</strong>: ${faNum(Number(m.percent) || 0)}٪ (${esc(fa(m.date))})</span><button class="del-x" aria-label="حذف" onclick="removeMock(${Number(m.id)})">✕</button>`;
        list.appendChild(li);
    });
    if (!canvas || typeof Chart === "undefined") return;
    canvas.parentElement.classList.toggle("is-empty", !mockTests.length);
    if (mockChart) mockChart.destroy();
    const th = chartTheme();
    mockChart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: { labels: mockTests.map(m => fa(m.date, { month: "short", day: "numeric" })), datasets: [{ label: "درصد", data: mockTests.map(m => Number(m.percent) || 0), borderColor: th.blue, backgroundColor: th.blueFill, borderWidth: 3, tension: 0.3, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: chartScales(th, { beginAtZero: false, suggestedMax: 100 }) }
    });
}

function renderHeatmap() {
    const el = document.getElementById("heatmap");
    if (!el) return;
    const per = {};
    studyLogs.forEach(l => { if (l.date) per[l.date] = (per[l.date] || 0) + (Number(l.minutes) || 0); });
    const start = getWeekStart(); start.setDate(start.getDate() - 7 * 11);
    el.innerHTML = "";
    for (let i = 0; i < 84; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const m = per[getLocalDateKey(d)] || 0;
        const cell = document.createElement("span");
        cell.className = "hm-cell lv" + (m === 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 240 ? 3 : 4);
        cell.title = `${d.toLocaleDateString("fa-IR", { month: "long", day: "numeric" })}: ${faNum(Math.round(m / 6) / 10)} ساعت`;
        el.appendChild(cell);
    }
}

/* ===== تب‌ها و بازیابی اتصال ===== */
const VIEWS = ["today", "progress", "notes", "plan"];
function setView(v, push = true) {
    if (!VIEWS.includes(v)) v = "today";
    document.body.dataset.view = v;
    document.querySelectorAll(".nav-btn[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    if (push && location.hash !== "#" + v) location.hash = v;
    requestAnimationFrame(() => { renderChart(); renderLongTerm(); renderMocks(); });
    window.scrollTo({ top: 0 });
}
document.querySelectorAll(".nav-btn[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
window.addEventListener("hashchange", () => setView(location.hash.slice(1), false));
setView(location.hash.slice(1), false);

document.getElementById("sync-status").addEventListener("click", async () => {
    if (cloudReady || !currentUser) return;
    await loadFromCloud(currentUser);
    document.getElementById("daily-goal").value = dailyGoal;
    document.getElementById("month-select").value = selectedMonth;
    applyUserName(); syncJalaliPickers(); updateAll();
});


/* ===== اعداد فارسی یکدست در همه‌ی متن‌های صفحه ===== */
(function () {
    const FA = "۰۱۲۳۴۵۶۷۸۹";
    const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "CANVAS"]);
    function fix(n) {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName) || p.closest("[data-latin]") || !/[0-9]/.test(n.nodeValue)) return;
        n.nodeValue = n.nodeValue.replace(/[0-9]/g, d => FA[d]);
    }
    function walk(root) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
        while (w.nextNode()) list.push(w.currentNode);
        list.forEach(fix);
    }
    new MutationObserver(ms => ms.forEach(m => {
        if (m.type === "characterData") fix(m.target);
        else m.addedNodes.forEach(x => x.nodeType === 3 ? fix(x) : x.nodeType === 1 && walk(x));
    })).observe(document.body, { childList: true, subtree: true, characterData: true });
    walk(document.body);
})();


/* ===== متن راهنمای شمارش معکوس کم‌رنگ‌تر از عدد اصلی ===== */
(function () {
    const el = document.querySelector(".countdown-text");
    if (!el) return;
    const f = () => el.classList.toggle("hint", /وارد کن/.test(el.textContent));
    new MutationObserver(f).observe(el, { childList: true, characterData: true, subtree: true });
    f();
})();


function isThisYearExam(ex) { return (ex.year || toJalali(new Date()).y) === toJalali(new Date()).y; }

/* ===== بستن منوی تنظیمات تایمر، پاک کردن فیلد نزده، ثبت سرویس‌ورکر ===== */
document.addEventListener("click", e => {
    document.querySelectorAll(".timer-more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
(function () {
    const form = document.getElementById("blank-tests").form;
    if (form) form.addEventListener("submit", () => setTimeout(() => {
        if (!document.getElementById("total-tests").value) document.getElementById("blank-tests").value = "";
    }, 0));
})();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
}


/* ===== آمار کوتاه زیر نمودار هفته ===== */
function renderWeekInsights() {
    const el = document.getElementById("week-insights");
    if (!el) return;
    const perDate = {};
    studyLogs.forEach(l => { if (l.date) perDate[l.date] = (perDate[l.date] || 0) + (Number(l.minutes) || 0); });
    const start = getWeekStart();
    const week = DAYS.map((name, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { name, m: perDate[getLocalDateKey(d)] || 0 }; });
    const best = week.reduce((a, b) => (b.m > a.m ? b : a), week[0]);
    const active = week.filter(d => d.m > 0).length;
    let streak = 0;
    const d = new Date(); d.setHours(12, 0, 0, 0);
    if (!perDate[getLocalDateKey(d)]) d.setDate(d.getDate() - 1);
    while (perDate[getLocalDateKey(d)] > 0 && streak < 400) { streak++; d.setDate(d.getDate() - 1); }
    const tile = (t, v) => `<div class="wi-tile"><small>${t}</small><strong>${v}</strong></div>`;
    el.innerHTML = tile("بهترین روز هفته", best.m ? `${esc(best.name)} (${faNum(Math.round(best.m / 6) / 10)} ساعت)` : "—")
        + tile("روزهای فعال", `${faNum(active)} از ${faNum(7)}`)
        + tile("رکورد پیاپی", streak ? `${faNum(streak)} روز` : "—");
}