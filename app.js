/* ==========================================================================
   Workout Tracker
   Reading order:
     1. The plan           the 4-day cycle and the swap lists (edit these freely)
     2. Saving and loading localStorage, plus upgrading older saved data
     3. Units              lbs and kg
     4. Workout math       volume, 1RM, personal records
     5. Cycle and calendar what's next, sessions this week
     6. Logging            starting, editing and finishing a workout
     7. Screens            functions that build HTML for each screen
     8. Bottom sheets      Replace, Finish and Bodyweight
     9. Charts             the canvas line charts
    10. Backup             export and import
    11. Events             what happens when you tap or type
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. THE PLAN
   Each exercise slot has:
     options:  1 name, or 2 if you can choose ("bench press or dumbbell press")
     sets:     how many set rows to show the first time (3 or 4)
     superset: optional label; slots with one are shown as a linked pair
   Each exercise name has its own history. A name that appears on two days
   (like Lateral Raise) shares one history across both.
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

// The alternatives offered by the Replace button, grouped by movement pattern.
// Every exercise in PLAN must appear in one of these lists.
const PATTERNS = {
  'Horizontal push': ['Bench Press', 'Dumbbell Press', 'Incline Press', 'Incline Dumbbell Press', 'Machine Chest Press', 'Push-Up', 'Dip'],
  'Vertical push': ['Overhead Press', 'Seated Dumbbell Shoulder Press', 'Arnold Press', 'Machine Shoulder Press', 'Landmine Press'],
  'Horizontal pull': ['Barbell Row', 'Cable Row', 'Chest-Supported Row', 'Dumbbell Row', 'Machine Row', 'T-Bar Row'],
  'Vertical pull': ['Lat Pulldown', 'Pull-Up', 'Close-Grip Lat Pulldown', 'Chin-Up', 'Assisted Pull-Up'],
  'Knee-dominant legs': ['Squat', 'Leg Press', 'Leg Extension', 'Hack Squat', 'Goblet Squat', 'Bulgarian Split Squat', 'Lunge'],
  'Hip hinge': ['Romanian Deadlift', 'Leg Curl', 'Deadlift', 'Hip Thrust', 'Good Morning', 'Back Extension'],
  'Delts': ['Lateral Raise', 'Face Pull', 'Rear Delt Fly', 'Cable Lateral Raise', 'Machine Lateral Raise', 'Reverse Pec Deck'],
  'Biceps': ['Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl', 'Incline Dumbbell Curl'],
  'Triceps': ['Tricep Pushdown', 'Tricep Extension', 'Overhead Tricep Extension', 'Skull Crusher', 'Close-Grip Bench Press'],
  'Calves': ['Calf Raise', 'Seated Calf Raise', 'Leg Press Calf Raise'],
};

const TOP_OF_REP_RANGE = 12; // Hitting this on every set earns the "add weight" hint.
const MIN_SET_ROWS = 3;
const MAX_SET_ROWS = 4;
const SESSIONS_PER_WEEK = 4;
const NUDGE_AFTER_DAYS = 3;  // Show the gentle "Next up" message after this many days.
const BACKUP_AFTER_DAYS = 30;
const WEIGHT_STEPS = [2.5, 5, 10];

/* ==========================================================================
   2. SAVING AND LOADING
   Everything lives in one object, saved as JSON under one localStorage key.

   data = {
     workouts: [               finished workouts, oldest first
       { id, date, dayId, exercises: [{ name, slot, note, sets: [{ weight, reps }] }] }
     ],
     bodyweight: [             oldest first; date is 'YYYY-MM-DD'
       { id, date, weight }
     ],
     settings: { weightStep, units },
     lastExportDate: null,     'YYYY-MM-DD' of the last backup
     draft: null               the workout in progress (see section 6)
   }

   Saved weights are always in pounds. Section 3 converts them for display.

   The key keeps its original name so existing workouts carry over. It has a
   prefix because every project on your-name.github.io shares localStorage.
   ========================================================================== */
const STORAGE_KEY = 'workoutTracker.v1';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// Fills in anything missing from older saved data or backups.
function normalizeData(raw) {
  const source = isObject(raw) ? raw : {};
  const settings = isObject(source.settings) ? source.settings : {};
  return {
    workouts: (Array.isArray(source.workouts) ? source.workouts : [])
      .slice()
      .sort((a, b) => a.date - b.date),
    bodyweight: (Array.isArray(source.bodyweight) ? source.bodyweight : [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)),
    settings: {
      weightStep: WEIGHT_STEPS.includes(settings.weightStep) ? settings.weightStep : 5,
      units: settings.units === 'kg' ? 'kg' : 'lbs',
    },
    lastExportDate: isDateString(source.lastExportDate) ? source.lastExportDate : null,
    draft: normalizeDraft(source.draft),
  };
}

// Returns a usable draft, or null if there isn't one. Older drafts had no tick
// on each set, so any set with reps entered counts as completed.
function normalizeDraft(draft) {
  if (!isObject(draft) || typeof draft.dayId !== 'string' || !Array.isArray(draft.exercises)) return null;
  const exercises = draft.exercises.filter((ex) => isObject(ex) && typeof ex.name === 'string' && Array.isArray(ex.sets));
  if (exercises.length === 0) return null;

  return {
    dayId: draft.dayId,
    editingId: draft.editingId || null,
    editingDate: draft.editingDate || null,
    units: draft.units === 'kg' ? 'kg' : 'lbs',
    exercises: exercises.map((ex, index) => ({
      name: ex.name,
      slot: Number.isInteger(ex.slot) ? ex.slot : index,
      pattern: typeof ex.pattern === 'string' ? ex.pattern : patternOf(ex.name),
      superset: ex.superset || null,
      defaultSets: ex.defaultSets || MIN_SET_ROWS,
      note: typeof ex.note === 'string' ? ex.note : '',
      sets: ex.sets.filter(isObject).map((row) => {
        const reps = row.reps === undefined || row.reps === null ? '' : String(row.reps);
        return {
          weight: row.weight === undefined || row.weight === null ? '' : String(row.weight),
          reps,
          done: row.done === undefined ? parseInt(reps, 10) > 0 : Boolean(row.done),
        };
      }),
    })),
  };
}

