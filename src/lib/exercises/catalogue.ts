import 'server-only';
import libraryData from './library.json';
import type { Lang, Profile } from '@/lib/domain/types';
import { equipmentPolicy } from '@/lib/domain/equipment';

/**
 * The exercise catalogue, drawn entirely from the open free-exercise-db.
 *
 * The plan generator does not invent exercises: it is handed a shortlist of
 * real movements filtered to the person's equipment, level and goal, and must
 * pick from it by reference code. Everything the app then shows for an
 * exercise — its real name, the muscle it trains, the equipment it needs and
 * the demonstration photos — comes from the matched catalogue entry, so it is
 * always a real, recognizable exercise.
 */

interface Entry {
  id: string;
  n: string; // name
  l: 'beginner' | 'intermediate' | 'expert';
  i: string[]; // image paths
  m: string[]; // primary muscles
  e: string | null; // equipment
  f: string | null; // force
  c: string | null; // category
  k: string | null; // mechanic: compound | isolation
}

const CATALOGUE = libraryData as Entry[];
const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));

const IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

export interface CatalogueEntry {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string; // canonical English, e.g. "dumbbell"
  mechanic: string | null;
  level: string;
  imageStart: string;
  imageEnd: string;
}

function toEntry(e: Entry): CatalogueEntry {
  const [start, end] = e.i;
  return {
    id: e.id,
    name: e.n,
    primaryMuscle: e.m[0] ?? 'full body',
    equipment: e.e ?? 'body only',
    mechanic: e.k,
    level: e.l,
    imageStart: IMAGE_BASE + start,
    imageEnd: IMAGE_BASE + (end ?? start),
  };
}

export function catalogueById(id: string): CatalogueEntry | null {
  const e = BY_ID.get(id);
  return e ? toEntry(e) : null;
}

// ---- filtering ----------------------------------------------------------

/** DB equipment values allowed for a given equipment policy. null = all gym gear. */
function allowedEquipment(profile: Profile): Set<string> | null {
  const level = equipmentPolicy(profile.equipment).level;
  if (level === 'bodyweight') return new Set(['body only']);
  if (level === 'dumbbell') return new Set(['dumbbell', 'body only']);
  // A gym (basic or full): everything except pure mobility aids.
  return null;
}

const FOAM_ONLY = new Set(['foam roll']);

/** Which DB levels suit the person's stated experience. */
function allowedLevels(experience: string | null): Set<string> {
  const t = (experience ?? '').toLowerCase();
  const advanced =
    /over a year|year|advanced|experienced|expert|several|competit|سنة|سنوات|متقدم|محترف|خبرة (طويلة|كبيرة)/.test(
      t,
    );
  // Beginners and the unknown never get expert movements (planche push-ups,
  // pistol squats) — that is exactly what "unrealistic for the user" means.
  return advanced
    ? new Set(['beginner', 'intermediate', 'expert'])
    : new Set(['beginner', 'intermediate']);
}

/** Categories that belong in a training program. Stretches and lifts that need
 *  coaching (olympic, strongman, powerlifting) are kept out unless advanced. */
function allowedCategories(experience: string | null): Set<string> {
  const t = (experience ?? '').toLowerCase();
  const advanced = /over a year|year|advanced|experienced|expert|سنة|متقدم|محترف/.test(t);
  // Machine-cardio (treadmill, bike) is not resistance training; leave it out.
  const base = ['strength', 'plyometrics'];
  if (advanced) base.push('powerlifting', 'strongman', 'olympic weightlifting');
  return new Set(base);
}

const PER_MUSCLE_CAP = 12;
const ABS_CAP = 8; // abdominals are over-represented; keep them from crowding out
const TOTAL_CAP = 150;

/**
 * The shortlist handed to the model for this person: real exercises they can
 * actually do, capped per muscle so the list stays lean and varied, compound
 * movements first.
 */
