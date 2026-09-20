# FocusDesk – Smart To-Do & Productivity Dashboard

FocusDesk is a modern productivity dashboard that runs entirely in the browser. You can plan tasks with priorities, categories and due dates, watch your daily progress, keep a streak going and stay focused with a built-in Pomodoro timer. There is no server, no database and no build step. Everything is saved in your browser's LocalStorage.

## Features

**Tasks**
- Add, edit, delete, and complete/uncomplete tasks
- Title, description, due date, due time, priority (Low / Medium / High) and category (Study / Work / Personal / Other)
- Form validation with inline error messages
- Confirmation dialog before a task is deleted
- Completed tasks get a strike-through and stay visible until you delete them
- Tasks past their due date and time are marked **OVERDUE** (the badge appears automatically while the page is open)

**Dashboard**
- Greeting that follows your local time (Good Morning / Afternoon / Evening 👋) and today's date
- Live statistics: Total Tasks, Completed, Pending, Progress %
- Circular "Today's progress" indicator
- 🔥 Productivity streak with a 7-day history and best streak
- Pomodoro timer with Start, Pause, Reset, Focus/Break indicator and an in-page notification when time is up

**Finding things**
- Instant search across title and description
- Filters: All, Pending, Completed, High Priority, Today (each with a live count) plus a category filter
- Sorting: Newest, Oldest, Due date, Priority

**Experience**
- Light and dark theme, remembered between visits
- Responsive layout for phones, tablets, laptops and desktops (floating add button on phones)
- Keyboard accessible, semantic HTML, labelled inputs, visible focus, respects "reduce motion"
- Friendly empty states (no tasks, and no search results)
- Sample tasks on the very first launch only

## Technologies used

- HTML5
- CSS3 (custom properties, grid, flexbox, media queries)
- Vanilla JavaScript (no libraries, no frameworks)
- Browser LocalStorage

No Node.js, no backend, no database and no paid APIs.

## How to run

1. Unzip `smart-todo.zip`.
2. Open `smart-todo/index.html` in a modern browser (Chrome, Edge, Firefox or Safari) by double-clicking it.

That's it. No installation or server is needed. If you prefer a local server, run `python3 -m http.server` inside the folder and visit `http://localhost:8000`.

## Project structure

```
smart-todo/
├── index.html   Page structure, dialogs and the SVG icon sprite
├── style.css    Design tokens (light/dark), layout and responsive rules
├── script.js    Application logic, organised into clearly labelled sections
└── README.md
```

## How LocalStorage is used

All data stays in your browser under these keys:

| Key | Contents |
| --- | --- |
| `focusdesk.tasks` | Array of tasks (id, title, description, due date/time, priority, category, completed status, timestamps) |
| `focusdesk.theme` | `light` or `dark` |
| `focusdesk.streak` | Completion days (`{ "YYYY-MM-DD": count }`) plus the calculated current and best streak |
| `focusdesk.settings` | Pomodoro lengths, sound and notification choices, and your preferred sort order |
| `focusdesk.pomodoro` | Number of focus sessions completed today |
| `focusdesk.seeded` | Marks that the sample tasks were already added, so they are never recreated |

Data is validated when it is loaded, so damaged or hand-edited values cannot break the app. If LocalStorage is blocked (for example in some private windows), the app still works for the current session but cannot save between visits. Changes made in one tab also appear in other open tabs.

To reset everything, open the browser console and run `localStorage.clear()`, then reload. The sample tasks will appear again.

## How the numbers are calculated

- **Statistics cards** cover all tasks. Progress = completed ÷ total.
- **Today's progress ring** covers tasks due today plus any task you completed today.
- **Streak:** a day counts when at least one task was completed on it. The current streak is the number of consecutive days counted back from today. If you haven't completed anything yet today, yesterday's streak stays alive until the day ends. Miss a full day and the streak resets, while your best streak is kept. Un-completing a task removes that completion, so a day only counts while a task completed that day is still marked as done. Deleting a task does not erase a completion that really happened.
- **Overdue:** an incomplete task is overdue once its due date and time have passed. A task with a date but no time is due at the end of that day.
- **Past dates:** you can add a task with a past date. The form shows a note that it will be marked overdue.

## Pomodoro timer

Defaults are 25 minutes of focus and a 5 minute break. When a session ends, the timer switches to the other mode and waits for you to press Start. You'll see a message inside the page, a toast, and (if you allow it) a short sound and a browser notification. The timer works without notifications. The countdown also shows in the browser tab title while it runs. Open **Timer settings** to change the lengths, sound and notifications. Browser notifications are off by default and the permission prompt only appears when you turn them on.

The timer runs while the page is open. Reloading the page stops a running timer.

## How to customize

- **Colours and fonts:** edit the design tokens at the top of `style.css` (`:root` for light, `[data-theme="dark"]` for dark).
- **Timer defaults:** change `DEFAULT_SETTINGS` in `script.js`.
- **Sample tasks:** edit `seedDemoTasks()` in `script.js`.
- **Add a category:**
  1. Add an `<option>` to both selects in `index.html` (`#category-filter` and `#task-category`).
  2. Add it to `CATEGORIES` in `script.js`.
  3. Add a `--cat-yourname` colour and a `.tag[data-category="yourname"]` rule in `style.css`.
- **Storage key prefix:** change `STORAGE_KEYS` in `script.js`. The theme key is also read by the small inline script in the `<head>` of `index.html`, which applies the saved theme before the page paints, so update both.

## Testing notes

The app was tested in headless Chromium with automated scripts covering: adding, editing, deleting and completing tasks; validation; search, filters and sorting; statistics and progress; dark mode and persistence after reload; streak logic (consecutive days, gaps, month/year/leap-day boundaries); overdue detection; the Pomodoro timer (start, pause, resume, reset, completion, settings); corrupted-storage recovery; and layouts from 320 px to 1440 px wide with no horizontal scrolling and no console errors. It has not been tested in Firefox or Safari, but only standard, widely supported web features are used (the `<dialog>` element, CSS `color-mix()`, CSS grid).
