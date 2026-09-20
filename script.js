/* ==========================================================================
   FocusDesk – Smart To-Do & Productivity Dashboard
   Vanilla JavaScript + LocalStorage. No libraries, no backend.

   Sections
   1.  Constants
   2.  App state & DOM cache
   3.  Store (LocalStorage wrapper)
   4.  Date helpers
   5.  DOM helpers (el, icon, toasts)
   6.  Task data (load, sanitize, add, update, delete, toggle, demo data)
   7.  Productivity streak
   8.  Filtering & sorting
   9.  Rendering (greeting, stats, progress ring, streak, task list)
   10. Task dialog & form validation
   11. Delete confirmation
   12. Theme
   13. Pomodoro timer
   14. Event wiring
   15. Init
   ========================================================================== */

'use strict';


/* 1. CONSTANTS ----------------------------------------------------------- */

const STORAGE_KEYS = {
  tasks: 'focusdesk.tasks',
  theme: 'focusdesk.theme',
  streak: 'focusdesk.streak',
  settings: 'focusdesk.settings',
  pomodoro: 'focusdesk.pomodoro',
  seeded: 'focusdesk.seeded',
};

const CATEGORIES = { study: 'Study', work: 'Work', personal: 'Personal', other: 'Other' };
const PRIORITIES = { low: 'Low', medium: 'Medium', high: 'High' };
const PRIORITY_WEIGHT = { low: 1, medium: 2, high: 3 };
const SORT_OPTIONS = ['newest', 'oldest', 'due', 'priority'];

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 300;
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  breakMinutes: 5,
  notify: false,   // browser notifications are opt-in
  sound: true,
  sort: 'newest',
};


/* 2. APP STATE & DOM CACHE ------------------------------------------------ */

const state = {
  tasks: [],
  filters: { search: '', status: 'all', category: 'all', sort: 'newest' },
  settings: { ...DEFAULT_SETTINGS },
  streak: { days: {}, current: 0, best: 0 },
  editingId: null,        // id of the task open in the dialog (null = adding)
  pendingDeleteId: null,  // id of the task waiting for delete confirmation
  newTaskId: null,        // used once to animate a freshly added task
  lastToggledId: null,    // used once to animate a task that was just completed
  timeSignature: '',      // lets the minute ticker know when to re-render
};

const els = {};

function cacheElements() {
  const ids = [
    'today-date', 'greeting', 'hero-summary',
    'stat-total', 'stat-completed', 'stat-pending', 'stat-progress',
    'search-input', 'category-filter', 'sort-select', 'result-count', 'tasks-heading',
    'task-list', 'empty-state', 'no-results', 'clear-filters-btn',
    'progress-ring-wrap', 'ring-value', 'ring-percent', 'progress-percent-text', 'progress-sub',
    'streak-days', 'streak-unit', 'streak-note', 'streak-week', 'streak-best',
    'pomodoro', 'pomo-time', 'pomo-status', 'pomo-bar-fill', 'pomo-start', 'pomo-pause', 'pomo-reset',
    'pomo-alert', 'pomo-alert-text', 'pomo-alert-close', 'pomo-sessions',
    'set-focus', 'set-break', 'set-notify', 'set-sound', 'set-error',
    'task-dialog', 'task-dialog-title', 'task-form', 'task-title', 'task-desc', 'task-date', 'task-time',
    'task-category', 'task-submit', 'clear-due', 'hint-due',
    'err-title', 'err-desc', 'err-date', 'err-time',
    'confirm-dialog', 'confirm-text', 'confirm-cancel', 'confirm-delete',
    'theme-toggle', 'add-task-btn', 'fab-add', 'empty-add-btn', 'toast-region',
  ];
  ids.forEach((id) => { els[toCamel(id)] = document.getElementById(id); });
  els.chips = Array.from(document.querySelectorAll('.chip[data-filter]'));
  els.segments = Array.from(document.querySelectorAll('.segment[data-mode]'));
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}


/* 3. STORAGE ------------------------------------------------------------- */
/* All reads/writes go through here. If LocalStorage is blocked (for example
   in some private windows) the app keeps working in memory for the session. */

const Store = {
  available: (function testStorage() {
    try {
      const probe = '__focusdesk_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  })(),
  memory: {},

  getRaw(key) {
    if (this.available) {
      try { return window.localStorage.getItem(key); } catch (err) { /* fall through */ }
    }
    return Object.prototype.hasOwnProperty.call(this.memory, key) ? this.memory[key] : null;
  },

  setRaw(key, value) {
    if (this.available) {
      try { window.localStorage.setItem(key, value); return true; } catch (err) { this.available = false; }
    }
    this.memory[key] = value;
    return false;
  },

  getJSON(key, fallback) {
    const raw = this.getRaw(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (err) { return fallback; }
  },

  setJSON(key, value) {
    return this.setRaw(key, JSON.stringify(value));
  },
};


/* 4. DATE HELPERS -------------------------------------------------------- */
/* Dates are stored as local "YYYY-MM-DD" strings and times as "HH:MM".
   Parsing them by hand avoids the classic UTC time-zone off-by-one bug. */

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const pad2 = (n) => String(n).padStart(2, '0');

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayKey() {
  return toDateKey(new Date());
}

function addDays(key, amount) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + amount);
  return toDateKey(d);
}

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDateKey(value)) === value;   // rejects things like 2026-02-31
}

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The moment a task is due. Tasks with a date but no time are due at the end of that day. */
function getDueMoment(task) {
  if (!task.dueDate) return null;
  const due = parseDateKey(task.dueDate);
  if (task.dueTime) {
    const [h, m] = task.dueTime.split(':').map(Number);
    due.setHours(h, m, 0, 0);
  } else {
    due.setHours(23, 59, 59, 999);
  }
  return due;
}

