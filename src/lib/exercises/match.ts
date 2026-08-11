import 'server-only';
import libraryData from './library.json';

/**
 * Matches a free-text exercise name to a real demonstration in the open
 * free-exercise-db (https://github.com/yuhonas/free-exercise-db), so the app can
 * show an actual photo of the movement rather than a generic silhouette.
 *
 * The names come from the model and are unpredictable — "Dumbbell Floor Press",
 * "Chair-free squat", "Supported One-Arm Dumbbell Row". Matching is therefore
 * fuzzy, and deliberately conservative: a confidently wrong photo (a bench press
 * shown for a squat) is worse than no photo at all, so anything below the
 * confidence threshold returns null and the UI falls back to an illustration.
 */

interface LibEntry {
  n: string; // name
  i: string[]; // image paths, e.g. ["Barbell_Bench_Press/0.jpg", ".../1.jpg"]
  m: string[]; // primary muscles
  e: string | null; // equipment
  f: string | null; // force: push | pull | static
  c: string | null; // category
  k: string | null; // mechanic: compound | isolation
}

const LIBRARY = libraryData as LibEntry[];

const IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

export interface ExerciseImages {
  /** Two positions of the movement — start and mid-rep — for an animated demo. */
  start: string;
  end: string;
  /** The library name that was matched, for debugging / alt text. */
  matched: string;
}

/**
 * Words that carry no identifying signal. Kept deliberately short: dropping
 * "standing" or "seated" would erase a real distinction, so only true filler is
 * removed.
 */
const STOP = new Set([
  'the', 'a', 'an', 'with', 'and', 'to', 'of', 'on', 'for', 'your', 'my',
  'exercise', 'variation', 'version', 'style', 'easy', 'basic', 'simple',
  'beginner', 'gentle', 'light', 'free', 'no',
]);

/** Common shorthand and spelling the model uses that the library spells out. */
const SYNONYM: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  bw: 'bodyweight',
  rdl: 'romanian deadlift',
  ohp: 'overhead press',
  'sldl': 'stiff leg deadlift',
  pushups: 'push up',
  pushup: 'push up',
  'push-up': 'push up',
  'push-ups': 'push up',
  pullup: 'pull up',
  pullups: 'pull up',
  'pull-up': 'pull up',
  'chin-up': 'chin up',
  situp: 'sit up',
  'sit-up': 'sit up',
  pulldown: 'pulldown',
  pressdown: 'pushdown',
  kickbacks: 'kickback',
  'lat': 'lat',
  glutes: 'glute',
  hamstrings: 'hamstring',
  quads: 'quadriceps',
  quad: 'quadriceps',
  calves: 'calf',
  abs: 'abdominals',
  'step-up': 'step up',
  'step-ups': 'step up',
  'sit-to-stand': 'squat',
  'bodyweight': 'bodyweight',
  'db.': 'dumbbell',
};

/** The word that usually names the movement — a strong signal when it matches. */
const HEAD_NOUNS = new Set([
  'press', 'squat', 'row', 'curl', 'deadlift', 'raise', 'lunge', 'bridge',
  'plank', 'pushup', 'pullup', 'pulldown', 'fly', 'flye', 'extension',
  'pushdown', 'crunch', 'thruster', 'swing', 'clean', 'snatch', 'dip',
  'pullover', 'shrug', 'kickback', 'stepup', 'situp', 'crawl', 'hold',
  'walk', 'carry', 'twist', 'raises', 'rows', 'curls', 'squats',
]);

function normalize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const out: string[] = [];
  for (const raw of cleaned.split(' ')) {
    if (!raw) continue;
    const mapped = SYNONYM[raw] ?? raw;
    for (const token of mapped.split(' ')) {
      if (token && !STOP.has(token)) out.push(token);
    }
  }
  return out;
}

// ---- Inverse document frequency, computed once from the library ----------
// Rare tokens ("goblet", "thruster", "pulldown") identify a movement; common
// ones ("dumbbell", "press") barely narrow it down. IDF weights each token by
// how rare it is across all library names.

