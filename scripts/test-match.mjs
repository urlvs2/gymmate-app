// Sanity-checks the exercise matcher against realistic model output. Run with:
//   node scripts/test-match.mjs
// It imports the compiled matcher logic by re-implementing the import path via a
// tiny loader, so it stays in sync with src/lib/exercises/match.ts.

import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const LIBRARY = JSON.parse(readFileSync(new URL('../src/lib/exercises/library.json', import.meta.url)));

// --- inline copy of the scoring so we can test without a TS build ---
const STOP = new Set(['the','a','an','with','and','to','of','on','for','your','my','exercise','variation','version','style','easy','basic','simple','beginner','gentle','light','free','no']);
const SYN = { db:'dumbbell', dbs:'dumbbell', bb:'barbell', bw:'bodyweight', rdl:'romanian deadlift', ohp:'overhead press', pushups:'push up', pushup:'push up', pullup:'pull up', pullups:'pull up', situp:'sit up', glutes:'glute', hamstrings:'hamstring', quads:'quadriceps', quad:'quadriceps', calves:'calf', abs:'abdominals' };
const HEAD = new Set(['press','squat','row','curl','deadlift','raise','lunge','bridge','plank','pushup','pullup','pulldown','fly','flye','extension','pushdown','crunch','thruster','swing','clean','snatch','dip','pullover','shrug','kickback','stepup','situp','crawl','hold','walk','carry','twist','raises','rows','curls','squats']);
const norm = (t) => {
  const c = t.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();
  const out = [];
  for (const raw of c.split(' ')) { if(!raw) continue; const m = SYN[raw] ?? raw; for (const tok of m.split(' ')) if (tok && !STOP.has(tok)) out.push(tok); }
  return out;
};
const DF = new Map();
const LT = LIBRARY.map(e => { const t = norm(e.n); for (const x of new Set(t)) DF.set(x,(DF.get(x)??0)+1); return t; });
const NN = LIBRARY.length;
const idf = (t) => Math.log((NN+1)/((DF.get(t)??0)+1))+1;
const head = (ts) => { for (let i=ts.length-1;i>=0;i--) if (HEAD.has(ts[i])) return ts[i]; return null; };
function match(query) {
  const qt = norm(query); if (!qt.length) return null;
  const qs = new Set(qt); const qh = head(qt);
  const qw = qt.reduce((s,t)=>s+idf(t),0);
  let best = null;
  for (let i=0;i<LIBRARY.length;i++){
    const es = new Set(LT[i]); let ov = 0;
    for (const t of qs) if (es.has(t)) ov += idf(t);
    if (!ov) continue;
    const ew = LT[i].reduce((s,t)=>s+idf(t),0);
    let sc = (ov/qw)*0.75 + (ov/ew)*0.25;
    const eh = head(LT[i]);
    if (qh && eh) { if (qh===eh) sc+=0.15; else sc-=0.2; }
    if (!best || sc>best.s) best = { n: LIBRARY[i].n, s: sc };
  }
  if (!best || best.s < 0.6) return null;
  return best;
}

// Realistic model output (English side; Arabic names are normalized to English
// by the plan-image route before matching, so English is what the matcher sees).
const cases = [
  'Barbell Bench Press', 'Dumbbell Bench Press', 'Dumbbell Floor Press',
  'Goblet Squat', 'Bodyweight Squat', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift',
  'Lat Pulldown', 'Seated Cable Row', 'One-Arm Dumbbell Row', 'Bent-Over Row',
  'Dumbbell Shoulder Press', 'Standing Dumbbell Shoulder Press', 'Lateral Raise',
  'Dumbbell Bicep Curl', 'Triceps Pushdown', 'Rope Triceps Pushdown',
  'Plank', 'Glute Bridge', 'Reverse Lunge', 'Walking Lunge', 'Push-Up', 'Incline Push-Up',
  'Standing Calf Raise', 'Leg Press', 'Face Pull', 'Dead Bug', 'Bird Dog', 'Wall Sit',
  'Dumbbell Thruster', 'Renegade Row', 'Step-Up', 'Sumo Squat', 'Dumbbell Pullover',
  // Deliberately vague / non-exercise — SHOULD return null:
  'Warm-up walk and easy marching', 'Easy indoor walk', 'Easy step-touch intervals',
  'Chair-free squat', 'Rest and stretch',
];

let hit = 0, miss = 0;
for (const c of cases) {
  const m = match(c);
  const flag = m ? `✓ ${m.n} (${m.s.toFixed(2)})` : '· no match';
  if (m) hit++; else miss++;
  console.log(c.padEnd(38), flag);
}
console.log(`\nmatched ${hit}/${cases.length}, unmatched ${miss}`);