function isOverdue(task, now = new Date()) {
  if (task.completed) return false;
  const due = getDueMoment(task);
  return due !== null && due.getTime() < now.getTime();
}

function formatDueDate(key) {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  const date = parseDateKey(key);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDueTime(time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatClock(totalSeconds) {
  return `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`;
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}


/* 5. DOM HELPERS --------------------------------------------------------- */

/** Tiny element builder. Text is always set with textContent, so user input can never inject HTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'checked') node.checked = Boolean(value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child);
  });
  return node;
}

/** SVG icon that points at a <symbol> in the sprite inside index.html */
function icon(name, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function showToast(message, type = 'success', duration = 3200) {
  const iconName = type === 'alert' ? 'bell' : type === 'info' ? 'info' : 'check';
  const toast = el('div', { class: `toast toast-${type}` }, icon(iconName), el('span', { text: message }));
  els.toastRegion.append(toast);
  while (els.toastRegion.children.length > 3) els.toastRegion.firstElementChild.remove();

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 300);
  }, duration);
}


/* 6. TASK DATA ----------------------------------------------------------- */

function generateId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Turns anything read from storage into a safe, complete task object (or null if unusable). */
function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, TITLE_MAX) : '';
  if (!title) return null;

  const dueDate = isValidDateKey(raw.dueDate) ? raw.dueDate : '';
  const completed = raw.completed === true;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    title,
    description: typeof raw.description === 'string' ? raw.description.slice(0, DESCRIPTION_MAX) : '',
    dueDate,
    dueTime: dueDate && isValidTime(raw.dueTime) ? raw.dueTime : '',
    priority: has(PRIORITIES, raw.priority) ? raw.priority : 'medium',
    category: has(CATEGORIES, raw.category) ? raw.category : 'other',
    completed,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    completedAt: completed && Number.isFinite(raw.completedAt) ? raw.completedAt : null,
  };
}

function loadTasks() {
  const stored = Store.getJSON(STORAGE_KEYS.tasks, []);
  return Array.isArray(stored) ? stored.map(sanitizeTask).filter(Boolean) : [];
}

function saveTasks() {
  Store.setJSON(STORAGE_KEYS.tasks, state.tasks);
}

function findTask(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function addTask(data) {
  const task = { id: generateId(), ...data, completed: false, createdAt: Date.now(), completedAt: null };
  state.tasks.push(task);
  state.newTaskId = task.id;
  saveTasks();
  return task;
}

function updateTask(id, data) {
  const task = findTask(id);
  if (!task) return null;
  Object.assign(task, data);
  saveTasks();
  return task;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveTasks();
}

/** Flips a task between pending and completed and keeps the streak in sync. */
function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;

  if (!task.completed) {
    task.completed = true;
    task.completedAt = Date.now();
    state.lastToggledId = task.id;
    recordCompletionDay(toDateKey(new Date(task.completedAt)));
  } else {
    const completionDay = task.completedAt ? toDateKey(new Date(task.completedAt)) : null;
    task.completed = false;
    task.completedAt = null;
    if (completionDay) removeCompletionDay(completionDay);
  }
  saveTasks();
}

/** Adds a few sample tasks on the very first launch only. */
function seedDemoTasks() {
  if (Store.getRaw(STORAGE_KEYS.seeded)) return;
  Store.setRaw(STORAGE_KEYS.seeded, '1');
  if (state.tasks.length > 0) return;

  const today = todayKey();
  const now = Date.now();
  const hour = 3600000;
  const samples = [
    {
      title: 'Complete C Programming Assignment',
      description: 'Finish the pointers and arrays exercises from Chapter 6 and test every program.',
      dueDate: addDays(today, -1), dueTime: '23:00', priority: 'high', category: 'study',
    },
    {
      title: 'Study JavaScript',
      description: 'Review closures, promises and DOM events, then build one small practice project.',
      dueDate: today, dueTime: '23:30', priority: 'medium', category: 'study',
    },
    {
      title: 'Workout',
      description: '30 minute run followed by stretching.',
      dueDate: today, dueTime: '07:00', priority: 'low', category: 'personal', done: true,
    },
    {
      title: 'Prepare Project Presentation',
      description: 'Outline the slides, add screenshots of the demo and rehearse the 5 minute pitch.',
      dueDate: addDays(today, 3), dueTime: '09:30', priority: 'high', category: 'work',
    },
  ];

  samples.forEach((sample, index) => {
    const { done, ...data } = sample;
    const task = { id: generateId(), ...data, completed: false, createdAt: now - (samples.length - index) * hour, completedAt: null };
    if (done) {
      task.completed = true;
      task.completedAt = now;
      recordCompletionDay(toDateKey(new Date(now)));
    }
    state.tasks.push(task);
  });
  saveTasks();
}