function loadData() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (error) {
    return normalizeData(null);
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

// Temporary screen state. This isn't saved, so it resets when the app reopens.
const ui = {
  view: data.draft ? 'workout' : 'home',
  overrideDay: null,    // a day tapped in the Home selector
  detailId: null,       // the workout shown on the detail screen
  justSaved: false,     // show the "workout saved" banner once
  sheet: null,          // the open bottom sheet, such as { type: 'finish' }
  activeSet: {},        // exercise index -> the set you tapped to work on
  openNotes: {},        // exercise index -> true if its notes box is open
  justDone: null,       // { ex, set } that plays the completion animation once
  needReps: null,       // { ex, set } that shows "Enter reps first"
  exercise: null,       // the exercise picked on the Progress screen
  metric: 'weight',     // the line shown on the exercise chart
  bodyweightRange: '8w',
  selected: { bodyweight: null, exercise: null }, // the chart point being inspected
};

/* ==========================================================================
   3. UNITS
   Workouts are saved in pounds. Everything on screen, including all the math
   in section 4, uses the current unit rounded to 1 decimal. That way a 135 lb
   set stays "61.2 kg" every time, with no false PRs caused by rounding.
   ========================================================================== */
const LBS_PER_KG = 2.20462262;

function convertWeight(value, from, to) {
  if (from === to) return value;
  return to === 'kg' ? value / LBS_PER_KG : value * LBS_PER_KG;
}

function unit() {
  return data.settings.units;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Saved pounds -> number shown on screen.
function toDisplay(lbs) {
  return round1(convertWeight(lbs, 'lbs', unit()));
}

// Number typed on screen -> saved pounds.
function toLbs(value) {
  return Math.round(convertWeight(value, unit(), 'lbs') * 1000) / 1000;
}

/* ==========================================================================
   4. WORKOUT MATH
   All of these work on sets already converted to the current unit.
   ========================================================================== */

// Epley formula, rounded to 1 decimal so that 165.0 and 165.04 count as a tie.
function estimatedOneRepMax(weight, reps) {
  return round1(weight * (1 + reps / 30));
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

// The heaviest set, using reps to break a tie. Used for "Bench Press 185x8".
function topSet(sets) {
  return sets.reduce((best, set) =>
    set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best);
}

function displaySets(sets) {
  return sets.map((set) => ({ weight: toDisplay(set.weight), reps: set.reps }));
}

// Every past session of one exercise, oldest first. Only workouts before
// `beforeDate` count, so an old workout is compared with what came before it.
function sessionsFor(name, beforeDate = Infinity) {
  const sessions = [];
  for (const workout of data.workouts) {
    if (workout.date >= beforeDate) continue;
    for (const exercise of workout.exercises) {
      if (exercise.name === name) {
        sessions.push({ date: workout.date, sets: displaySets(exercise.sets), note: exercise.note || '' });
      }
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
  return round1(value).toLocaleString('en-US');
}

// A weight of 0 means bodyweight, which suits exercises like pull-ups.
function formatWeight(weight) {
  return weight === 0 ? 'BW' : num(weight);
}

// "135x8", the compact style used for previous performance.
function formatSet(set) {
  return `${formatWeight(set.weight)}x${set.reps}`;
}

function formatDate(time, options = { month: 'short', day: 'numeric' }) {
  return new Date(time).toLocaleDateString('en-US', options);
}

function formatFullDate(time) {
  return formatDate(time, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Your local date as 'YYYY-MM-DD'. toISOString() would use UTC, which is already
// tomorrow on a US evening.
function dateString(time = Date.now()) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// 'YYYY-MM-DD' -> a time at noon local, which is safe from daylight saving edges.
function parseDateString(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

/* ==========================================================================
   5. CYCLE AND CALENDAR
   ========================================================================== */
function dayById(dayId) {
  return PLAN.find((day) => day.id === dayId);
}

function dayName(dayId) {
  const day = dayById(dayId);
  return day ? day.name : dayId;
}

function latestWorkout() {
  return data.workouts[data.workouts.length - 1] || null;
}

// The next day always follows the last workout you finished, whatever the date.
function nextDayId() {
  const latest = latestWorkout();
  if (!latest) return PLAN[0].id;
  const index = PLAN.findIndex((day) => day.id === latest.dayId);
  return PLAN[(index + 1) % PLAN.length].id;
}

// The days ticked off in the current cycle. A cycle ends once all four days
// are done, or when you repeat a day, which starts a new cycle from that day.
function daysDoneThisCycle() {
  let done = new Set();
  for (const workout of data.workouts) {
    if (!dayById(workout.dayId)) continue;
    if (done.has(workout.dayId)) done = new Set();
    done.add(workout.dayId);
    if (done.size === PLAN.length) done = new Set();
  }
  return done;
}

// Weeks run Monday to Sunday.
function startOfWeek(time = Date.now()) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function sessionsThisWeek() {
  const start = startOfWeek();
  return data.workouts.filter((workout) => workout.date >= start).length;
}

function dotsHTML(count) {
  let html = '';
  for (let i = 0; i < SESSIONS_PER_WEEK; i++) {
    html += `<span class="${i < count ? 'on' : ''}"></span>`;
  }
  return `<div class="dots" aria-hidden="true">${html}</div>`;
}

// Whole calendar days between two times, ignoring the time of day.
function daysBetween(earlier, later) {
  const midnight = (time) => new Date(time).setHours(0, 0, 0, 0);
  return Math.round((midnight(later) - midnight(earlier)) / 86400000);
}

function latestBodyweight() {
  return data.bodyweight[data.bodyweight.length - 1] || null;
}

// True when a backup is overdue. If you've never exported, the clock starts
// from your oldest workout.
function backupIsOverdue() {
  if (data.workouts.length === 0) return false;
  const since = data.lastExportDate ? parseDateString(data.lastExportDate) : data.workouts[0].date;
  return daysBetween(since, Date.now()) > BACKUP_AFTER_DAYS;
}

/* ==========================================================================
   6. LOGGING A WORKOUT
   While you log, the workout lives in data.draft and is saved on every change,
   so it survives the phone locking or the app closing.

   Input values stay as the text you typed, in the draft's units. Only sets you
   tick (done: true) are saved when you finish.

   draft = {
     dayId, units, editingId, editingDate,    editing fields are null for a new workout
     exercises: [{
       name, slot, pattern, superset, defaultSets, note,
       sets: [{ weight: '135', reps: '8', done: false }]
     }]
   }
   ========================================================================== */

// Finds the movement pattern list that contains this exercise.
function patternOf(name) {
  return Object.keys(PATTERNS).find((pattern) => PATTERNS[pattern].includes(name)) || null;
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

// Builds one exercise's rows with last time's weight and reps filled in.
function prefilledSets(name, defaultCount, beforeDate) {
  const last = lastSession(name, beforeDate);
  let count = defaultCount;
  if (last) count = Math.min(MAX_SET_ROWS, Math.max(MIN_SET_ROWS, last.sets.length));

  const rows = [];
  for (let i = 0; i < count; i++) {
    // If last time had fewer sets, repeat its final set.
    const source = last ? last.sets[i] || last.sets[last.sets.length - 1] : null;
    rows.push({
      weight: source ? String(source.weight) : '',
      reps: source ? String(source.reps) : '',
      done: false,
    });
  }
  return rows;
}

function newDraftExercise(slot, slotIndex, beforeDate) {
  const name = preferredOption(slot.options);
  return {
    name,
    slot: slotIndex,
    pattern: patternOf(slot.options[0]),
    superset: slot.superset || null,
    defaultSets: slot.sets,
    note: '',
    sets: prefilledSets(name, slot.sets, beforeDate),
  };
}

function resetLoggingState() {
  ui.activeSet = {};
  ui.openNotes = {};
  ui.justDone = null;
  ui.needReps = null;
  ui.overrideDay = null;
}

function draftHasProgress() {
  return Boolean(data.draft) && data.draft.exercises.some((ex) => ex.sets.some((row) => row.done));
}

function confirmReplacingDraft() {
  return !draftHasProgress() || confirm('Replace the workout in progress? Its completed sets will be lost.');
}

function startWorkout(dayId) {
  if (!confirmReplacingDraft()) return;
  data.draft = {
    dayId,
    units: unit(),
    editingId: null,
    editingDate: null,
    exercises: dayById(dayId).exercises.map((slot, index) => newDraftExercise(slot, index)),
  };
  resetLoggingState();
  saveData();
  navigate('workout');
}

// Reopens a saved workout in the logging screen to fix a mistake.
function editWorkout(id) {
  if (!confirmReplacingDraft()) return;
  const workout = data.workouts.find((item) => item.id === id);
  const remaining = [...workout.exercises];

  const applySaved = (exercise, saved) => {
    exercise.name = saved.name;
    exercise.note = saved.note || '';
    exercise.sets = displaySets(saved.sets).map((set) => ({
      weight: String(set.weight),
      reps: String(set.reps),
      done: true,
    }));
    while (exercise.sets.length < MIN_SET_ROWS) exercise.sets.push({ weight: '', reps: '', done: false });
    return exercise;
  };

  // Follow the plan's order, including any exercise you skipped that day.
  // Newer workouts record their slot, which also finds swapped exercises.
  const day = dayById(workout.dayId);
  const exercises = (day ? day.exercises : []).map((slot, slotIndex) => {
    let index = remaining.findIndex((item) => item.slot === slotIndex);
    if (index < 0) index = remaining.findIndex((item) => item.slot === undefined && slot.options.includes(item.name));
    const exercise = newDraftExercise(slot, slotIndex, workout.date);
    return index >= 0 ? applySaved(exercise, remaining.splice(index, 1)[0]) : exercise;
  });

  // Keep anything that isn't in the plan, such as from an imported backup.
  for (const extra of remaining) {
    exercises.push(applySaved({
      slot: exercises.length,
      pattern: patternOf(extra.name),
      superset: null,
      defaultSets: MIN_SET_ROWS,
    }, extra));
  }

  data.draft = {
    dayId: workout.dayId,
    units: unit(),
    editingId: workout.id,
    editingDate: workout.date,
    exercises,
  };
  resetLoggingState();
  saveData();
  navigate('workout');
}

// The ticked sets for one exercise, as numbers. Reps with a blank weight are
// saved as weight 0 (bodyweight).
function loggedSets(exercise) {
  const sets = [];
  for (const row of exercise.sets) {
    const reps = parseInt(row.reps, 10);
    const weight = parseFloat(String(row.weight).replace(',', '.'));
    if (row.done && reps > 0) sets.push({ weight: weight > 0 ? weight : 0, reps });
  }
  return sets;
}

function exerciseIsDone(exercise) {
  return exercise.sets.length > 0 && exercise.sets.every((row) => row.done);
}

// The set shown in full: the one you tapped, otherwise the first unfinished.
function currentSetIndex(exercise, exerciseIndex) {
  const tapped = ui.activeSet[exerciseIndex];
  if (exercise.sets[tapped] && !exercise.sets[tapped].done) return tapped;
  return exercise.sets.findIndex((row) => !row.done);
}

// One tap: completes the set, or reopens it if it's already done.
function toggleSet(exerciseIndex, setIndex) {
  const exercise = data.draft.exercises[exerciseIndex];
  const row = exercise.sets[setIndex];
  ui.justDone = null;
  ui.needReps = null;

  if (row.done) {
    row.done = false;
    ui.activeSet[exerciseIndex] = setIndex;
  } else {
    const reps = parseInt(row.reps, 10);
    if (!(reps > 0)) {
      // Nothing to log yet, so bring up this set and ask for its reps.
      ui.activeSet[exerciseIndex] = setIndex;
      ui.needReps = { ex: exerciseIndex, set: setIndex };
      refreshCard(exerciseIndex);
      const input = document.querySelector(`#exercise-${exerciseIndex} input[data-field="reps"]`);
      if (input) input.focus();
      return;
    }
    row.reps = String(reps);
    row.done = true;
    delete ui.activeSet[exerciseIndex];
    ui.justDone = { ex: exerciseIndex, set: setIndex };

    // First time on an exercise: carry these numbers into the blank rows below,
    // so you only type them once. Rows with values aren't touched.
    for (const later of exercise.sets.slice(setIndex + 1)) {
      if (later.weight === '') later.weight = row.weight;
      if (later.reps === '') later.reps = row.reps;
    }
  }
  refreshCard(exerciseIndex);
  ui.justDone = null;
}

function saveFinishedWorkout() {
  const draft = data.draft;
  const exercises = draft.exercises
    .map((ex) => {
      const saved = {
        name: ex.name,
        slot: ex.slot,
        sets: loggedSets(ex).map((set) => ({ weight: toLbs(set.weight), reps: set.reps })),
      };
      if (ex.note.trim()) saved.note = ex.note.trim();
      return saved;
    })
    .filter((ex) => ex.sets.length > 0);

  // Fixing an old workout changes its sets but not its date. Its record could
  // have been deleted while you were editing, in which case it's saved as new.
  const existing = draft.editingId && data.workouts.find((item) => item.id === draft.editingId);
  let id;
  if (existing) {
    id = existing.id;
    existing.exercises = exercises;
  } else {
    const date = draft.editingDate || Date.now();
    id = String(date);
    data.workouts.push({ id, date, dayId: draft.dayId, exercises });
    data.workouts.sort((a, b) => a.date - b.date);
    ui.justSaved = !draft.editingDate;
  }

  data.draft = null;
  ui.sheet = null;
  resetLoggingState();
  saveData();
  ui.detailId = id;
  navigate('detail');
}

function discardDraft() {
  const editing = data.draft.editingId;
  if (draftHasProgress() && !editing && !confirm('Discard this workout?')) return;
  if (editing && !confirm('Discard your changes?')) return;
  data.draft = null;
  resetLoggingState();
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
  navigate('progress');
}

// The date that limits "earlier" comparisons for the workout being logged.
function draftCutoff() {
  return data.draft.editingDate || Infinity;
}

/* ==========================================================================
   7. SCREENS
   Each function returns a string of HTML. render() puts it on the page.
   ========================================================================== */
const app = document.getElementById('app');

function render() {
  if (ui.view === 'home') app.innerHTML = homeHTML();
  if (ui.view === 'workout') app.innerHTML = workoutHTML();
  if (ui.view === 'progress') {
    app.innerHTML = progressHTML();
    setUpCharts();
  }
  if (ui.view === 'settings') app.innerHTML = settingsHTML();
  if (ui.view === 'detail') app.innerHTML = detailHTML();

  // Light up the tab that this screen belongs to.
  const activeTab = { home: 'home', workout: 'home', progress: 'progress', settings: 'settings', detail: 'progress' }[ui.view];
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
  renderSheet();
}

/* --- Home ---------------------------------------------------------------- */

// The day the Start button will begin.
function homeDayId() {
  return ui.overrideDay || (data.draft ? data.draft.dayId : nextDayId());
}

function homeHTML() {
  const nextId = nextDayId();
  const dayId = homeDayId();
  const day = dayById(dayId) || PLAN[0];
  const resuming = Boolean(data.draft) && data.draft.dayId === dayId;
  const count = sessionsThisWeek();
  const weight = latestBodyweight();

  // Gentle nudges. These only appear when they apply.
  let notices = '';
  const latest = latestWorkout();
  if (latest && daysBetween(latest.date, Date.now()) >= NUDGE_AFTER_DAYS) {
    notices += `<p class="notice">Next up: ${esc(dayName(nextId))}</p>`;
  }
  if (backupIsOverdue()) {
    notices += '<button type="button" class="notice small" data-action="goTab" data-tab="settings">Time for a backup. Export one in Settings.</button>';
  }

  // Each row shows the exercise and your best set from last time.
  const rows = day.exercises.map((slot, index) => {
    const inDraft = resuming && data.draft.exercises.find((ex) => ex.slot === index);
    const name = inDraft ? inDraft.name : preferredOption(slot.options);
    const last = lastSession(name);
    return `<li><span>${esc(name)}</span><span class="perf">${last ? formatSet(topSet(last.sets)) : '–'}</span></li>`;
  }).join('');

  const done = daysDoneThisCycle();
  const dayButtons = PLAN.map((item) => {
    const isDone = done.has(item.id);
    return `
      <button type="button" class="day-btn ${item.id === nextId ? 'is-next' : ''} ${item.id === dayId ? 'selected' : ''}"
        aria-pressed="${item.id === dayId}" aria-label="${item.name}${isDone ? ', completed this cycle' : ''}${item.id === nextId ? ', next up' : ''}"
        data-action="pickDay" data-day="${item.id}">
        ${item.name}<small>${isDone ? '✓' : ''}</small>
      </button>`;
  }).join('');

  let eyebrow = 'Selected';
  if (dayId === nextId) eyebrow = 'Next up';
  if (resuming) eyebrow = 'In progress';

  let startLabel = `Start ${day.name}`;
  if (resuming) startLabel = `${data.draft.editingId ? 'Resume editing' : 'Resume'} ${day.name}`;

  return `
    <section class="stats">
      <div class="stat">
        <div class="label">Weekly sessions</div>
        <div class="stat-value">${count} / ${SESSIONS_PER_WEEK} sessions</div>
        ${dotsHTML(count)}
      </div>
      <div class="stat">
        <div class="label">Bodyweight</div>
        <div class="stat-value">${weight ? `${num(toDisplay(weight.weight))} ${unit()}` : '–'}</div>
      </div>
      <button type="button" class="round-add" aria-label="Log bodyweight" data-action="openBodyweight">+</button>
    </section>
    ${notices}
    <section class="card">
      <p class="eyebrow">${eyebrow}</p>
      <div class="next-day">${esc(day.name)}</div>
      <ul class="plan-list">${rows}</ul>
    </section>
    <div class="day-grid">${dayButtons}</div>
    <div class="action-bar">
      <button type="button" class="btn primary" data-action="startOrResume">${startLabel}</button>
    </div>`;
}

/* --- Active workout ------------------------------------------------------ */
function workoutHTML() {
  const draft = data.draft;
  const cards = draft.exercises.map((exercise, index) => exerciseCardHTML(exercise, index)).join('');
  const editing = Boolean(draft.editingId);

  return `
    <header class="workout-header">
      <button type="button" class="back" data-action="closeWorkout">‹ Home</button>
      <span class="muted" id="done-count">${doneCountHTML()}</span>
    </header>
    ${editing ? `<p class="muted small spaced">Editing ${formatFullDate(draft.editingDate)}</p>` : ''}
    ${cards}
    <div class="spaced">
      <button type="button" class="btn primary" data-action="openFinish">${editing ? 'Save changes' : 'Finish workout'}</button>
      <button type="button" class="btn quiet" data-action="discard">${editing ? 'Discard changes' : 'Discard workout'}</button>
    </div>`;
}

function doneCountHTML() {
  const list = data.draft.exercises;
  return `${esc(dayName(data.draft.dayId))}: <strong>${list.filter(exerciseIsDone).length} of ${list.length} exercises</strong>`;
}

function exerciseCardHTML(exercise, index) {
  const last = lastSession(exercise.name, draftCutoff());
  const lastText = last ? `Last: ${last.sets.map(formatSet).join(', ')}` : 'Last: nothing logged yet';
  const current = currentSetIndex(exercise, index);

  const rows = exercise.sets.map((row, setIndex) => {
    if (row.done) return doneSetHTML(row, index, setIndex);
    if (setIndex === current) return currentSetHTML(row, index, setIndex);
    return upcomingSetHTML(row, index, setIndex);
  }).join('');

  const canAdd = exercise.sets.length < MAX_SET_ROWS;
  const setButton = canAdd
    ? `<button type="button" class="tool" data-action="addSet" data-ex="${index}">+ Add a set</button>`
    : exercise.sets.length > MIN_SET_ROWS
      ? `<button type="button" class="tool" data-action="removeSet" data-ex="${index}">− Remove last set</button>`
      : '';

  // Notes stay collapsed until you ask for them.
  const notesOpen = ui.openNotes[index];
  const noteLabel = exercise.note ? 'Edit note' : '+ Note';
  let notes = '';
  if (notesOpen) {
    notes = `
      <textarea class="note-box" aria-label="${esc(exercise.name)} notes" placeholder="${last && last.note ? esc(`Last note: ${last.note}`) : 'Add a note'}"
        data-ex="${index}" data-field="note">${esc(exercise.note)}</textarea>`;
  } else if (exercise.note) {
    notes = `<p class="note-text">${esc(exercise.note)}</p>`;
  }

  return `
    <section class="card exercise ${exerciseIsDone(exercise) ? 'is-done' : ''} ${exercise.superset ? 'superset' : ''}" id="exercise-${index}">
      <div class="exercise-head">
        <div class="exercise-title">
          ${exercise.superset ? `<span class="tag">${esc(exercise.superset)}</span>` : ''}
          <h3>${esc(exercise.name)}</h3>
          <p class="last">${esc(lastText)}</p>
        </div>
        <button type="button" class="tool" data-action="openReplace" data-ex="${index}">Replace</button>
      </div>
      ${rows}
      <div class="status">${statusHTML(exercise)}</div>
      ${notes}
      <div class="card-tools">
        ${setButton}
        <button type="button" class="tool" aria-expanded="${Boolean(notesOpen)}" data-action="toggleNotes" data-ex="${index}">${noteLabel}</button>
      </div>
    </section>`;
}

// A finished set: one green line. Tapping it reopens the set.
function doneSetHTML(row, exerciseIndex, setIndex) {
  const animate = ui.justDone && ui.justDone.ex === exerciseIndex && ui.justDone.set === setIndex;
  const weight = parseFloat(String(row.weight).replace(',', '.'));
  return `
    <button type="button" class="set-line done ${animate ? 'just-done' : ''}" aria-label="Set ${setIndex + 1} done. Reopen it."
      data-action="toggleSet" data-ex="${exerciseIndex}" data-set="${setIndex}">
      <span class="set-line-main">
        <span class="set-line-name">Set ${setIndex + 1}</span>
        <span class="set-line-value">${formatWeight(weight > 0 ? weight : 0)} x ${esc(row.reps)}</span>
      </span>
      <span class="check-mark">✓</span>
    </button>`;
}

// A set still to come: tap the line to work on it, or the circle to complete it.
function upcomingSetHTML(row, exerciseIndex, setIndex) {
  return `
    <div class="set-line">
      <button type="button" class="set-line-main" data-action="focusSet" data-ex="${exerciseIndex}" data-set="${setIndex}">
        <span class="set-line-name">Set ${setIndex + 1}</span>
        <span class="set-line-value">${esc(row.weight || '–')} x ${esc(row.reps || '–')}</span>
      </button>
      <button type="button" class="set-circle" aria-label="Complete set ${setIndex + 1}"
        data-action="toggleSet" data-ex="${exerciseIndex}" data-set="${setIndex}"><span></span></button>
    </div>`;
}

// The current set, in full, with steppers and the big tick.
function currentSetHTML(row, exerciseIndex, setIndex) {
  const needsReps = ui.needReps && ui.needReps.ex === exerciseIndex && ui.needReps.set === setIndex;

  const field = (name, label, value, invalid) => `
    <div class="field">
      <span class="field-label">${label}</span>
      <button type="button" class="step" aria-label="Decrease ${name}"
        data-action="step" data-ex="${exerciseIndex}" data-set="${setIndex}" data-target="${name}" data-direction="-1">−</button>
      <input inputmode="decimal" autocomplete="off" aria-label="Set ${setIndex + 1} ${name}" class="${invalid ? 'invalid' : ''}"
        data-ex="${exerciseIndex}" data-set="${setIndex}" data-field="${name}" value="${esc(value)}" placeholder="–">
      <button type="button" class="step plus" aria-label="Increase ${name}"
        data-action="step" data-ex="${exerciseIndex}" data-set="${setIndex}" data-target="${name}" data-direction="1">+</button>
    </div>`;

  return `
    <div class="set-current">
      <div class="set-fields">
        <div class="set-title">Set ${setIndex + 1}</div>
        ${field('weight', unit(), row.weight)}
        ${field('reps', 'Reps', row.reps, needsReps)}
        ${needsReps ? '<p class="set-error">Enter reps first</p>' : ''}
      </div>
      <button type="button" class="set-check" aria-label="Complete set ${setIndex + 1}"
        data-action="toggleSet" data-ex="${exerciseIndex}" data-set="${setIndex}">✓</button>
    </div>`;
}

// The hints and chips under an exercise. These re-run whenever a set is ticked.
function statusHTML(exercise) {
  const cutoff = draftCutoff();
  const last = lastSession(exercise.name, cutoff);
  const sets = loggedSets(exercise);

  // Before you start: did last session already earn more weight?
  if (sets.length === 0) {
    if (last && hitTopOfRange(last.sets)) {
      return `<span class="hint">⬆ Ready to add weight: you hit ${TOP_OF_REP_RANGE} on every set last time</span>`;
    }
    return '';
  }

  const finished = exerciseIsDone(exercise);
  let html = '';
  if (finished && hitTopOfRange(sets)) {
    html += `<span class="hint">⬆ Ready to add weight next time: ${TOP_OF_REP_RANGE}+ on every set</span>`;
  }
  html += recordBadgesHTML(findRecords(exercise.name, sets, cutoff));
  // The comparison waits until the exercise is finished, because volume always
  // looks "down" partway through.
  if (finished) html += comparisonHTML(sets, last);
  return html;
}

// Weight up/same/down and volume up/same/down, compared with last session.
function comparisonHTML(sets, last) {
  if (!last) return '<span class="chip same">First session: this is your baseline</span>';

  const chip = (label, difference) => {
    if (difference > 0) return `<span class="chip up">▲ ${label} +${num(difference)} ${unit()}</span>`;
    if (difference < 0) return `<span class="chip down">▼ ${label} −${num(-difference)} ${unit()}</span>`;
    return `<span class="chip same">= ${label} same</span>`;
  };

  return chip('Weight', heaviestWeight(sets) - heaviestWeight(last.sets))
       + chip('Volume', totalVolume(sets) - totalVolume(last.sets));
}

function recordBadgesHTML(records) {
  let html = '';
  if (records.weight) html += `<span class="badge">🏆 Weight PR: ${num(records.weight)} ${unit()}</span>`;
  if (records.e1rm) html += `<span class="badge">🏆 1RM PR: ${num(records.e1rm)} ${unit()}</span>`;
  for (const record of records.reps) {
    html += `<span class="badge">🏆 Reps PR: ${formatSet(record)}</span>`;
  }
  return html;
}

/* --- Workout detail ------------------------------------------------------ */
function detailHTML() {
  const workout = data.workouts.find((item) => item.id === ui.detailId);
  if (!workout) return progressHTML();

  const cards = workout.exercises.map((exercise) => {
    const sets = displaySets(exercise.sets);
    const records = findRecords(exercise.name, sets, workout.date);
    const previous = lastSession(exercise.name, workout.date);
    const setRows = sets.map((set, index) => `
      <li>
        <span><span class="muted">${index + 1}.</span> ${formatWeight(set.weight)} x ${set.reps}</span>
        <span>${records.flags[index] ? '🏆' : ''}</span>
      </li>`).join('');
    return `
      <section class="card">
        <h3>${esc(exercise.name)}</h3>
        <ul class="set-list">${setRows}</ul>
        ${exercise.note ? `<p class="note-text">${esc(exercise.note)}</p>` : ''}
        <div class="status">${recordBadgesHTML(records)}${comparisonHTML(sets, previous)}</div>
      </section>`;
  }).join('');

  const allSets = workout.exercises.flatMap((exercise) => displaySets(exercise.sets));
  const banner = ui.justSaved
    ? `<div class="saved-banner">Workout saved. Next up: ${esc(dayName(nextDayId()))}</div>`
    : '';
  ui.justSaved = false; // Show the banner once.

  return `
    <button type="button" class="back" data-action="goTab" data-tab="progress">‹ Progress</button>
    <h1>${esc(dayName(workout.dayId))}</h1>
    <p class="muted">${formatFullDate(workout.date)} · ${num(totalVolume(allSets))} ${unit()} total</p>
    ${banner}
    ${cards}
    <div class="spaced">
      <button type="button" class="btn" data-action="editWorkout" data-id="${esc(workout.id)}">Edit workout</button>
      <button type="button" class="btn danger" data-action="deleteWorkout" data-id="${esc(workout.id)}">Delete workout</button>
    </div>`;
}

/* --- Progress ------------------------------------------------------------ */
const METRICS = {
  weight: { label: 'Best set' },
  volume: { label: 'Total volume' },
  e1rm: { label: 'Est. 1RM' },
};

const BODYWEIGHT_RANGES = {
  '4w': { label: '4 weeks', days: 28 },
  '8w': { label: '8 weeks', days: 56 },
  '6m': { label: '6 months', days: 183 },
  all: { label: 'All', days: Infinity },
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
  const newest = latestWorkout();
  return newest && newest.exercises[0] ? newest.exercises[0].name : allExerciseNames()[0];
}

// The bodyweight entries inside the selected range.
function bodyweightInRange() {
  const { days } = BODYWEIGHT_RANGES[ui.bodyweightRange];
  return data.bodyweight.filter((entry) => daysBetween(parseDateString(entry.date), Date.now()) <= days);
}

function progressHTML() {
  return `
    <h1>Progress</h1>
    ${bodyweightCardHTML()}
    ${exerciseCardProgressHTML()}
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Weekly sessions</h2>
          <p class="muted small">${sessionsThisWeek()} of ${SESSIONS_PER_WEEK} this week</p>
        </div>
        ${dotsHTML(sessionsThisWeek())}
      </div>
    </section>
    ${historyHTML()}`;
}

function bodyweightCardHTML() {
  const rangeOptions = Object.keys(BODYWEIGHT_RANGES).map((key) =>
    `<option value="${key}" ${key === ui.bodyweightRange ? 'selected' : ''}>${BODYWEIGHT_RANGES[key].label}</option>`).join('');

  const entries = bodyweightInRange();
  let body = '<p class="muted spaced">No bodyweight logged in this range.</p>';
  if (entries.length > 0) {
    const change = toDisplay(entries[entries.length - 1].weight) - toDisplay(entries[0].weight);
    let changeText = 'No change';
    if (entries.length === 1) changeText = 'Log another entry to see your change';
    else if (change > 0) changeText = `+${num(change)} ${unit()}`;
    else if (change < 0) changeText = `−${num(-change)} ${unit()}`;
    body = `
      <div class="readout" id="readout-bodyweight"></div>
      <canvas class="chart" id="chart-bodyweight" role="img"
        aria-label="Bodyweight over time. Every entry is listed below."></canvas>
      <p class="chart-key">Change over this period: ${changeText}</p>`;
  }

  // Tap any past entry to edit or delete it.
  const rows = [...data.bodyweight].reverse().map((entry) => `
    <button type="button" class="list-row" data-action="openBodyweight" data-id="${esc(entry.id)}">
      <span>${formatDate(parseDateString(entry.date), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      <span>${num(toDisplay(entry.weight))} ${unit()}</span>
    </button>`).join('');

  return `
    <section class="card">
      <div class="card-head">
        <h2>Bodyweight (${unit()})</h2>
        <select class="select" aria-label="Bodyweight range" data-field="bodyweightRange">${rangeOptions}</select>
      </div>
      ${body}
      <button type="button" class="tool spaced" data-action="openBodyweight">+ Log bodyweight</button>
      ${rows ? `<details><summary>All entries (tap one to edit)</summary>${rows}</details>` : ''}
    </section>`;
}

function exerciseCardProgressHTML() {
  if (!ui.exercise) ui.exercise = defaultProgressExercise();

  const options = allExerciseNames().map((name) =>
    `<option value="${esc(name)}" ${name === ui.exercise ? 'selected' : ''}>${esc(name)}</option>`).join('');
  const points = progressPoints(ui.exercise);

  const head = `
    <div class="card-head">
      <h2>Exercise</h2>
      <select class="select" aria-label="Exercise" data-field="exercise">${options}</select>
    </div>`;

  if (points.length === 0) {
    return `<section class="card">${head}<p class="muted spaced">No sessions logged for this exercise yet.</p></section>`;
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
    <section class="card">
      ${head}
      <div class="metric-grid">${metricButtons}</div>
      <div class="readout" id="readout-exercise"></div>
      <canvas class="chart" id="chart-exercise" role="img"
        aria-label="${METRICS[ui.metric].label} for ${esc(ui.exercise)} over time. Every value is in the table below."></canvas>
      ${hasBest ? '<p class="chart-key"><span class="diamond"></span>New best</p>' : ''}
      <details>
        <summary>All sessions</summary>
        <table>
          <thead><tr><th>Date</th><th>Best set</th><th>Volume</th><th>1RM</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </details>
    </section>`;
}

function historyHTML() {
  const rows = [...data.workouts].reverse().map((workout) => {
    const sets = workout.exercises.flatMap((exercise) => exercise.sets);
    const recordCount = workout.exercises.reduce(
      (sum, exercise) => sum + findRecords(exercise.name, displaySets(exercise.sets), workout.date).count, 0);
    return `
      <button type="button" class="history-row" data-action="openWorkout" data-id="${esc(workout.id)}">
        <span>
          <strong>${esc(dayName(workout.dayId))}</strong>
          <span class="muted small">${formatFullDate(workout.date)} · ${workout.exercises.length} exercises · ${sets.length} sets</span>
        </span>
        ${recordCount > 0 ? `<span class="badge">🏆 ${recordCount}</span>` : ''}
      </button>`;
  }).join('');

  return `
    <h2 class="section-title">History</h2>
    ${rows || '<p class="muted spaced">Finished workouts will show up here.</p>'}`;
}

/* --- Settings ------------------------------------------------------------ */
function settingsHTML() {
  const stepButtons = WEIGHT_STEPS.map((step) => `
    <button type="button" class="${step === data.settings.weightStep ? 'selected' : ''}" aria-pressed="${step === data.settings.weightStep}"
      data-action="setWeightStep" data-value="${step}">${step}</button>`).join('');

  const unitButtons = ['lbs', 'kg'].map((name) => `
    <button type="button" class="${name === unit() ? 'selected' : ''}" aria-pressed="${name === unit()}"
      data-action="setUnits" data-value="${name}">${name}</button>`).join('');

  const lastExport = data.lastExportDate
    ? formatDate(parseDateString(data.lastExportDate), { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  return `
    <h1>Settings</h1>
    <section class="card">
      <h2>Weight step (${unit()})</h2>
      <div class="segmented">${stepButtons}</div>
    </section>
    <section class="card">
      <h2>Units</h2>
      <div class="segmented">${unitButtons}</div>
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small spaced">Your data is stored only on this phone. Removing the home screen icon can erase it.</p>
      <p class="spaced" id="last-export">Last export: ${lastExport}</p>
      <div class="spaced">
        <button type="button" class="btn" data-action="exportData">Export backup</button>
        <label class="btn" for="import-file">Import backup</label>
        <input class="file-input" id="import-file" type="file" accept=".json,application/json" data-field="import">
      </div>
    </section>`;
}

/* ==========================================================================
   8. BOTTOM SHEETS
   ui.sheet says which sheet is open. renderSheet() draws it above the page.
   ========================================================================== */
const sheetRoot = document.getElementById('sheet-root');

function openSheet(sheet) {
  ui.sheet = sheet;
  renderSheet();
}

function closeSheet() {
  ui.sheet = null;
  renderSheet();
}

function renderSheet() {
  document.body.classList.toggle('sheet-open', Boolean(ui.sheet));
  if (!ui.sheet) {
    sheetRoot.innerHTML = '';
    return;
  }
  const builders = { replace: replaceSheetHTML, finish: finishSheetHTML, bodyweight: bodyweightSheetHTML };
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="closeSheet"></div>
    <div class="sheet" role="dialog" aria-modal="true">${builders[ui.sheet.type]()}</div>`;
  fitSheetAboveKeyboard();
}

// iPhones cover the bottom of the screen with the keyboard, so the sheet moves
// up by the same amount to keep its inputs in view.
function fitSheetAboveKeyboard() {
  const sheet = sheetRoot.querySelector('.sheet');
  const viewport = window.visualViewport;
  if (!sheet || !viewport) return;
  const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  sheet.style.bottom = `${covered}px`;
  sheet.style.maxHeight = `${Math.round(viewport.height * 0.85)}px`;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitSheetAboveKeyboard);
  window.visualViewport.addEventListener('scroll', fitSheetAboveKeyboard);
}

/* --- Replace ------------------------------------------------------------- */

// Exercises in your history that aren't in any pattern list.
function customExerciseNames() {
  const known = new Set(Object.values(PATTERNS).flat());
  return allExerciseNames().filter((name) => !known.has(name));
}

function replaceSheetHTML() {
  const exercise = data.draft.exercises[ui.sheet.ex];
  const pattern = exercise.pattern;
  // An exercise with no known pattern gets every option.
  const pool = pattern ? PATTERNS[pattern] : Object.values(PATTERNS).flat();

  const row = (name) => {
    const last = lastSession(name, draftCutoff());
    return `
      <button type="button" class="sheet-row" data-action="pickReplacement" data-name="${esc(name)}">
        <span>${esc(name)}</span>
        <span class="perf">${last ? formatSet(topSet(last.sets)) : ''}</span>
      </button>`;
  };

  const alternatives = pool.filter((name) => name !== exercise.name).map(row).join('');
  const customs = customExerciseNames().filter((name) => name !== exercise.name).map(row).join('');

  return `
    <p class="eyebrow">${esc(pattern || 'Replace')}</p>
    <h2>Replace ${esc(exercise.name)}</h2>
    <p class="muted small">For this session only. Your plan stays the same.</p>
    <div class="sheet-section">${alternatives}</div>
    ${customs ? `<div class="sheet-section"><div class="label">Your custom exercises</div>${customs}</div>` : ''}
    <form class="sheet-section" data-submit="saveCustomExercise">
      <label class="label" for="custom-name">Custom exercise</label>
      <div class="inline-form">
        <input class="text-input" id="custom-name" type="text" maxlength="60" autocomplete="off" placeholder="Type a name">
        <button type="submit" class="tool">Use</button>
      </div>
    </form>
    <button type="button" class="btn quiet spaced" data-action="closeSheet">Cancel</button>`;
}

// Swaps the exercise for this workout. Completed sets stay, and the rest load
// the new exercise's last numbers.
function replaceExercise(name) {
  const index = ui.sheet.ex;
  const exercise = data.draft.exercises[index];
  exercise.name = name;
  const fresh = prefilledSets(name, exercise.defaultSets, draftCutoff());
  const kept = exercise.sets.filter((row) => row.done);
  exercise.sets = kept.concat(fresh.slice(kept.length));
  delete ui.activeSet[index];
  closeSheet();
  refreshCard(index);
}

/* --- Finish -------------------------------------------------------------- */
function finishSheetHTML() {
  const draft = data.draft;
  const withSets = draft.exercises.filter((ex) => loggedSets(ex).length > 0);
  const skipped = draft.exercises.filter((ex) => loggedSets(ex).length === 0);
  const totalSets = withSets.reduce((sum, ex) => sum + loggedSets(ex).length, 0);
  const editing = Boolean(draft.editingId);

  if (withSets.length === 0) {
    return `
      <h2>Nothing to save yet</h2>
      <p class="muted spaced">Tick at least one set before finishing.</p>
      <button type="button" class="btn spaced" data-action="closeSheet">Keep going</button>`;
  }

  return `
    <h2>${editing ? 'Save changes?' : 'Finish workout?'}</h2>
    <p class="spaced">${withSets.length} of ${draft.exercises.length} exercises · ${totalSets} sets</p>
    ${skipped.length ? `<p class="muted small spaced">No ticked sets, so these won't be saved: ${skipped.map((ex) => esc(ex.name)).join(', ')}</p>` : ''}
    <div class="spaced">
      <button type="button" class="btn primary" data-action="confirmFinish">${editing ? 'Save changes' : 'Save workout'}</button>
      <button type="button" class="btn quiet" data-action="closeSheet">Keep going</button>
    </div>`;
}

/* --- Bodyweight ---------------------------------------------------------- */
function bodyweightSheetHTML() {
  const entry = ui.sheet.id ? data.bodyweight.find((item) => item.id === ui.sheet.id) : null;
  const latest = latestBodyweight();
  const value = entry || latest;
  const today = dateString();

  return `
    <h2>${entry ? 'Edit bodyweight' : 'Log bodyweight'}</h2>
    <form data-submit="saveBodyweight">
      <div class="sheet-section">
        <label class="label" for="bodyweight-input">Weight (${unit()})</label>
        <input class="text-input" id="bodyweight-input" inputmode="decimal" autocomplete="off" value="${value ? toDisplay(value.weight) : ''}">
      </div>
      <div class="sheet-section">
        <label class="label" for="bodyweight-date">Date</label>
        <input class="text-input" id="bodyweight-date" type="date" max="${today}" value="${entry ? entry.date : today}">
      </div>
      <p class="set-error" id="bodyweight-error"></p>
      <button type="submit" class="btn primary spaced">Save</button>
    </form>
    ${entry ? '<button type="button" class="btn danger" data-action="deleteBodyweight">Delete entry</button>' : ''}
    <button type="button" class="btn quiet" data-action="closeSheet">Cancel</button>`;
}

function saveBodyweight() {
  const error = document.getElementById('bodyweight-error');
  const weight = parseFloat(document.getElementById('bodyweight-input').value.replace(',', '.'));
  const date = document.getElementById('bodyweight-date').value;

  if (!(weight > 0)) {
    error.textContent = 'Enter a weight.';
    return;
  }
  if (!isDateString(date) || date > dateString()) {
    error.textContent = 'Pick today or an earlier date.';
    return;
  }

  // There's one entry per day, so logging twice in a day updates that entry.
  const editing = ui.sheet.id ? data.bodyweight.find((item) => item.id === ui.sheet.id) : null;
  const sameDay = data.bodyweight.find((item) => item.date === date && item !== editing);
  if (editing && sameDay) {
    error.textContent = 'There is already an entry on that date.';
    return;
  }

  const target = editing || sameDay;
  if (target) {
    target.weight = toLbs(weight);
    target.date = date;
  } else {
    data.bodyweight.push({ id: `bw${Date.now()}`, date, weight: toLbs(weight) });
  }
  data.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  saveData();
  ui.sheet = null;
  ui.selected.bodyweight = null;
  renderSheet();
  render();
}

function deleteBodyweight() {
  if (!confirm('Delete this bodyweight entry?')) return;
  data.bodyweight = data.bodyweight.filter((item) => item.id !== ui.sheet.id);
  saveData();
  ui.sheet = null;
  ui.selected.bodyweight = null;
  renderSheet();
  render();
}

/* ==========================================================================
   9. CHARTS
   Small line charts drawn with canvas. Drawing them by hand means there's no
   library to download, so they also work with no signal at the gym. Each
   exercise metric gets its own view because weight and volume have very
   different scales and can't share one axis.
   ========================================================================== */
const CHART = {
  surface: '#1B1A19',   // same as --surface in style.css
  grid: '#3A3835',
  text: '#A8A39A',
  line: '#FF6B00',      // orange
  best: '#F5EFE2',      // cream, on the diamonds marking a new best
  pad: { top: 10, right: 12, bottom: 24, left: 54 },
};

// The points a chart should draw: { time, value, isBest, text }.
function chartPoints(chartId) {
  if (chartId === 'bodyweight') {
    return bodyweightInRange().map((entry) => {
      const value = toDisplay(entry.weight);
      const time = parseDateString(entry.date);
      return {
        time,
        value,
        isBest: false,
        text: `${formatDate(time, { month: 'short', day: 'numeric', year: 'numeric' })}: ${num(value)} ${unit()}`,
      };
    });
  }
  const metric = ui.metric;
  return progressPoints(ui.exercise).map((point) => {
    const value = metric === 'weight' ? formatWeight(point.weight) : num(point[metric]);
    const suffix = metric === 'weight' && point.weight === 0 ? '' : ` ${unit()}`;
    return {
      time: point.date,
      value: point[metric],
      isBest: point.isBest[metric],
      text: `${formatDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}: ${METRICS[metric].label} ${value}${suffix}${point.isBest[metric] ? ' (new best)' : ''}`,
    };
  });
}

function setUpCharts() {
  for (const chartId of ['bodyweight', 'exercise']) {
    const canvas = document.getElementById(`chart-${chartId}`);
    if (!canvas) continue;

    // A tap or horizontal drag selects the nearest point.
    const selectFromPointer = (event) => {
      const points = chartPoints(chartId);
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const scaleX = chartScaleX(points, rect.width);
      let nearest = 0;
      points.forEach((point, index) => {
        if (Math.abs(scaleX(point.time) - x) < Math.abs(scaleX(points[nearest].time) - x)) nearest = index;
      });
      ui.selected[chartId] = nearest;
      drawChart(chartId);
    };
    canvas.addEventListener('pointerdown', selectFromPointer);
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons > 0 || event.pointerType === 'touch') selectFromPointer(event);
    });

    drawChart(chartId);
  }
}

// Returns a function that converts a time to an x position in the chart.
function chartScaleX(points, width) {
  const { left, right } = CHART.pad;
  const first = points[0].time;
  const last = points[points.length - 1].time;
  if (first === last) return () => left + (width - left - right) / 2;
  return (time) => left + ((time - first) / (last - first)) * (width - left - right);
}

// Picks round, whole-number axis values such as 100, 150, 200. A step is never
// a fraction, so no two labels can round to the same number.
function niceTicks(min, max) {
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const roughStep = range / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const step = [1, 2, 2.5, 5, 10]
    .map((multiple) => multiple * magnitude)
    .find((option) => option >= roughStep && Number.isInteger(option)) || 1;

  // If every value is the same, widen the axis so the line sits mid-chart.
  const low = max === min ? Math.max(0, min - step) : min;
  const high = max === min ? max + step : max;
  const ticks = [];
  const start = Math.floor(low / step) * step;
  for (let value = start; value < high + step * 0.999; value += step) ticks.push(value);
  return ticks;
}

function drawChart(chartId) {
  const canvas = document.getElementById(`chart-${chartId}`);
  if (!canvas) return;
  const points = chartPoints(chartId);
  if (points.length === 0) return;

  const chosen = ui.selected[chartId];
  const selected = chosen === null || chosen >= points.length ? points.length - 1 : chosen;

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

  const values = points.map((point) => point.value);
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
    ctx.fillText(tick.toLocaleString('en-US'), left - 8, y);
  }

  // X-axis date labels: the first and last dates, plus the middle if there's room.
  ctx.textBaseline = 'alphabetic';
  const first = points[0].time;
  const last = points[points.length - 1].time;
  const label = (time, x, align) => {
    ctx.textAlign = align;
    ctx.fillText(formatDate(time), x, rect.height - 6);
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

  // Marker line for the selected point
  const selectedX = scaleX(points[selected].time);
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
    const x = scaleX(point.time);
    const y = scaleY(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots. Records are diamonds, so they don't rely on color alone. A dark ring
  // keeps each one readable where it crosses the line.
  const showAllDots = points.length <= 40;
  points.forEach((point, index) => {
    const isSelected = index === selected;
    if (!showAllDots && !point.isBest && !isSelected) return;

    const x = scaleX(point.time);
    const y = scaleY(point.value);
    const radius = (point.isBest ? 6 : 4) + (isSelected ? 1.5 : 0);

    const shape = (size) => {
      ctx.beginPath();
      if (point.isBest) {
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
    ctx.fillStyle = point.isBest ? CHART.best : CHART.line;
    ctx.fill();
  });

  // The readout sits above the chart so your thumb doesn't cover it.
  document.getElementById(`readout-${chartId}`).textContent = points[selected].text;
}

/* ==========================================================================
   10. BACKUP
   The share sheet lets you save to Files on an iPhone. Browsers without it
   get a normal download.
   ========================================================================== */
async function exportData() {
  const today = dateString();
  const fileName = `workout-backup-${today}.json`;
  const contents = JSON.stringify({ ...data, lastExportDate: today }, null, 2);
  const file = new File([contents], fileName, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
    } catch (error) {
      return; // You closed the share sheet, so this doesn't count as a backup.
    }
  } else {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  data.lastExportDate = today;
  saveData();
  if (ui.view === 'settings') render();
}

// Checks a backup's shape before it can replace anything.
function isValidBackup(backup) {
  if (!isObject(backup) || !Array.isArray(backup.workouts)) return false;

  const validSet = (set) => isObject(set)
    && Number.isFinite(set.weight) && set.weight >= 0
    && Number.isFinite(set.reps) && set.reps > 0;

  const validWorkout = (workout) => isObject(workout)
    && typeof workout.id === 'string'
    && typeof workout.dayId === 'string'
    && Number.isFinite(workout.date)
    && Array.isArray(workout.exercises)
    && workout.exercises.every((exercise) => isObject(exercise)
      && typeof exercise.name === 'string'
      && Array.isArray(exercise.sets)
      && exercise.sets.length > 0
      && exercise.sets.every(validSet));

  // Backups from before bodyweight tracking don't have this list.
  const validBodyweight = backup.bodyweight === undefined || (Array.isArray(backup.bodyweight)
    && backup.bodyweight.every((entry) => isObject(entry)
      && typeof entry.id === 'string'
      && isDateString(entry.date)
      && Number.isFinite(entry.weight) && entry.weight > 0));

  return backup.workouts.every(validWorkout) && validBodyweight;
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

  const weightCount = (backup.bodyweight || []).length;
  const message = `Replace everything on this phone with this backup? It has ${backup.workouts.length} workouts and ${weightCount} bodyweight entries.`;
  if (!confirm(message)) return;

  Object.assign(data, normalizeData(backup));
  resetLoggingState();
  ui.exercise = null;
  ui.selected = { bodyweight: null, exercise: null };
  saveData();
  navigate('settings');
}

/* ==========================================================================
   11. EVENTS
   One listener on the whole page. Any tappable element names its handler in
   a data-action attribute, and the matching function below runs.
   ========================================================================== */
const actions = {
  goTab(dataset) { navigate(dataset.tab); },
  pickDay(dataset) {
    // Tapping the day that would be chosen anyway clears the override.
    ui.overrideDay = null;
    if (dataset.day !== homeDayId()) ui.overrideDay = dataset.day;
    render();
  },
  startOrResume() {
    const dayId = homeDayId();
    if (data.draft && data.draft.dayId === dayId) {
      ui.overrideDay = null;
      navigate('workout');
    } else {
      startWorkout(dayId);
    }
  },
  closeWorkout() { navigate('home'); },
  discard() { discardDraft(); },

  // Logging
  toggleSet(dataset) { toggleSet(Number(dataset.ex), Number(dataset.set)); },
  focusSet(dataset) {
    ui.activeSet[dataset.ex] = Number(dataset.set);
    refreshCard(Number(dataset.ex));
  },
  step(dataset) {
    const row = data.draft.exercises[dataset.ex].sets[dataset.set];
    const size = dataset.target === 'weight' ? data.settings.weightStep : 1;
    const current = parseFloat(String(row[dataset.target]).replace(',', '.')) || 0;
    const next = Math.max(0, Math.round((current + Number(dataset.direction) * size) * 100) / 100);
    row[dataset.target] = String(next);
    // Update just this box, which is what makes the steppers feel instant.
    document.querySelector(`#exercise-${dataset.ex} input[data-field="${dataset.target}"]`).value = row[dataset.target];
    saveData();
  },
  addSet(dataset) {
    const rows = data.draft.exercises[dataset.ex].sets;
    const previous = rows[rows.length - 1];
    rows.push({ weight: previous.weight, reps: previous.reps, done: false });
    refreshCard(Number(dataset.ex));
  },
  removeSet(dataset) {
    data.draft.exercises[dataset.ex].sets.pop();
    refreshCard(Number(dataset.ex));
  },
  toggleNotes(dataset) {
    ui.openNotes[dataset.ex] = !ui.openNotes[dataset.ex];
    refreshCard(Number(dataset.ex));
    if (ui.openNotes[dataset.ex]) document.querySelector(`#exercise-${dataset.ex} .note-box`).focus();
  },

  // Bottom sheets
  closeSheet() { closeSheet(); },
  openReplace(dataset) { openSheet({ type: 'replace', ex: Number(dataset.ex) }); },
  pickReplacement(dataset) { replaceExercise(dataset.name); },
  openFinish() { openSheet({ type: 'finish' }); },
  confirmFinish() { saveFinishedWorkout(); },
  openBodyweight(dataset) { openSheet({ type: 'bodyweight', id: dataset.id || null }); },
  deleteBodyweight() { deleteBodyweight(); },

  // Progress and history
  openWorkout(dataset) {
    ui.detailId = dataset.id;
    navigate('detail');
  },
  editWorkout(dataset) { editWorkout(dataset.id); },
  deleteWorkout(dataset) { deleteWorkout(dataset.id); },
  pickMetric(dataset) {
    ui.metric = dataset.metric;
    ui.selected.exercise = null;
    render();
  },

  // Settings
  setWeightStep(dataset) {
    data.settings.weightStep = Number(dataset.value);
    saveData();
    render();
  },
  setUnits(dataset) {
    const next = dataset.value;
    // Convert any weights already typed into the workout in progress.
    if (data.draft && data.draft.units !== next) {
      for (const exercise of data.draft.exercises) {
        for (const row of exercise.sets) {
          const value = parseFloat(String(row.weight).replace(',', '.'));
          if (value > 0) row.weight = String(round1(convertWeight(value, data.draft.units, next)));
        }
      }
      data.draft.units = next;
    }
    data.settings.units = next;
    saveData();
    render();
  },
  exportData() { exportData(); },
};

// Forms name their handler in data-submit, which also covers the keyboard's Go key.
const submitActions = {
  saveCustomExercise() {
    const typed = document.getElementById('custom-name').value.trim();
    if (!typed) return;
    // Reuse an existing name, so "bench press" doesn't start a second history.
    const everyName = [...allExerciseNames(), ...Object.values(PATTERNS).flat()];
    const match = everyName.find((name) => name.toLowerCase() === typed.toLowerCase());
    replaceExercise(match || typed);
  },
  saveBodyweight() { saveBodyweight(); },
};

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (target) actions[target.dataset.action](target.dataset);
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  submitActions[event.target.dataset.submit]();
});

// Redraws one exercise card. Redrawing the whole screen would scroll the page.
function refreshCard(index) {
  document.getElementById(`exercise-${index}`).outerHTML =
    exerciseCardHTML(data.draft.exercises[index], index);
  document.getElementById('done-count').innerHTML = doneCountHTML();
  saveData();
}

// Runs on every keystroke, so a typed value is saved right away.
document.addEventListener('input', (event) => {
  const { ex, set, field } = event.target.dataset;
  if (field === 'weight' || field === 'reps') {
    data.draft.exercises[ex].sets[set][field] = event.target.value;
    event.target.classList.remove('invalid');
    saveData();
  }
  if (field === 'note') {
    data.draft.exercises[ex].note = event.target.value;
    saveData();
  }
});

// Runs when a dropdown or file picker changes.
document.addEventListener('change', (event) => {
  const { field } = event.target.dataset;
  if (field === 'exercise') {
    ui.exercise = event.target.value;
    ui.selected.exercise = null;
    render();
  }
  if (field === 'bodyweightRange') {
    ui.bodyweightRange = event.target.value;
    ui.selected.bodyweight = null;
    render();
  }
  if (field === 'import' && event.target.files[0]) {
    importData(event.target.files[0]);
    event.target.value = ''; // Allows picking the same file again.
  }
});

// Tapping a box selects its contents, so typing replaces a pre-filled number.
document.addEventListener('focusin', (event) => {
  if (event.target.matches('.field input, #bodyweight-input')) event.target.select();
});

// Rotating the phone changes the charts' width, so redraw them.
window.addEventListener('resize', () => {
  drawChart('bodyweight');
  drawChart('exercise');
});

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
