/* ==========================================================================
   Workout Tracker
   Reading order:
     1. The plan           the 4-day cycle (edit this to change your program)
     2. Saving and loading localStorage
     3. Workout math       volume, 1RM, personal records
     4. Starting/finishing a workout
     5. Screens            functions that build HTML for each screen
     6. Chart              the canvas line chart
     7. Backup             export and import
     8. Events             what happens when you tap or type
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. THE PLAN
   Each exercise slot has:
     options:  1 name, or 2 if you can choose ("bench press or dumbbell press")
     sets:     how many set rows to show the first time (3 or 4)
     superset: optional label; slots with one are shown as a linked pair
   Each option has its own history, because a bench press weight and a
   dumbbell press weight aren't comparable. An exercise that appears on two
   days (like Lateral Raise) shares one history across both.
   ========================================================================== */
const PLAN = [
  {
    id: 'push',
    name: 'Push',
    exercises: [
      { options: ['Bench Press', 'Dumbbell Press'], sets: 4 },
      { options: ['Overhead Press'], sets: 4 },
      { options: ['Incline Dumbbell Press'], sets: 3 },
      { options: ['Lateral Raise'], sets: 3 },
      { options: ['Tricep Pushdown'], sets: 3 },
    ],
  },
  {
    id: 'pull',
    name: 'Pull',
    exercises: [
      { options: ['Barbell Row', 'Cable Row'], sets: 4 },
      { options: ['Lat Pulldown', 'Pull-Up'], sets: 4 },
      { options: ['Face Pull'], sets: 3 },
      { options: ['Bicep Curl'], sets: 3 },
      { options: ['Rear Delt Fly'], sets: 3 },
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    exercises: [
      { options: ['Squat', 'Leg Press'], sets: 4 },
      { options: ['Romanian Deadlift'], sets: 4 },
      { options: ['Leg Curl'], sets: 3 },
      { options: ['Leg Extension'], sets: 3 },
      { options: ['Calf Raise'], sets: 4 },
    ],
  },
  {
    id: 'upper',
    name: 'Upper',
    exercises: [
      { options: ['Incline Press'], sets: 4 },
      { options: ['Chest-Supported Row'], sets: 4 },
      { options: ['Seated Dumbbell Shoulder Press'], sets: 3 },
      { options: ['Close-Grip Lat Pulldown'], sets: 3 },
      { options: ['Lateral Raise'], sets: 3 },
      { options: ['Bicep Curl'], sets: 3, superset: 'Superset with tricep extension' },
      { options: ['Tricep Extension'], sets: 3, superset: 'Superset with bicep curl' },
    ],
  },
];

const TOP_OF_REP_RANGE = 12; // Hitting this on every set earns the "add weight" hint.
const MIN_SET_ROWS = 3;
const MAX_SET_ROWS = 4;

/* ==========================================================================
   2. SAVING AND LOADING
   Everything lives in one object, saved as JSON under one localStorage key.

   data = {
     nextDayIndex: 0,          which day in PLAN is up next
     workouts: [               finished workouts, oldest first
       { id, date, dayId, exercises: [{ name, sets: [{ weight, reps }] }] }
     ],
     draft: null               the workout in progress (see section 4)
   }

   The key has a prefix because every project on your-name.github.io shares
   the same localStorage.
   ========================================================================== */
const STORAGE_KEY = 'workoutTracker.v1';

function loadData() {
  const empty = { nextDayIndex: 0, workouts: [], draft: null };
  try {
    return Object.assign(empty, JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (error) {
    return empty;
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    alert('Could not save. Your phone storage may be full or blocked.');
  }
}

const data = loadData();
// Stay inside the plan, even if you remove a day from PLAN later.
data.nextDayIndex %= PLAN.length;

// Temporary screen state. This isn't saved, so it resets when the app reopens.
const ui = {
  view: data.draft ? 'workout' : 'home',
  detailId: null,       // the workout shown on the detail screen
  justSaved: false,     // show the "workout saved" banner on the detail screen
  exercise: null,       // the exercise picked on the Progress screen
  metric: 'weight',     // the line shown on the chart
  selected: null,       // the chart point being inspected (null = latest)
};

/* ==========================================================================
   3. WORKOUT MATH
   ========================================================================== */

// Epley formula, rounded to 1 decimal so that 165.0 and 165.04 count as a tie.
function estimatedOneRepMax(weight, reps) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function heaviestWeight(sets) {
  return Math.max(...sets.map((set) => set.weight));
}

// Weight x reps added up across every set.
function totalVolume(sets) {
  return sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
}

function bestOneRepMax(sets) {
  return Math.max(...sets.map((set) => estimatedOneRepMax(set.weight, set.reps)));
}

// Every past session of one exercise, oldest first. Only workouts before
// `beforeDate` count, so an old workout is compared with what came before it.
function sessionsFor(name, beforeDate = Infinity) {
  const sessions = [];
  for (const workout of data.workouts) {
    if (workout.date >= beforeDate) continue;
    for (const exercise of workout.exercises) {
      if (exercise.name === name) sessions.push({ date: workout.date, sets: exercise.sets });
    }
  }
  return sessions.sort((a, b) => a.date - b.date);
}

function lastSession(name, beforeDate = Infinity) {
  return sessionsFor(name, beforeDate).pop() || null;
}

// True when every set reached the top of the rep range.
function hitTopOfRange(sets) {
  return sets.length > 0 && sets.every((set) => set.reps >= TOP_OF_REP_RANGE);
}

// Compares these sets with all earlier sessions. Returns the records beaten:
//   { weight, e1rm, reps: [{ weight, reps }], flags: [true/false per set], count }
// Your first session of an exercise has nothing to beat, so it sets no records.
// Records are calculated when needed and never stored, so editing or deleting
// a workout can't leave a wrong record behind.
function findRecords(name, sets, beforeDate = Infinity) {
  const records = { weight: null, e1rm: null, reps: [], flags: sets.map(() => false), count: 0 };
  const past = sessionsFor(name, beforeDate).flatMap((session) => session.sets);
  if (past.length === 0) return records;

  const bestWeight = heaviestWeight(past);
  const best1RM = bestOneRepMax(past);
  const bestRepsAt = {}; // example: { 135: 10, 145: 8 }
  for (const set of past) {
    bestRepsAt[set.weight] = Math.max(bestRepsAt[set.weight] || 0, set.reps);
  }

  const newRepsAt = {};
  sets.forEach((set, index) => {
    const e1rm = estimatedOneRepMax(set.weight, set.reps);
    const beatWeight = set.weight > bestWeight;
    const beat1RM = e1rm > best1RM;
    // A reps record needs an earlier set at this exact weight to compare with.
    const beatReps = set.weight in bestRepsAt && set.reps > bestRepsAt[set.weight];

    if (beatWeight) records.weight = Math.max(records.weight || 0, set.weight);
    if (beat1RM) records.e1rm = Math.max(records.e1rm || 0, e1rm);
    if (beatReps) newRepsAt[set.weight] = Math.max(newRepsAt[set.weight] || 0, set.reps);
    records.flags[index] = beatWeight || beat1RM || beatReps;
  });

  records.reps = Object.keys(newRepsAt).map((weight) => ({
    weight: Number(weight),
    reps: newRepsAt[weight],
  }));
  records.count = (records.weight ? 1 : 0) + (records.e1rm ? 1 : 0) + records.reps.length;
  return records;
}

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */

// Text from a saved or imported file must not be treated as HTML.
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;');
}

// 1234.56 becomes "1,234.6"
function num(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

// A weight of 0 means bodyweight, which suits exercises like pull-ups.
function formatWeight(weight) {
  return weight === 0 ? 'BW' : num(weight);
}

function formatSets(sets) {
  return sets.map((set) => `${formatWeight(set.weight)} x ${set.reps}`).join(', ');
}

function formatDate(time, options = { month: 'short', day: 'numeric' }) {
  return new Date(time).toLocaleDateString('en-US', options);
}

function formatFullDate(time) {
  return formatDate(time, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* ==========================================================================
   4. STARTING AND FINISHING A WORKOUT
   While you log, the workout lives in data.draft and is saved on every
   keystroke, so it survives the phone locking or the app closing.

   Input values stay as the text you typed. They only become numbers on
   finishing, or when loggedSets() needs them for a comparison.

   draft = {
     dayId, editingId, editingDate,     the editing fields are null for a new workout
     exercises: [{ name, options, superset, done, sets: [{ weight: '135', reps: '10' }] }]
   }
   ========================================================================== */

function dayById(dayId) {
  return PLAN.find((day) => day.id === dayId);
}

// Default to whichever option you did most recently.
function preferredOption(options) {
  let choice = options[0];
  let newest = -1;
  for (const option of options) {
    const last = lastSession(option);
    if (last && last.date > newest) {
      newest = last.date;
      choice = option;
    }
  }
  return choice;
}

// Builds one exercise's rows with last time's weight filled in. Reps stay
// blank, showing last time's number as a faint placeholder, so a filled-in
// reps box always means you really did that set today.
function prefilledSets(name, defaultCount, beforeDate) {
  const last = lastSession(name, beforeDate);
  let count = defaultCount;
  if (last) count = Math.min(MAX_SET_ROWS, Math.max(MIN_SET_ROWS, last.sets.length));

  const rows = [];
  for (let i = 0; i < count; i++) {
    // If last time had fewer sets, repeat its final weight.
    const source = last ? last.sets[i] || last.sets[last.sets.length - 1] : null;
    rows.push({ weight: source ? String(source.weight) : '', reps: '' });
  }
  return rows;
}

function startWorkout(dayId) {
  if (hasEnteredReps() && !confirm('Replace the workout in progress? Its entries will be lost.')) return;

  data.draft = {
    dayId,
    editingId: null,
    editingDate: null,
    exercises: dayById(dayId).exercises.map((slot) => {
      const name = preferredOption(slot.options);
      return {
        name,
        options: slot.options,
        superset: slot.superset || null,
        defaultSets: slot.sets,
        done: false,
        sets: prefilledSets(name, slot.sets),
      };
    }),
  };
  saveData();
  navigate('workout');
}

// Reopens a saved workout in the logging screen to fix a mistake.
function editWorkout(id) {
  if (hasEnteredReps() && !confirm('Replace the workout in progress? Its entries will be lost.')) return;

  const workout = data.workouts.find((item) => item.id === id);
  const remaining = [...workout.exercises];

  const toRows = (sets) => {
    const rows = sets.map((set) => ({ weight: String(set.weight), reps: String(set.reps) }));
    while (rows.length < MIN_SET_ROWS) rows.push({ weight: '', reps: '' });
    return rows;
  };

  // Follow the plan's order, including any exercise you skipped that day.
  const day = dayById(workout.dayId);
  const slots = day ? day.exercises : [];
  const exercises = slots.map((slot) => {
    const index = remaining.findIndex((item) => slot.options.includes(item.name));
    const saved = index >= 0 ? remaining.splice(index, 1)[0] : null;
    const name = saved ? saved.name : slot.options[0];
    return {
      name,
      options: slot.options,
      superset: slot.superset || null,
      defaultSets: slot.sets,
      done: Boolean(saved),
      sets: saved ? toRows(saved.sets) : prefilledSets(name, slot.sets, workout.date),
    };
  });

  // Keep anything that isn't in the plan, such as from an imported backup.
  for (const extra of remaining) {
    exercises.push({
      name: extra.name,
      options: [extra.name],
      superset: null,
      defaultSets: MIN_SET_ROWS,
      done: true,
      sets: toRows(extra.sets),
    });
  }

  data.draft = {
    dayId: workout.dayId,
    editingId: workout.id,
    editingDate: workout.date,
    exercises,
  };
  saveData();
  navigate('workout');
}

// Turns one exercise's input text into numbers, keeping only sets with reps.
// Reps with a blank weight are saved as weight 0 (bodyweight).
function loggedSets(exercise) {
  const sets = [];
  for (const row of exercise.sets) {
    const reps = parseInt(row.reps, 10);
    const weight = parseFloat(String(row.weight).replace(',', '.'));
    if (reps > 0) sets.push({ weight: weight > 0 ? weight : 0, reps });
  }
  return sets;
}

function hasEnteredReps() {
  return Boolean(data.draft) && data.draft.exercises.some((ex) => loggedSets(ex).length > 0);
}

function finishWorkout() {
  const draft = data.draft;
  const exercises = draft.exercises
    .map((ex) => ({ name: ex.name, sets: loggedSets(ex) }))
    .filter((ex) => ex.sets.length > 0);

  if (exercises.length === 0) {
    alert('Enter reps for at least one set before finishing.');
    return;
  }

  const skipped = draft.exercises.length - exercises.length;
  if (skipped > 0) {
    const noun = skipped === 1 ? '1 exercise has' : `${skipped} exercises have`;
    if (!confirm(`${noun} no reps entered and won't be saved. Finish anyway?`)) return;
  }

  let id;
  if (draft.editingId) {
    // Fixing an old workout changes its sets but not its date or the cycle.
    id = draft.editingId;
    data.workouts.find((item) => item.id === id).exercises = exercises;
  } else {
    id = String(Date.now());
    data.workouts.push({ id, date: Date.now(), dayId: draft.dayId, exercises });
    // The cycle continues from the day you just did, even if you picked it by hand.
    const finishedIndex = PLAN.findIndex((day) => day.id === draft.dayId);
    data.nextDayIndex = (finishedIndex + 1) % PLAN.length;
    ui.justSaved = true;
  }

  data.draft = null;
  saveData();
  ui.detailId = id;
  navigate('detail');
}

function discardDraft() {
  const editing = data.draft.editingId;
  if (hasEnteredReps() && !confirm(editing ? 'Discard your changes?' : 'Discard this workout?')) return;
  data.draft = null;
  saveData();
  if (editing) {
    ui.detailId = editing;
    navigate('detail');
  } else {
    navigate('home');
  }
}

function deleteWorkout(id) {
  if (!confirm('Delete this workout permanently?')) return;
  data.workouts = data.workouts.filter((item) => item.id !== id);
  saveData();
  navigate('history');
}

// The date that limits "earlier" comparisons for the workout being logged.
function draftCutoff() {
  return data.draft.editingDate || Infinity;
}

/* ==========================================================================
   5. SCREENS
   Each function returns a string of HTML. render() puts it on the page.
   ========================================================================== */
const app = document.getElementById('app');

function render() {
  if (ui.view === 'home') app.innerHTML = homeHTML();
  if (ui.view === 'workout') app.innerHTML = workoutHTML();
  if (ui.view === 'progress') {
    app.innerHTML = progressHTML();
    setUpChart();
  }
  if (ui.view === 'history') app.innerHTML = historyHTML();
  if (ui.view === 'detail') app.innerHTML = detailHTML();

  // Light up the tab that this screen belongs to.
  const activeTab = { home: 'home', workout: 'home', progress: 'progress', history: 'history', detail: 'history' }[ui.view];
  document.querySelectorAll('.tab').forEach((tab) => {
    const isActive = tab.dataset.tab === activeTab;
    tab.classList.toggle('active', isActive);
    if (isActive) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function navigate(view) {
  ui.view = view;
  window.scrollTo(0, 0);
  render();
}

/* --- Home ---------------------------------------------------------------- */
function homeHTML() {
  const next = PLAN[data.nextDayIndex];

  const dayButtons = PLAN.map((day) => {
    const isNext = day.id === next.id;
    const past = data.workouts.filter((workout) => workout.dayId === day.id).pop();
    const note = past ? `Last: ${formatDate(past.date)}` : 'Not done yet';
    return `
      <button type="button" class="day-btn ${isNext ? 'is-next' : ''}" data-action="startDay" data-day="${day.id}">
        <strong>${day.name}</strong>
        <span>${isNext ? 'Next up · ' : ''}${note}</span>
      </button>`;
  }).join('');

  const exerciseList = next.exercises
    .map((slot) => `<li>${esc(slot.options.join(' or '))}</li>`)
    .join('');

  // A workout in progress takes over the main button, so it can't get lost.
  let mainButton = `<button type="button" class="btn primary" data-action="startDay" data-day="${next.id}">Start ${next.name}</button>`;
  if (data.draft) {
    const label = data.draft.editingId ? 'Resume editing' : 'Resume';
    mainButton = `<button type="button" class="btn primary" data-action="resume">${label} ${esc(dayName(data.draft.dayId))}</button>`;
  }

  return `
    <section class="day-hero">
      <p class="eyebrow">Next up</p>
      <div class="next-day-name">${next.name}</div>
      <ul class="plain-list">${exerciseList}</ul>
    </section>
    <h2>Or pick a different day</h2>
    <div class="day-grid">${dayButtons}</div>
    <div class="action-bar">${mainButton}</div>`;
}

/* --- Logging ------------------------------------------------------------- */
function workoutHTML() {
  const draft = data.draft;
  const cards = draft.exercises.map((exercise, index) => exerciseCardHTML(exercise, index)).join('');
  const editing = Boolean(draft.editingId);

  return `
    <section class="day-hero">
      <h1>${esc(dayName(draft.dayId))}</h1>
      <p class="muted" id="done-count">${doneCountText()}</p>
      ${editing ? `<p class="muted small">Editing ${formatFullDate(draft.editingDate)}</p>` : ''}
    </section>
    ${cards}
    <div class="spaced">
      <button type="button" class="btn primary" data-action="finish">${editing ? 'Save changes' : 'Finish workout'}</button>
      <button type="button" class="btn quiet" data-action="discard">${editing ? 'Discard changes' : 'Discard workout'}</button>
    </div>`;
}

function doneCountText() {
  const list = data.draft.exercises;
  return `${list.filter((ex) => ex.done).length} of ${list.length} exercises done`;
}

function exerciseCardHTML(exercise, index) {
  const last = lastSession(exercise.name, draftCutoff());
  const lastText = last ? `Last: ${formatSets(last.sets)}` : 'Last: nothing logged yet';

  // Only exercises with a choice get the option buttons.
  let optionButtons = '';
  if (exercise.options.length > 1) {
    const buttons = exercise.options.map((option) => `
      <button type="button" class="option ${option === exercise.name ? 'selected' : ''}"
        aria-pressed="${option === exercise.name}"
        data-action="pickOption" data-ex="${index}" data-option="${esc(option)}">${esc(option)}</button>`).join('');
    optionButtons = `<div class="options">${buttons}</div>`;
  }

  const rows = exercise.sets.map((set, setIndex) => {
    // Last time's reps show as a faint placeholder to aim for. The placeholder
    // is never empty, because style.css uses it to spot a set with no reps yet.
    const repsGoal = last && last.sets[setIndex] ? last.sets[setIndex].reps : '–';
    return `
      <div class="set-row">
        <div class="set-num">${setIndex + 1}</div>
        <input inputmode="decimal" autocomplete="off" aria-label="Set ${setIndex + 1} weight in pounds"
          data-ex="${index}" data-set="${setIndex}" data-field="weight" value="${esc(set.weight)}">
        <div class="times">×</div>
        <input inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Set ${setIndex + 1} reps"
          data-ex="${index}" data-set="${setIndex}" data-field="reps" value="${esc(set.reps)}" placeholder="${repsGoal}">
      </div>`;
  }).join('');

  const canAdd = exercise.sets.length < MAX_SET_ROWS;
  const canRemove = exercise.sets.length > MIN_SET_ROWS;
  const setButton = canAdd
    ? `<button type="button" class="btn quiet add-set" data-action="addSet" data-ex="${index}">+ Add a set</button>`
    : canRemove
      ? `<button type="button" class="btn quiet add-set" data-action="removeSet" data-ex="${index}">− Remove last set</button>`
      : '';

  return `
    <section class="card exercise ${exercise.done ? 'is-done' : ''} ${exercise.superset ? 'superset' : ''}" id="exercise-${index}">
      <div class="exercise-head">
        <label class="check">
          <input type="checkbox" aria-label="${esc(exercise.name)} done" data-ex="${index}" data-field="done" ${exercise.done ? 'checked' : ''}>
        </label>
        <div class="exercise-title">
          ${exercise.superset ? `<span class="tag">${esc(exercise.superset)}</span>` : ''}
          <h3>${esc(exercise.name)}</h3>
        </div>
      </div>
      ${optionButtons}
      <p class="last">${esc(lastText)}</p>
      <div class="set-labels"><span></span><span>Weight (lbs)</span><span></span><span>Reps</span></div>
      ${rows}
      ${setButton}
      <div class="status">${statusHTML(exercise)}</div>
    </section>`;
}

// The hints and chips below an exercise's inputs. This re-runs as you type.
function statusHTML(exercise) {
  const cutoff = draftCutoff();
  const last = lastSession(exercise.name, cutoff);
  const sets = loggedSets(exercise);

  // Before you start: did last session already earn more weight?
  if (sets.length === 0) {
    if (exercise.done) return '<span class="chip down">Enter reps to log this exercise</span>';
    if (last && hitTopOfRange(last.sets)) {
      return `<span class="hint">⬆ Ready to add weight: you hit ${TOP_OF_REP_RANGE} on every set last time</span>`;
    }
    return '';
  }

  let html = '';
  // Every row must be filled, so a half-finished exercise can't trigger it.
  const allRowsFilled = sets.length === exercise.sets.length;
  if (allRowsFilled && hitTopOfRange(sets)) {
    html += `<span class="hint">⬆ Ready to add weight next time: ${TOP_OF_REP_RANGE}+ on every set</span>`;
  }
  html += recordBadgesHTML(findRecords(exercise.name, sets, cutoff));
  // The comparison waits until the exercise is ticked, because volume always
  // looks "down" partway through.
  if (exercise.done) html += comparisonHTML(sets, last);
  return html;
}

// Weight up/same/down and volume up/same/down, compared with last session.
function comparisonHTML(sets, last) {
  if (!last) return '<span class="chip same">First session: this is your baseline</span>';

  const chip = (label, difference) => {
    if (difference > 0) return `<span class="chip up">▲ ${label} +${num(difference)} lb</span>`;
    if (difference < 0) return `<span class="chip down">▼ ${label} −${num(-difference)} lb</span>`;
    return `<span class="chip same">= ${label} same</span>`;
  };

  return chip('Weight', heaviestWeight(sets) - heaviestWeight(last.sets))
       + chip('Volume', totalVolume(sets) - totalVolume(last.sets));
}

function recordBadgesHTML(records) {
  let html = '';
  if (records.weight) html += `<span class="badge">🏆 Weight PR: ${num(records.weight)} lb</span>`;
  if (records.e1rm) html += `<span class="badge">🏆 1RM PR: ${num(records.e1rm)} lb</span>`;
  for (const record of records.reps) {
    html += `<span class="badge">🏆 Reps PR: ${formatWeight(record.weight)} x ${record.reps}</span>`;
  }
  return html;
}

/* --- History ------------------------------------------------------------- */
function historyHTML() {
  const rows = [...data.workouts].sort((a, b) => b.date - a.date).map((workout) => {
    const allSets = workout.exercises.flatMap((exercise) => exercise.sets);
    const recordCount = workout.exercises.reduce(
      (sum, exercise) => sum + findRecords(exercise.name, exercise.sets, workout.date).count, 0);
    return `
      <button type="button" class="history-row" data-action="openWorkout" data-id="${esc(workout.id)}">
        <span>
          <strong>${esc(dayName(workout.dayId))}</strong>
          <span class="muted small">${formatFullDate(workout.date)}<br>
          ${workout.exercises.length} exercises · ${allSets.length} sets · ${num(totalVolume(allSets))} lb</span>
        </span>
        ${recordCount > 0 ? `<span class="badge">🏆 ${recordCount}</span>` : ''}
      </button>`;
  }).join('');

  return `
    <h1>History</h1>
    ${rows || '<p class="muted spaced">Finished workouts will show up here.</p>'}
    <h2>Backup</h2>
    <p class="muted small">Your workouts are stored only on this phone. Export a copy now and then to keep them safe.</p>
    <div class="spaced">
      <button type="button" class="btn" data-action="exportData">Export backup</button>
      <label class="btn" for="import-file">Import backup</label>
      <input class="file-input" id="import-file" type="file" accept=".json,application/json" data-field="import">
    </div>`;
}

function dayName(dayId) {
  const day = dayById(dayId);
  return day ? day.name : dayId;
}

function detailHTML() {
  const workout = data.workouts.find((item) => item.id === ui.detailId);
  if (!workout) return historyHTML();

  const cards = workout.exercises.map((exercise) => {
    const records = findRecords(exercise.name, exercise.sets, workout.date);
    const previous = lastSession(exercise.name, workout.date);
    const setRows = exercise.sets.map((set, index) => `
      <li>
        <span><span class="muted">${index + 1}.</span> ${formatWeight(set.weight)} × ${set.reps}</span>
        <span>${records.flags[index] ? '🏆' : ''}</span>
      </li>`).join('');
    return `
      <section class="card">
        <h3>${esc(exercise.name)}</h3>
        <ul class="set-list">${setRows}</ul>
        <div class="status">${recordBadgesHTML(records)}${comparisonHTML(exercise.sets, previous)}</div>
      </section>`;
  }).join('');

  const allSets = workout.exercises.flatMap((exercise) => exercise.sets);
  const banner = ui.justSaved
    ? `<div class="saved-banner">Workout saved. Next up: ${PLAN[data.nextDayIndex].name}</div>`
    : '';
  ui.justSaved = false; // Show the banner once.

  return `
    <button type="button" class="back" data-action="goTab" data-tab="history">‹ History</button>
    <h1>${esc(dayName(workout.dayId))}</h1>
    <p class="muted">${formatFullDate(workout.date)} · ${num(totalVolume(allSets))} lb total</p>
    ${banner}
    ${cards}
    <div class="spaced">
      <button type="button" class="btn" data-action="editWorkout" data-id="${esc(workout.id)}">Edit workout</button>
      <button type="button" class="btn danger" data-action="deleteWorkout" data-id="${esc(workout.id)}">Delete workout</button>
    </div>`;
}

/* --- Progress ------------------------------------------------------------ */
const METRICS = {
  weight: { label: 'Heaviest set' },
  volume: { label: 'Total volume' },
  e1rm: { label: 'Est. 1RM' },
};

// Every exercise in the plan, plus any that exist only in history.
function allExerciseNames() {
  const names = new Set();
  PLAN.forEach((day) => day.exercises.forEach((slot) => slot.options.forEach((option) => names.add(option))));
  data.workouts.forEach((workout) => workout.exercises.forEach((exercise) => names.add(exercise.name)));
  return [...names].sort();
}

// One point per session, with every metric and whether it set a new best.
function progressPoints(name) {
  const best = { weight: 0, volume: 0, e1rm: 0 };
  return sessionsFor(name).map((session, index) => {
    const point = {
      date: session.date,
      weight: heaviestWeight(session.sets),
      volume: totalVolume(session.sets),
      e1rm: bestOneRepMax(session.sets),
      isBest: {},
    };
    for (const metric of Object.keys(METRICS)) {
      // The first session is the baseline, so it can't be a new best.
      point.isBest[metric] = index > 0 && point[metric] > best[metric];
      best[metric] = Math.max(best[metric], point[metric]);
    }
    return point;
  });
}

function defaultProgressExercise() {
  const newest = data.workouts[data.workouts.length - 1];
  return newest && newest.exercises[0] ? newest.exercises[0].name : allExerciseNames()[0];
}

function progressHTML() {
  if (!ui.exercise) ui.exercise = defaultProgressExercise();

  const options = allExerciseNames().map((name) =>
    `<option value="${esc(name)}" ${name === ui.exercise ? 'selected' : ''}>${esc(name)}</option>`).join('');
  const points = progressPoints(ui.exercise);

  const header = `
    <h1>Progress</h1>
    <div class="spaced">
      <select class="select" aria-label="Exercise" data-field="exercise">${options}</select>
    </div>`;

  if (points.length === 0) {
    return `${header}<p class="muted spaced">No sessions logged for this exercise yet.</p>`;
  }

  // Each metric button also shows your all-time best for that metric.
  const metricButtons = Object.keys(METRICS).map((metric) => {
    const best = Math.max(...points.map((point) => point[metric]));
    return `
      <button type="button" class="metric ${metric === ui.metric ? 'selected' : ''}"
        aria-pressed="${metric === ui.metric}" data-action="pickMetric" data-metric="${metric}">
        <span>${METRICS[metric].label}</span>
        <strong>${metric === 'weight' ? formatWeight(best) : num(best)}</strong>
      </button>`;
  }).join('');

  const tableRows = [...points].reverse().map((point) => {
    const cell = (metric) => `${point.isBest[metric] ? '<span class="diamond" title="New best"></span>' : ''}${metric === 'weight' ? formatWeight(point.weight) : num(point[metric])}`;
    return `<tr><td>${formatDate(point.date, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
      <td>${cell('weight')}</td><td>${cell('volume')}</td><td>${cell('e1rm')}</td></tr>`;
  }).join('');

  const hasBest = points.some((point) => point.isBest[ui.metric]);

  return `
    ${header}
    <div class="metric-grid">${metricButtons}</div>
    <section class="card">
      <div class="readout" id="readout"></div>
      <canvas id="chart" role="img"
        aria-label="${METRICS[ui.metric].label} for ${esc(ui.exercise)} over time. Every value is in the table below."></canvas>
      ${hasBest ? '<p class="chart-key"><span class="diamond"></span>New best</p>' : ''}
    </section>
    <section class="card">
      <table>
        <thead><tr><th>Date</th><th>Heaviest</th><th>Volume</th><th>1RM</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>`;
}

/* ==========================================================================
   6. CHART
   A small line chart drawn with canvas. Drawing it by hand means there's no
   library to download, so it also works with no signal at the gym. Each
   metric gets its own view because weight and volume have very different
   scales and can't share one axis.
   ========================================================================== */
const CHART = {
  surface: '#26231F',   // same as --surface in style.css
  grid: '#3F3930',
  text: '#A89C85',
  line: '#D9732B',      // burnt orange
  best: '#F1E8D6',      // cream, on the diamonds marking a new best
  pad: { top: 12, right: 12, bottom: 26, left: 48 },
};

function setUpChart() {
  const canvas = document.getElementById('chart');
  if (!canvas) return;

  // A tap or horizontal drag selects the nearest session.
  const selectFromPointer = (event) => {
    const points = progressPoints(ui.exercise);
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const scaleX = chartScaleX(points, rect.width);
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(scaleX(point.date) - x) < Math.abs(scaleX(points[nearest].date) - x)) nearest = index;
    });
    ui.selected = nearest;
    drawChart();
  };
  canvas.addEventListener('pointerdown', selectFromPointer);
  canvas.addEventListener('pointermove', (event) => {
    if (event.buttons > 0 || event.pointerType === 'touch') selectFromPointer(event);
  });

  drawChart();
}

// Returns a function that converts a date to an x position in the chart.
function chartScaleX(points, width) {
  const { left, right } = CHART.pad;
  const first = points[0].date;
  const last = points[points.length - 1].date;
  if (first === last) return () => left + (width - left - right) / 2;
  return (date) => left + ((date - first) / (last - first)) * (width - left - right);
}

// Picks round axis numbers, such as 100, 150, 200.
function niceTicks(min, max) {
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const roughStep = range / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const multiple = [1, 2, 2.5, 5, 10].find((option) => option * magnitude >= roughStep);
  const step = Math.max(multiple * magnitude, 1); // Whole numbers only on the axis.

  // If every value is the same, widen the axis so the line sits mid-chart.
  const low = max === min ? Math.max(0, min - step) : min;
  const high = max === min ? max + step : max;
  const ticks = [];
  const start = Math.floor(low / step) * step;
  for (let value = start; value < high + step * 0.999; value += step) ticks.push(value);
  return ticks;
}

function formatTick(value) {
  return value >= 10000 ? `${num(value / 1000)}K` : num(value);
}

function drawChart() {
  const canvas = document.getElementById('chart');
  if (!canvas) return;

  const points = progressPoints(ui.exercise);
  const metric = ui.metric;
  const selected = ui.selected === null || ui.selected >= points.length ? points.length - 1 : ui.selected;

  // Sharp drawing on an iPhone screen: size the canvas in physical pixels,
  // then keep drawing in normal CSS pixels.
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const { top, bottom, left } = CHART.pad;
  const plotBottom = rect.height - bottom;
  const plotRight = rect.width - CHART.pad.right;

  const values = points.map((point) => point[metric]);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const scaleX = chartScaleX(points, rect.width);
  const scaleY = (value) => plotBottom - ((value - low) / (high - low)) * (plotBottom - top);

  // Grid lines and y-axis labels
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const tick of ticks) {
    const y = Math.round(scaleY(tick)) + 0.5;
    ctx.strokeStyle = CHART.grid;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillStyle = CHART.text;
    ctx.fillText(formatTick(tick), left - 8, y);
  }

  // X-axis date labels: the first and last dates, plus the middle if there's room.
  ctx.textBaseline = 'alphabetic';
  const first = points[0].date;
  const last = points[points.length - 1].date;
  const label = (date, x, align) => {
    ctx.textAlign = align;
    ctx.fillText(formatDate(date), x, rect.height - 6);
  };
  if (first === last) {
    label(first, scaleX(first), 'center');
  } else {
    label(first, left, 'left');
    label(last, plotRight, 'right');
    const middle = (first + last) / 2;
    if (formatDate(middle) !== formatDate(first) && formatDate(middle) !== formatDate(last)) {
      label(middle, (left + plotRight) / 2, 'center');
    }
  }

  // Marker line for the selected session
  const selectedX = scaleX(points[selected].date);
  ctx.strokeStyle = CHART.text;
  ctx.beginPath();
  ctx.moveTo(Math.round(selectedX) + 0.5, top);
  ctx.lineTo(Math.round(selectedX) + 0.5, plotBottom);
  ctx.stroke();

  // The data line
  ctx.strokeStyle = CHART.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = scaleX(point.date);
    const y = scaleY(point[metric]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots. Records are diamonds, so they don't rely on color alone. A dark ring
  // keeps each one readable where it crosses the line.
  const showAllDots = points.length <= 40;
  points.forEach((point, index) => {
    const isBest = point.isBest[metric];
    const isSelected = index === selected;
    if (!showAllDots && !isBest && !isSelected) return;

    const x = scaleX(point.date);
    const y = scaleY(point[metric]);
    const radius = (isBest ? 6 : 4) + (isSelected ? 1.5 : 0);

    const shape = (size) => {
      ctx.beginPath();
      if (isBest) {
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
      } else {
        ctx.arc(x, y, size, 0, Math.PI * 2);
      }
    };
    shape(radius + 2);
    ctx.fillStyle = CHART.surface;
    ctx.fill();
    shape(radius);
    ctx.fillStyle = isBest ? CHART.best : CHART.line;
    ctx.fill();
  });

  // The readout sits above the chart so your thumb doesn't cover it.
  const point = points[selected];
  const value = metric === 'weight' ? formatWeight(point.weight) : num(point[metric]);
  const unit = metric === 'weight' && point.weight === 0 ? '' : ' lb';
  document.getElementById('readout').textContent =
    `${formatDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}: ${METRICS[metric].label} ${value}${unit}${point.isBest[metric] ? ' (new best)' : ''}`;
}

/* ==========================================================================
   7. BACKUP
   The share sheet lets you save to Files on an iPhone. Browsers without it
   get a normal download.
   ========================================================================== */
async function exportData() {
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `workout-backup-${stamp}.json`;
  const contents = JSON.stringify(data, null, 2);
  const file = new File([contents], fileName, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
    } catch (error) {
      // Closing the share sheet counts as an error, and there's nothing to do.
    }
    return;
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Checks a backup's shape before it can replace anything.
function isValidBackup(backup) {
  return Boolean(backup) && Array.isArray(backup.workouts) && backup.workouts.every((workout) =>
    typeof workout.id === 'string'
    && typeof workout.dayId === 'string'
    && typeof workout.date === 'number'
    && Array.isArray(workout.exercises)
    && workout.exercises.every((exercise) =>
      typeof exercise.name === 'string'
      && Array.isArray(exercise.sets)
      && exercise.sets.length > 0
      && exercise.sets.every((set) => typeof set.weight === 'number' && typeof set.reps === 'number')));
}

async function importData(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (error) {
    backup = null;
  }
  if (!isValidBackup(backup)) {
    alert('That file is not a valid workout backup. Nothing was changed.');
    return;
  }
  if (!confirm(`Replace everything on this phone with ${backup.workouts.length} workouts from the backup?`)) return;

  data.workouts = backup.workouts;
  const nextIndex = Number(backup.nextDayIndex);
  data.nextDayIndex = nextIndex >= 0 && nextIndex < PLAN.length ? nextIndex : 0;
  data.draft = null;
  ui.exercise = null;
  saveData();
  navigate('history');
}

/* ==========================================================================
   8. EVENTS
   One listener on the whole page. Any tappable element names its handler in
   a data-action attribute, and the matching function below runs.
   ========================================================================== */
const actions = {
  goTab(dataset) {
    // The Workout tab returns to a workout in progress.
    navigate(dataset.tab === 'home' && data.draft ? 'workout' : dataset.tab);
  },
  startDay(dataset) { startWorkout(dataset.day); },
  resume() { navigate('workout'); },
  finish() { finishWorkout(); },
  discard() { discardDraft(); },
  pickOption(dataset) {
    const exercise = data.draft.exercises[dataset.ex];
    exercise.name = dataset.option;
    // Rows you've already logged stay. The rest load this option's last weights.
    const fresh = prefilledSets(exercise.name, exercise.defaultSets, draftCutoff());
    const kept = exercise.sets.filter((row) => row.reps !== '');
    exercise.sets = kept.concat(fresh.slice(kept.length));
    refreshCard(dataset.ex);
  },
  addSet(dataset) {
    const rows = data.draft.exercises[dataset.ex].sets;
    // Start the new row with the weight from the row above.
    rows.push({ weight: rows[rows.length - 1].weight, reps: '' });
    refreshCard(dataset.ex);
  },
  removeSet(dataset) {
    data.draft.exercises[dataset.ex].sets.pop();
    refreshCard(dataset.ex);
  },
  openWorkout(dataset) {
    ui.detailId = dataset.id;
    navigate('detail');
  },
  editWorkout(dataset) { editWorkout(dataset.id); },
  deleteWorkout(dataset) { deleteWorkout(dataset.id); },
  pickMetric(dataset) {
    ui.metric = dataset.metric;
    render();
  },
  exportData() { exportData(); },
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (target) actions[target.dataset.action](target.dataset);
});

// Redraws one exercise card. Redrawing the whole screen would scroll the page
// and close the keyboard.
function refreshCard(index) {
  document.getElementById(`exercise-${index}`).outerHTML =
    exerciseCardHTML(data.draft.exercises[index], Number(index));
  document.getElementById('done-count').textContent = doneCountText();
  saveData();
}

// Runs on every keystroke in a weight or reps box.
document.addEventListener('input', (event) => {
  const { ex, set, field } = event.target.dataset;
  if (field !== 'weight' && field !== 'reps') return;

  const exercise = data.draft.exercises[ex];
  exercise.sets[set][field] = event.target.value;

  // Tick the exercise once every set has reps.
  if (loggedSets(exercise).length === exercise.sets.length) exercise.done = true;
  updateCardStatus(ex);
  saveData();
});

// Updates a card's hints in place, leaving the input you're typing in alone.
function updateCardStatus(index) {
  const exercise = data.draft.exercises[index];
  const card = document.getElementById(`exercise-${index}`);
  card.querySelector('.status').innerHTML = statusHTML(exercise);
  card.classList.toggle('is-done', exercise.done);
  card.querySelector('[data-field="done"]').checked = exercise.done;
  document.getElementById('done-count').textContent = doneCountText();
}

// Runs when a checkbox, dropdown or file picker changes, or when you leave a
// weight box.
document.addEventListener('change', (event) => {
  const { ex, set, field } = event.target.dataset;

  if (field === 'done') {
    data.draft.exercises[ex].done = event.target.checked;
    updateCardStatus(ex);
    saveData();
  }

  // First time on an exercise: copy a weight down to the blank rows below it,
  // so you only type it once. Rows that already hold a weight aren't touched.
  if (field === 'weight' && event.target.value !== '') {
    const rows = data.draft.exercises[ex].sets;
    for (let i = Number(set) + 1; i < rows.length; i++) {
      if (rows[i].weight === '') {
        rows[i].weight = event.target.value;
        document.querySelector(`[data-ex="${ex}"][data-set="${i}"][data-field="weight"]`).value = event.target.value;
      }
    }
    saveData();
  }

  if (field === 'exercise') {
    ui.exercise = event.target.value;
    ui.selected = null;
    render();
  }

  if (field === 'import' && event.target.files[0]) {
    importData(event.target.files[0]);
    event.target.value = ''; // Allows picking the same file again.
  }
});

// Tapping a box selects its contents, so typing replaces a pre-filled weight.
document.addEventListener('focusin', (event) => {
  if (event.target.matches('.set-row input')) event.target.select();
});

// Rotating the phone changes the chart's width, so redraw it.
window.addEventListener('resize', drawChart);

/* ==========================================================================
   START THE APP
   ========================================================================== */
render();

// Registers the service worker that makes the app work offline. The relative
// path matters: on GitHub Pages the app lives at /WorkoutTracker/, not /.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // The app still works online without it.
  });
}