/* 7. PRODUCTIVITY STREAK -------------------------------------------------- */
/* We keep a map of { "YYYY-MM-DD": number of tasks completed that day }.
   Current streak = consecutive days with at least one completion, counted back
   from today. If today has none yet, the streak stays alive as long as
   yesterday has one (you still have time to keep it going today).
   Un-completing a task removes its completion, so a day only counts while at
   least one task completed that day is still marked as done. */

function computeStreak(days, today = todayKey()) {
  const done = (key) => (days[key] || 0) > 0;

  let current = 0;
  let cursor = done(today) ? today : addDays(today, -1);
  while (done(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let previous = null;
  Object.keys(days).filter(done).sort().forEach((key) => {
    run = previous && addDays(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  });

  return { current, best };
}

function loadStreak() {
  const stored = Store.getJSON(STORAGE_KEYS.streak, null);
  const days = {};
  if (stored && typeof stored.days === 'object' && stored.days !== null) {
    Object.entries(stored.days).forEach(([key, count]) => {
      if (isValidDateKey(key) && Number.isInteger(count) && count > 0) days[key] = count;
    });
  }
  state.streak = { days, ...computeStreak(days) };
}

function saveStreak() {
  Store.setJSON(STORAGE_KEYS.streak, state.streak);
}

function refreshStreak() {
  Object.assign(state.streak, computeStreak(state.streak.days));
  saveStreak();
}

function recordCompletionDay(key) {
  state.streak.days[key] = (state.streak.days[key] || 0) + 1;
  refreshStreak();
}

function removeCompletionDay(key) {
  if (!state.streak.days[key]) return;
  state.streak.days[key] -= 1;
  if (state.streak.days[key] <= 0) delete state.streak.days[key];
  refreshStreak();
}


/* 8. FILTERING & SORTING -------------------------------------------------- */

function matchesSearch(task, search) {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${task.title} ${task.description}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matchesStatus(task, status) {
  switch (status) {
    case 'pending': return !task.completed;
    case 'completed': return task.completed;
    case 'high': return task.priority === 'high';
    case 'today': return task.dueDate === todayKey();
    default: return true;
  }
}

function matchesCategory(task, category) {
  return category === 'all' || task.category === category;
}

/** Tasks that pass search + category (used for the counts on the filter chips). */
function getSearchScopedTasks() {
  const { search, category } = state.filters;
  return state.tasks.filter((task) => matchesSearch(task, search) && matchesCategory(task, category));
}

function compareTasks(a, b, sort) {
  const newestFirst = b.createdAt - a.createdAt;
  switch (sort) {
    case 'oldest':
      return a.createdAt - b.createdAt;
    case 'due': {
      const aDue = getDueMoment(a);
      const bDue = getDueMoment(b);
      if (aDue && bDue) return aDue - bDue || newestFirst;
      if (aDue) return -1;      // tasks without a due date go last
      if (bDue) return 1;
      return newestFirst;
    }
    case 'priority':
      return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || compareTasks(a, b, 'due');
    default:
      return newestFirst;
  }
}

function getVisibleTasks() {
  const { status, sort } = state.filters;
  return getSearchScopedTasks()
    .filter((task) => matchesStatus(task, status))
    .sort((a, b) => compareTasks(a, b, sort));
}


/* 9. RENDERING ----------------------------------------------------------- */

function renderAll() {
  renderGreeting();
  renderStats();
  renderProgress();
  renderStreak();
  renderChips();
  renderTasks();
  state.timeSignature = getTimeSignature();
}

function renderGreeting() {
  const now = new Date();
  els.greeting.textContent = `${getGreeting(now)} 👋`;
  els.todayDate.textContent = formatLongDate(now);

  const total = state.tasks.length;
  const pending = state.tasks.filter((t) => !t.completed);
  const dueToday = pending.filter((t) => t.dueDate === todayKey() && !isOverdue(t, now)).length;
  const overdue = pending.filter((t) => isOverdue(t, now)).length;

  let summary;
  if (total === 0) summary = 'Nothing on your plate yet. Add a task to get started.';
  else if (pending.length === 0) summary = 'All caught up. Every task is done.';
  else {
    const parts = [];
    if (dueToday) parts.push(`${dueToday} due today`);
    if (overdue) parts.push(`${overdue} overdue`);
    summary = parts.length
      ? `You have ${parts.join(' and ')}.`
      : `You have ${plural(pending.length, 'pending task')}, none due today.`;
  }
  els.heroSummary.textContent = summary;
}

function renderStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((t) => t.completed).length;
  els.statTotal.textContent = total;
  els.statCompleted.textContent = completed;
  els.statPending.textContent = total - completed;
  els.statProgress.textContent = total === 0 ? 0 : Math.round((completed / total) * 100);
}

/** Today's progress = tasks due today, plus anything you completed today. */
function getTodayProgress() {
  const today = todayKey();
  const scope = state.tasks.filter((t) =>
    t.dueDate === today || (t.completed && t.completedAt && toDateKey(new Date(t.completedAt)) === today));
  const done = scope.filter((t) => t.completed).length;
  const percent = scope.length === 0 ? 0 : Math.round((done / scope.length) * 100);
  return { total: scope.length, done, percent };
}

function renderProgress() {
  const { total, done, percent } = getTodayProgress();
  els.ringValue.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
  els.ringValue.style.opacity = percent === 0 ? '0' : '1';   // a 0% arc would otherwise draw a dot
  els.ringPercent.textContent = percent;
  els.progressPercentText.textContent = `${percent}%`;
  els.progressSub.textContent = total === 0
    ? 'Nothing is due today. Add a task with today\u2019s date to track it here.'
    : `${done} of ${plural(total, 'task')} done today.`;
  els.progressRingWrap.setAttribute('aria-label', total === 0
    ? '0% completed today, no tasks due'
    : `${percent}% completed today, ${done} of ${plural(total, 'task')} done`);
}

function renderStreak() {
  const { current, best } = computeStreak(state.streak.days);
  const doneToday = (state.streak.days[todayKey()] || 0) > 0;

  els.streakDays.textContent = current;
  els.streakUnit.textContent = 'Day Streak';
  els.streakBest.textContent = best;

  if (doneToday) els.streakNote.textContent = 'You\u2019ve completed a task today. Streak safe.';
  else if (current > 0) els.streakNote.textContent = 'Complete a task today to keep your streak going.';
  else els.streakNote.textContent = 'Complete a task to start a streak.';

  // Last 7 days, oldest on the left
  const today = todayKey();
  const items = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = addDays(today, -offset);
    const date = parseDateKey(key);
    const isDone = (state.streak.days[key] || 0) > 0;
    const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
    const dot = el('span', { class: 'streak-dot' });
    dot.append(icon('check'));
    items.push(el('li', {
      class: `streak-day${isDone ? ' is-done' : ''}${offset === 0 ? ' is-today' : ''}`,
      'aria-label': `${dayName}${offset === 0 ? ' (today)' : ''}: ${isDone ? 'task completed' : 'no tasks completed'}`,
    }, dot, el('span', { text: dayName, 'aria-hidden': 'true' })));
  }
  els.streakWeek.replaceChildren(...items);
}

function renderChips() {
  const scoped = getSearchScopedTasks();
  els.chips.forEach((chip) => {
    const filter = chip.dataset.filter;
    chip.setAttribute('aria-pressed', String(state.filters.status === filter));
    chip.querySelector('.chip-count').textContent = scoped.filter((t) => matchesStatus(t, filter)).length;
  });
}

function renderTasks() {
  const now = new Date();
  const total = state.tasks.length;
  const visible = getVisibleTasks();
  const focusTarget = captureFocus();

  els.taskList.replaceChildren(...visible.map((task) => createTaskElement(task, now)));
  els.taskList.hidden = visible.length === 0;
  els.emptyState.hidden = total > 0;
  els.noResults.hidden = !(total > 0 && visible.length === 0);
  els.resultCount.textContent = total === 0
    ? ''
    : visible.length === total ? plural(total, 'task') : `Showing ${visible.length} of ${total}`;

  state.newTaskId = null;
  state.lastToggledId = null;
  restoreFocus(focusTarget);
}

function createTaskElement(task, now) {
  const overdue = isOverdue(task, now);
  const titleId = `task-title-${task.id}`;
  const classes = ['task'];
  if (task.completed) classes.push('is-done');
  if (task.id === state.newTaskId) classes.push('is-new');
  if (task.id === state.lastToggledId && task.completed) classes.push('just-completed');

  // Checkbox
  const checkbox = el('input', {
    type: 'checkbox', class: 'check-input', checked: task.completed,
    'aria-labelledby': titleId, dataset: { action: 'toggle' },
  });
  const checkBox = el('span', { class: 'check-box', 'aria-hidden': 'true' });
  const tick = document.createElementNS(SVG_NS, 'svg');
  tick.setAttribute('viewBox', '0 0 24 24');
  const tickUse = document.createElementNS(SVG_NS, 'use');
  tickUse.setAttribute('href', '#i-check');
  tick.append(tickUse);
  checkBox.append(tick);
  const check = el('label', { class: 'check' }, checkbox, checkBox);

  // Title row (+ OVERDUE badge)
  const head = el('div', { class: 'task-head' }, el('h3', { class: 'task-title', id: titleId, text: task.title }));
  if (overdue) head.append(el('span', { class: 'badge-overdue', text: 'OVERDUE' }));

  // Meta tags
  const meta = el('div', { class: 'task-meta' });
  meta.append(el('span', { class: 'tag', dataset: { category: task.category } },
    el('span', { class: 'tag-dot', 'aria-hidden': 'true' }),
    el('span', { class: 'visually-hidden', text: 'Category: ' }),
    CATEGORIES[task.category]));
  meta.append(el('span', { class: 'tag tag-priority', dataset: { priority: task.priority } },
    icon('flag'),
    PRIORITIES[task.priority],
    el('span', { class: 'visually-hidden', text: ' priority' })));
  if (task.dueDate) {
    const dueState = overdue ? 'overdue' : (task.dueDate === todayKey() && !task.completed ? 'today' : '');
    meta.append(el('span', {
      class: 'tag tag-due', dataset: { state: dueState },
      title: formatLongDate(parseDateKey(task.dueDate)),
    }, icon('calendar'), el('span', { class: 'visually-hidden', text: 'Due date: ' }), formatDueDate(task.dueDate)));
  }
  if (task.dueTime) {
    meta.append(el('span', { class: `tag tag-due`, dataset: { state: overdue ? 'overdue' : '' } },
      icon('clock'), el('span', { class: 'visually-hidden', text: 'Due time: ' }), formatDueTime(task.dueTime)));
  }

  const body = el('div', { class: 'task-body' }, head);
  if (task.description) body.append(el('p', { class: 'task-desc', text: task.description }));
  body.append(meta);

  // Actions
  const actions = el('div', { class: 'task-actions' },
    el('button', {
      type: 'button', class: 'icon-btn', title: 'Edit task', dataset: { action: 'edit' },
      'aria-label': `Edit task: ${task.title}`,
    }, icon('edit')),
    el('button', {
      type: 'button', class: 'icon-btn danger', title: 'Delete task', dataset: { action: 'delete' },
      'aria-label': `Delete task: ${task.title}`,
    }, icon('trash')));

  return el('li', {
    class: classes.join(' '),
    dataset: { id: task.id, priority: task.priority, completed: String(task.completed), overdue: String(overdue) },
  }, check, body, actions);
}

/* The list is rebuilt on every change, so remember which control had keyboard
   focus and give it back afterwards. Keyboard users don't lose their place. */
function captureFocus() {
  const active = document.activeElement;
  const item = active && active.closest ? active.closest('.task') : null;
  if (!item || !active.dataset.action) return null;
  return { id: item.dataset.id, action: active.dataset.action };
}

function restoreFocus(target) {
  if (!target) return;
  const selector = `.task[data-id="${CSS.escape(target.id)}"] [data-action="${target.action}"]`;
  const node = els.taskList.querySelector(selector);
  if (node) node.focus({ preventScroll: true });
}

/** Changes whenever the calendar day or the set of overdue tasks changes. */
function getTimeSignature() {
  const now = new Date();
  const overdueIds = state.tasks.filter((t) => isOverdue(t, now)).map((t) => t.id).join(',');
  return `${todayKey()}|${overdueIds}`;
}

function tick() {
  renderGreeting();
  if (getTimeSignature() !== state.timeSignature) renderAll();
}


/* 10. TASK DIALOG & FORM VALIDATION --------------------------------------- */

const FIELD_MAP = {
  title: { input: 'taskTitle', error: 'errTitle' },
  description: { input: 'taskDesc', error: 'errDesc' },
  dueDate: { input: 'taskDate', error: 'errDate' },
  dueTime: { input: 'taskTime', error: 'errTime' },
};

function openDialog(dialog) {
  document.body.classList.add('modal-open');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function openTaskDialog(task = null) {
  state.editingId = task ? task.id : null;
  els.taskDialogTitle.textContent = task ? 'Edit task' : 'Add a task';
  els.taskSubmit.textContent = task ? 'Save changes' : 'Add task';
  clearFormErrors();

  const priority = task ? task.priority : 'medium';
  els.taskTitle.value = task ? task.title : '';
  els.taskDesc.value = task ? task.description : '';
  els.taskDate.value = task ? task.dueDate : (state.filters.status === 'today' ? todayKey() : '');
  els.taskTime.value = task ? task.dueTime : '';
  els.taskCategory.value = task ? task.category
    : (state.filters.category !== 'all' ? state.filters.category : 'other');
  els.taskForm.querySelector(`input[name="priority"][value="${priority}"]`).checked = true;
  updateDueHint();

  openDialog(els.taskDialog);
  els.taskTitle.focus();
  els.taskTitle.select();
}

function readTaskForm() {
  return {
    title: els.taskTitle.value.trim(),
    description: els.taskDesc.value.trim(),
    dueDate: els.taskDate.value,
    dueTime: els.taskTime.value,
    priority: els.taskForm.querySelector('input[name="priority"]:checked').value,
    category: els.taskCategory.value,
  };
}

/** Returns an object of { fieldName: message }. Empty object = the form is valid. */
function validateTaskForm(values) {
  const errors = {};

  if (!values.title) errors.title = 'Enter a title for your task.';
  else if (values.title.length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`;
  }

  if (els.taskDate.validity.badInput || (values.dueDate && !isValidDateKey(values.dueDate))) {
    errors.dueDate = 'Enter a complete, valid date.';
  }
  if (els.taskTime.validity.badInput || (values.dueTime && !isValidTime(values.dueTime))) {
    errors.dueTime = 'Enter a complete, valid time.';
  }
  if (values.dueTime && !values.dueDate && !errors.dueDate) {
    errors.dueDate = 'Choose a due date to go with the time.';
  }

  if (!has(PRIORITIES, values.priority)) values.priority = 'medium';
  if (!has(CATEGORIES, values.category)) values.category = 'other';
  return errors;
}

function showFormErrors(errors) {
  Object.entries(FIELD_MAP).forEach(([field, ids]) => {
    const input = els[ids.input];
    const error = els[ids.error];
    if (errors[field]) {
      error.textContent = errors[field];
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
    } else {
      error.hidden = true;
      error.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  });
  const firstInvalid = Object.keys(FIELD_MAP).find((field) => errors[field]);
  if (firstInvalid) els[FIELD_MAP[firstInvalid].input].focus();
}

function clearFormErrors() {
  showFormErrors({});
}

/** Non-blocking note: past dates are allowed, but the task will show as overdue. */
function updateDueHint() {
  const values = { dueDate: els.taskDate.value, dueTime: els.taskTime.value };
  const due = isValidDateKey(values.dueDate) ? getDueMoment(values) : null;
  const isPast = due !== null && due.getTime() < Date.now();
  els.hintDue.hidden = !isPast;
  els.hintDue.textContent = isPast ? 'That date and time has passed, so this task will be marked overdue.' : '';
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const values = readTaskForm();
  const errors = validateTaskForm(values);
  showFormErrors(errors);
  if (Object.keys(errors).length > 0) return;

  const data = {
    title: values.title,
    description: values.description,
    dueDate: values.dueDate,
    dueTime: values.dueDate ? values.dueTime : '',
    priority: values.priority,
    category: values.category,
  };

  let task;
  let message;
  if (state.editingId) {
    task = updateTask(state.editingId, data);
    message = 'Task updated.';
  } else {
    task = addTask(data);
    message = 'Task added.';
  }

  els.taskDialog.close();
  renderAll();

  if (task && !getVisibleTasks().some((t) => t.id === task.id)) {
    message += ' It\u2019s hidden by your current filters.';
    showToast(message, 'info', 4200);
  } else {
    showToast(message);
  }
}


/* 11. DELETE CONFIRMATION -------------------------------------------------- */

function openDeleteDialog(task) {
  state.pendingDeleteId = task.id;
  els.confirmText.replaceChildren(
    document.createTextNode('\u201C'),
    el('strong', { text: task.title }),
    document.createTextNode('\u201D will be permanently removed. This can\u2019t be undone.'),
  );
  openDialog(els.confirmDialog);
  els.confirmCancel.focus();
}

function confirmDelete() {
  const task = findTask(state.pendingDeleteId);
  state.pendingDeleteId = null;
  els.confirmDialog.close();
  if (!task) return;

  deleteTask(task.id);
  renderAll();
  showToast('Task deleted.');
  els.tasksHeading.focus({ preventScroll: true });
}

/** Closes a dialog when the dark backdrop (not the dialog body) is clicked. */
function enableBackdropClose(dialog) {
  let pressStartedOnBackdrop = false;
  dialog.addEventListener('mousedown', (event) => { pressStartedOnBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (pressStartedOnBackdrop && event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    if (dialog === els.taskDialog) state.editingId = null;
    if (dialog === els.confirmDialog) state.pendingDeleteId = null;
  });
}


/* 12. THEME --------------------------------------------------------------- */

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, persist = false) {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (persist) Store.setRaw(STORAGE_KEYS.theme, theme);
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark', true);
}


/* 13. POMODORO TIMER ------------------------------------------------------ */
/* The countdown is based on an end timestamp instead of "subtract one each
   second", so it stays accurate even when the browser slows down a background tab. */

const pomodoro = {
  mode: 'focus',       // 'focus' | 'break'
  running: false,
  remainingMs: 0,
  endAt: 0,
  intervalId: null,
  sessions: { date: '', count: 0 },
};

const BASE_TITLE = document.title;

function pomoDuration(mode = pomodoro.mode) {
  return (mode === 'focus' ? state.settings.focusMinutes : state.settings.breakMinutes) * 60 * 1000;
}

function loadSettings() {
  const savedSettings = Store.getJSON(STORAGE_KEYS.settings, {});
  const stored = savedSettings && typeof savedSettings === 'object' ? savedSettings : {};
  const clamp = (value, min, max, fallback) =>
    (Number.isInteger(value) && value >= min && value <= max ? value : fallback);
  state.settings = {
    focusMinutes: clamp(stored.focusMinutes, 1, 120, DEFAULT_SETTINGS.focusMinutes),
    breakMinutes: clamp(stored.breakMinutes, 1, 60, DEFAULT_SETTINGS.breakMinutes),
    notify: stored.notify === true,
    sound: stored.sound !== false,
    sort: SORT_OPTIONS.includes(stored.sort) ? stored.sort : DEFAULT_SETTINGS.sort,
  };
  state.filters.sort = state.settings.sort;

  const sessions = Store.getJSON(STORAGE_KEYS.pomodoro, null);
  if (sessions && sessions.date === todayKey() && Number.isInteger(sessions.count)) {
    pomodoro.sessions = { date: sessions.date, count: sessions.count };
  }
}

function saveSettings() {
  Store.setJSON(STORAGE_KEYS.settings, state.settings);
}

function getSessionsToday() {
  return pomodoro.sessions.date === todayKey() ? pomodoro.sessions.count : 0;
}

function countFocusSession() {
  pomodoro.sessions = { date: todayKey(), count: getSessionsToday() + 1 };
  Store.setJSON(STORAGE_KEYS.pomodoro, pomodoro.sessions);
}

function renderPomodoro() {
  const total = pomoDuration();
  const seconds = Math.max(0, Math.ceil(pomodoro.remainingMs / 1000));
  const clock = formatClock(seconds);
  const isFocus = pomodoro.mode === 'focus';
  const isPaused = !pomodoro.running && pomodoro.remainingMs < total && pomodoro.remainingMs > 0;

  els.pomodoro.dataset.mode = pomodoro.mode;
  els.pomoTime.textContent = clock;
  els.pomoBarFill.style.width = `${Math.min(100, Math.max(0, (1 - pomodoro.remainingMs / total) * 100))}%`;
  els.pomoSessions.textContent = `${plural(getSessionsToday(), 'focus session')} today`;

  els.segments.forEach((segment) => {
    segment.setAttribute('aria-pressed', String(segment.dataset.mode === pomodoro.mode));
  });

  if (pomodoro.running) els.pomoStatus.textContent = isFocus ? 'Focus time. Stay on one task.' : 'Break time. Step away for a moment.';
  else if (isPaused) els.pomoStatus.textContent = 'Paused';
  else els.pomoStatus.textContent = isFocus ? 'Ready to focus' : 'Ready for a break';

  els.pomoStart.disabled = pomodoro.running;
  els.pomoPause.disabled = !pomodoro.running;
  els.pomoStart.querySelector('span').textContent = isPaused ? 'Resume' : 'Start';

  // Show the countdown in the browser tab while the timer runs
  document.title = pomodoro.running ? `${clock} ${isFocus ? 'Focus' : 'Break'} | FocusDesk` : BASE_TITLE;
}

function stopPomoInterval() {
  window.clearInterval(pomodoro.intervalId);
  pomodoro.intervalId = null;
  pomodoro.running = false;
}

function pomoStart() {
  if (pomodoro.running) return;
  if (pomodoro.remainingMs <= 0) pomodoro.remainingMs = pomoDuration();
  hidePomoAlert();
  pomodoro.endAt = Date.now() + pomodoro.remainingMs;
  pomodoro.running = true;
  pomodoro.intervalId = window.setInterval(pomoTick, 250);
  renderPomodoro();
}

function pomoPause() {
  if (!pomodoro.running) return;
  pomodoro.remainingMs = Math.max(0, pomodoro.endAt - Date.now());
  stopPomoInterval();
  renderPomodoro();
}

function pomoReset() {
  stopPomoInterval();
  pomodoro.remainingMs = pomoDuration();
  hidePomoAlert();
  renderPomodoro();
}

function pomoSetMode(mode) {
  if (mode === pomodoro.mode) return;
  stopPomoInterval();
  pomodoro.mode = mode;
  pomodoro.remainingMs = pomoDuration();
  hidePomoAlert();
  renderPomodoro();
}

function pomoTick() {
  const remaining = pomodoro.endAt - Date.now();
  if (remaining <= 0) {
    pomoComplete();
    return;
  }
  pomodoro.remainingMs = remaining;
  renderPomodoro();
}

/** Called when the countdown reaches zero: switch mode and tell the user. */
function pomoComplete() {
  const finished = pomodoro.mode;
  stopPomoInterval();
  if (finished === 'focus') countFocusSession();

  pomodoro.mode = finished === 'focus' ? 'break' : 'focus';
  pomodoro.remainingMs = pomoDuration();
  renderPomodoro();

  const message = finished === 'focus'
    ? `Focus session complete! Take a ${state.settings.breakMinutes}-minute break.`
    : `Break is over. Ready for another ${state.settings.focusMinutes}-minute focus session?`;

  showPomoAlert(message);
  showToast(message, 'alert', 6500);
  if (state.settings.sound) playChime();
  if (state.settings.notify) sendBrowserNotification('FocusDesk', message);
}

function showPomoAlert(message) {
  els.pomoAlertText.textContent = message;
  els.pomoAlert.hidden = false;
}

function hidePomoAlert() {
  els.pomoAlert.hidden = true;
  els.pomoAlertText.textContent = '';
}

/** Two short tones made with the Web Audio API (no audio files needed). */
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const start = ctx.currentTime;
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + i * 0.24;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
    window.setTimeout(() => ctx.close(), 1200);
  } catch (err) { /* sound is optional */ }
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch (err) { /* notifications are optional */ }
}

/** Runs when the user ticks the notifications box (a user gesture, so the prompt is allowed). */
async function handleNotifyToggle() {
  if (!els.setNotify.checked) {
    state.settings.notify = false;
    saveSettings();
    return;
  }
  if (!('Notification' in window)) {
    els.setNotify.checked = false;
    showToast('This browser doesn\u2019t support notifications. The in-page alert still works.', 'info', 4500);
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch (err) { permission = 'denied'; }
  }
  if (permission === 'granted') {
    state.settings.notify = true;
  } else {
    state.settings.notify = false;
    els.setNotify.checked = false;
    showToast('Notifications are blocked. The in-page alert still works.', 'info', 4500);
  }
  saveSettings();
}

/** Validates one of the minute inputs and saves it. */
function handleDurationChange(input, key, min, max, label) {
  const value = Number(input.value);
  const valid = input.value.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;

  if (!valid) {
    els.setError.textContent = `${label} must be a whole number from ${min} to ${max}.`;
    els.setError.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    return;
  }
  els.setError.hidden = true;
  els.setFocus.removeAttribute('aria-invalid');
  els.setBreak.removeAttribute('aria-invalid');

  state.settings[key] = value;
  saveSettings();
  // An idle or paused timer picks up the new length straight away; a running one keeps its current session.
  if (!pomodoro.running) pomoReset();
}

function initPomodoro() {
  els.setFocus.value = state.settings.focusMinutes;
  els.setBreak.value = state.settings.breakMinutes;
  els.setNotify.checked = state.settings.notify && 'Notification' in window && Notification.permission === 'granted';
  els.setSound.checked = state.settings.sound;
  pomodoro.remainingMs = pomoDuration();
  renderPomodoro();
}


/* 14. EVENT WIRING -------------------------------------------------------- */

function setStatusFilter(status) {
  state.filters.status = status;
  renderChips();
  renderTasks();
}

function clearFilters() {
  state.filters.search = '';
  state.filters.status = 'all';
  state.filters.category = 'all';
  els.searchInput.value = '';
  els.categoryFilter.value = 'all';
  renderChips();
  renderTasks();
}

function handleTaskListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const item = button.closest('.task');
  const task = item ? findTask(item.dataset.id) : null;
  if (!task) return;

  if (button.dataset.action === 'edit') openTaskDialog(task);
  if (button.dataset.action === 'delete') openDeleteDialog(task);
}

function handleTaskListChange(event) {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;
  const item = checkbox.closest('.task');
  if (!item) return;

  toggleTask(item.dataset.id);
  renderAll();
}

function wireEvents() {
  // Add task entry points
  [els.addTaskBtn, els.fabAdd, els.emptyAddBtn].forEach((btn) => btn.addEventListener('click', () => openTaskDialog()));

  // Task form
  els.taskForm.addEventListener('submit', handleTaskSubmit);
  els.taskDialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => els.taskDialog.close()));
  Object.entries(FIELD_MAP).forEach(([field, ids]) => {
    els[ids.input].addEventListener('input', () => {
      els[ids.error].hidden = true;
      els[ids.input].removeAttribute('aria-invalid');
      if (field === 'dueDate' || field === 'dueTime') {
        // The date and time errors are linked ("time needs a date"), so clear both together
        els.errDate.hidden = true; els.taskDate.removeAttribute('aria-invalid');
        updateDueHint();
      }
    });
  });
  els.clearDue.addEventListener('click', () => {
    els.taskDate.value = '';
    els.taskTime.value = '';
    updateDueHint();
    els.taskDate.focus();
  });

  // Delete confirmation
  els.confirmCancel.addEventListener('click', () => els.confirmDialog.close());
  els.confirmDelete.addEventListener('click', confirmDelete);
  enableBackdropClose(els.taskDialog);
  enableBackdropClose(els.confirmDialog);

  // Task list (event delegation keeps this working after every re-render)
  els.taskList.addEventListener('click', handleTaskListClick);
  els.taskList.addEventListener('change', handleTaskListChange);

  // Search, filters, sorting
  els.searchInput.addEventListener('input', () => {
    state.filters.search = els.searchInput.value;
    renderChips();
    renderTasks();
  });
  els.chips.forEach((chip) => chip.addEventListener('click', () => setStatusFilter(chip.dataset.filter)));
  els.categoryFilter.addEventListener('change', () => {
    state.filters.category = els.categoryFilter.value;
    renderChips();
    renderTasks();
  });
  els.sortSelect.addEventListener('change', () => {
    state.filters.sort = els.sortSelect.value;
    state.settings.sort = state.filters.sort;
    saveSettings();
    renderTasks();
  });
  els.clearFiltersBtn.addEventListener('click', clearFilters);

  // Theme
  els.themeToggle.addEventListener('click', toggleTheme);

  // Pomodoro
  els.pomoStart.addEventListener('click', pomoStart);
  els.pomoPause.addEventListener('click', pomoPause);
  els.pomoReset.addEventListener('click', pomoReset);
  els.pomoAlertClose.addEventListener('click', hidePomoAlert);
  els.segments.forEach((segment) => segment.addEventListener('click', () => pomoSetMode(segment.dataset.mode)));
  els.setFocus.addEventListener('change', () => handleDurationChange(els.setFocus, 'focusMinutes', 1, 120, 'Focus time'));
  els.setBreak.addEventListener('change', () => handleDurationChange(els.setBreak, 'breakMinutes', 1, 60, 'Break time'));
  els.setNotify.addEventListener('change', handleNotifyToggle);
  els.setSound.addEventListener('change', () => {
    state.settings.sound = els.setSound.checked;
    saveSettings();
    if (state.settings.sound) playChime();
  });

  // Keep several open tabs in sync
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.tasks || event.key === STORAGE_KEYS.streak) {
      state.tasks = loadTasks();
      loadStreak();
      renderAll();
    }
    if (event.key === STORAGE_KEYS.theme && (event.newValue === 'dark' || event.newValue === 'light')) {
      applyTheme(event.newValue, false);
    }
  });

  // Refresh greeting / overdue badges while the page stays open
  window.setInterval(tick, 30 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}


/* 15. INIT ---------------------------------------------------------------- */

function init() {
  cacheElements();
  applyTheme(getTheme(), false);   // theme itself was already applied by the inline script in <head>

  loadSettings();
  state.tasks = loadTasks();
  loadStreak();
  seedDemoTasks();

  els.sortSelect.value = state.filters.sort;
  wireEvents();
  initPomodoro();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