const DF = new Map<string, number>();
const LIB_TOKENS: string[][] = LIBRARY.map((entry) => {
  const tokens = normalize(entry.n);
  for (const token of new Set(tokens)) DF.set(token, (DF.get(token) ?? 0) + 1);
  return tokens;
});

const N = LIBRARY.length;
const idf = (token: string) => Math.log((N + 1) / ((DF.get(token) ?? 0) + 1)) + 1;

function headNoun(tokens: string[]): string | null {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (HEAD_NOUNS.has(tokens[i])) return tokens[i];
  }
  return null;
}

/** Rough English muscle word from a possibly-localized hint, for a small boost. */
const MUSCLE_HINTS: [RegExp, string[]][] = [
  [/chest|pec|صدر/i, ['chest']],
  [/back|lat|ظهر/i, ['lats', 'middle back', 'lower back']],
  [/shoulder|delt|كتف|أكتاف/i, ['shoulders']],
  [/bicep|باي/i, ['biceps']],
  [/tricep|تراي/i, ['triceps']],
  [/quad|thigh|فخذ/i, ['quadriceps']],
  [/glute|مؤخر/i, ['glutes']],
  [/hamstring|خلفي/i, ['hamstrings']],
  [/calf|calves|سمان/i, ['calves']],
  [/core|abs|abdom|بطن|وسط/i, ['abdominals']],
];

function muscleWords(hint?: string | null): string[] {
  if (!hint) return [];
  for (const [re, muscles] of MUSCLE_HINTS) if (re.test(hint)) return muscles;
  return [];
}

/**
 * Best library match for a query, or null if nothing clears the bar.
 *
 * @param query    The exercise name (English works best; see the plan-image route
 *                 for how non-English names are normalized before this is called).
 * @param hints    Optional equipment / muscle text to break ties.
 */
export function matchExerciseImages(
  query: string,
  hints: { equipment?: string | null; muscle?: string | null } = {},
): ExerciseImages | null {
  const qTokens = normalize(query);
  if (qTokens.length === 0) return null;

  const qSet = new Set(qTokens);
  const qHead = headNoun(qTokens);
  const wantMuscles = muscleWords(hints.muscle);
  const equip = (hints.equipment ?? '').toLowerCase();

  // Total possible weight of the query tokens, so the score is a 0..1 fraction
  // of what could have matched — comparable across queries of different lengths.
  const qWeight = qTokens.reduce((sum, tk) => sum + idf(tk), 0);

  let best: { entry: LibEntry; score: number } | null = null;

  for (let i = 0; i < LIBRARY.length; i += 1) {
    const entry = LIBRARY[i];
    const eTokens = LIB_TOKENS[i];
    const eSet = new Set(eTokens);

    let overlap = 0;
    for (const tk of qSet) if (eSet.has(tk)) overlap += idf(tk);
    if (overlap === 0) continue;

    // Coverage of BOTH sides: the match must explain most of the query and not
    // be a tiny fragment of a much longer library name.
    const eWeight = eTokens.reduce((sum, tk) => sum + idf(tk), 0);
    let score = (overlap / qWeight) * 0.75 + (overlap / eWeight) * 0.25;

    // The naming word agreeing is a strong signal; disagreeing is a red flag
    // (a "row" is not a "press" however many other words overlap).
    const eHead = headNoun(eTokens);
    if (qHead && eHead) {
      if (qHead === eHead) score += 0.15;
      else score -= 0.2;
    }

    // Small nudges from the structured hints.
    if (wantMuscles.length && entry.m.some((m) => wantMuscles.includes(m))) score += 0.05;
    if (equip && entry.e && equip.includes(entry.e.toLowerCase())) score += 0.04;

    if (!best || score > best.score) best = { entry, score };
  }

  // Tuned against the test set in scripts/test-match.mjs: below this, matches
  // are more often wrong than right, so we show an illustration instead.
  if (!best || best.score < 0.6) return null;

  const [start, end] = best.entry.i;
  return {
    start: IMAGE_BASE + start,
    end: IMAGE_BASE + (end ?? start),
    matched: best.entry.n,
  };
}