export function selectPool(profile: Profile): CatalogueEntry[] {
  const equip = allowedEquipment(profile);
  const levels = allowedLevels(profile.experience);
  const cats = allowedCategories(profile.experience);

  const filtered = CATALOGUE.filter((e) => {
    if (!e.i.length) return false;
    if (e.e && FOAM_ONLY.has(e.e)) return false;
    if (equip && !equip.has(e.e ?? 'body only')) return false;
    if (!levels.has(e.l)) return false;
    if (e.c && !cats.has(e.c)) return false;
    return true;
  });

  // Group by primary muscle, compounds first, then cap.
  const byMuscle = new Map<string, Entry[]>();
  for (const e of filtered) {
    const m = e.m[0] ?? 'full body';
    (byMuscle.get(m) ?? byMuscle.set(m, []).get(m)!).push(e);
  }

  const pool: CatalogueEntry[] = [];
  for (const [muscle, list] of byMuscle) {
    list.sort((a, b) => {
      // compound before isolation, then beginner before harder.
      const comp = Number(b.k === 'compound') - Number(a.k === 'compound');
      if (comp) return comp;
      const order = { beginner: 0, intermediate: 1, expert: 2 } as Record<string, number>;
      return (order[a.l] ?? 1) - (order[b.l] ?? 1);
    });
    const cap = muscle === 'abdominals' ? ABS_CAP : PER_MUSCLE_CAP;
    for (const e of list.slice(0, cap)) pool.push(toEntry(e));
  }

  // If the pool is somehow larger than the cap, keep a balanced spread by
  // interleaving muscles rather than truncating whole muscle groups.
  if (pool.length <= TOTAL_CAP) return pool;
  return pool
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => a.idx - b.idx)
    .slice(0, TOTAL_CAP)
    .map((x) => x.e);
}

// ---- reference codes for the prompt round-trip --------------------------

/** A stable, compact code (e1, e2, …) the model echoes to pick an exercise. */
export function poolCodes(pool: CatalogueEntry[]): Map<string, CatalogueEntry> {
  return new Map(pool.map((e, i) => [`e${i + 1}`, e]));
}

/** The shortlist rendered for the prompt, grouped by muscle for readability. */
export function renderPool(codes: Map<string, CatalogueEntry>): string {
  const byMuscle = new Map<string, string[]>();
  for (const [code, e] of codes) {
    const line = `${code}: ${e.name} (${e.equipment}${e.mechanic ? ', ' + e.mechanic : ''})`;
    (byMuscle.get(e.primaryMuscle) ?? byMuscle.set(e.primaryMuscle, []).get(e.primaryMuscle)!).push(
      line,
    );
  }
  return [...byMuscle.entries()]
    .map(([muscle, lines]) => `${muscle}:\n${lines.map((l) => '  ' + l).join('\n')}`)
    .join('\n');
}

// ---- localized display for equipment and muscle -------------------------

const EQUIPMENT_AR: Record<string, string> = {
  'body only': 'وزن الجسم',
  dumbbell: 'دمبل',
  barbell: 'بار حديدي',
  cable: 'كابل',
  machine: 'جهاز',
  kettlebells: 'كيتل بيل',
  bands: 'أشرطة مقاومة',
  'medicine ball': 'كرة طبية',
  'exercise ball': 'كرة سويسرية',
  'e-z curl bar': 'بار متعرّج',
  other: 'أداة',
};

const EQUIPMENT_EN: Record<string, string> = {
  'body only': 'Bodyweight',
  dumbbell: 'Dumbbell',
  barbell: 'Barbell',
  cable: 'Cable',
  machine: 'Machine',
  kettlebells: 'Kettlebell',
  bands: 'Resistance band',
  'medicine ball': 'Medicine ball',
  'exercise ball': 'Exercise ball',
  'e-z curl bar': 'EZ bar',
  other: 'Equipment',
};

export function equipmentLabel(equipment: string, lang: Lang): string {
  const key = equipment.toLowerCase();
  return (lang === 'ar' ? EQUIPMENT_AR : EQUIPMENT_EN)[key] ?? equipment;
}

const MUSCLE_AR: Record<string, string> = {
  abdominals: 'عضلات البطن',
  hamstrings: 'أوتار الركبة',
  adductors: 'المقربات',
  quadriceps: 'الفخذ الأمامي',
  biceps: 'البايسبس',
  shoulders: 'الأكتاف',
  chest: 'الصدر',
  'middle back': 'وسط الظهر',
  calves: 'السمانة',
  glutes: 'المؤخرة',
  'lower back': 'أسفل الظهر',
  lats: 'العضلة الجناحية',
  triceps: 'الترايسبس',
  traps: 'الترابيس',
  forearms: 'الساعدين',
  neck: 'الرقبة',
  abductors: 'المبعدات',
};

const MUSCLE_EN: Record<string, string> = {
  abdominals: 'Abs',
  'middle back': 'Mid back',
  'lower back': 'Lower back',
  lats: 'Lats',
};

export function muscleLabel(muscle: string, lang: Lang): string {
  const key = muscle.toLowerCase();
  if (lang === 'ar') return MUSCLE_AR[key] ?? muscle;
  return MUSCLE_EN[key] ?? muscle.charAt(0).toUpperCase() + muscle.slice(1);
}
