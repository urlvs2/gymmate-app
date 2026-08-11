/**
 * Turns the free-text answer to "what equipment can you use?" into a rule the
 * plan generator must obey: the program may only contain exercises the person
 * can actually do with what they have.
 *
 * The answer is the model's own words, in either language ("just a pair of
 * dumbbells at home", "دمبل فقط", "full commercial gym"), so detection is
 * deliberately conservative. It only declares a restriction when the answer is
 * clearly limited; anything open-ended ("basic gym", "full gym") allows
 * everything, because the person genuinely has that equipment. Restricting only
 * the clear cases keeps it from ever rejecting a valid plan.
 */

export type EquipmentLevel = 'any' | 'dumbbell' | 'bodyweight';

export interface EquipmentPolicy {
  level: EquipmentLevel;
  /** A short description of what is allowed, for the repair instruction. */
  allowed: string;
  /**
   * The forbidden equipment named in an exercise, or null if it is allowed.
   * Checks both the exercise name and its equipment field, in English and
   * Arabic — a "Cable Face Pull" names its equipment in the title.
   */
  violation(name: string, equipment: string): string | null;
}

const ANY: EquipmentPolicy = {
  level: 'any',
  allowed: 'their equipment',
  violation: () => null,
};

// Resistance gear that a home lifter with only dumbbells does not have.
const NON_DUMBBELL =
  /\b(barbell|ez[-\s]?bar|smith|machine|cable|pulley|pulldown|pull[-\s]?down|lat\s?pull|pec\s?deck|leg\s?press|leg\s?extension|leg\s?curl|hack\s?squat|kettlebell|resistance\s?band|\bband\b)\b|بار|جهاز|ماكينة|كابل|بكرة|كيتل/i;

// Any resistance equipment at all — none of it is available bodyweight-only.
const ANY_EQUIPMENT =
  /\b(dumbbell|barbell|ez[-\s]?bar|smith|machine|cable|pulley|pulldown|pull[-\s]?down|lat\s?pull|pec\s?deck|leg\s?press|leg\s?extension|leg\s?curl|hack\s?squat|kettlebell|resistance\s?band|\bband\b|weight\s?plate|\bplate\b)\b|دمبل|بار|جهاز|ماكينة|كابل|بكرة|كيتل|أثقال/i;

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m ? m[0] : null;
}

const DUMBBELL_POLICY: EquipmentPolicy = {
  level: 'dumbbell',
  allowed: 'dumbbells and bodyweight only',
  violation: (name, equipment) => firstMatch(`${name} ${equipment}`, NON_DUMBBELL),
};

const BODYWEIGHT_POLICY: EquipmentPolicy = {
  level: 'bodyweight',
  allowed: 'bodyweight only — no equipment at all',
  violation: (name, equipment) => firstMatch(`${name} ${equipment}`, ANY_EQUIPMENT),
};

/** Reads the profile's equipment answer and returns the rule to enforce. */
export function equipmentPolicy(raw: string | null | undefined): EquipmentPolicy {
  const t = (raw ?? '').toLowerCase().trim();
  if (!t) return ANY;

  // A full/commercial gym has everything — never restrict.
  if (/full|commercial|complete|whole|proper|well[-\s]?equipped|everything|all\s+(the\s+)?(equipment|machines)|نادٍ|نادي|صالة|جيم|قاعة/.test(t)) {
    return ANY;
  }

  const mentionsDumbbell = /dumbbell|دمبل|goblet/.test(t);
  const mentionsHeavyGear = /barbell|machine|cable|بار|جهاز|كابل/.test(t);

  // "bodyweight" / "no equipment" / "nothing", with nothing else named.
  const bodyweightOnly =
    /body[-\s]?weight|calisthenic|no\s+(equipment|gear|weights)|without\s+(equipment|weights)|nothing|only\s+(me|myself)|floor\s+only|وزن\s+الجسم|بدون\s+(معدات|أدوات|أجهزة|أوزان)|لا\s+(معدات|أدوات|أجهزة)/.test(
      t,
    ) &&
    !mentionsDumbbell &&
    !mentionsHeavyGear;
  if (bodyweightOnly) return BODYWEIGHT_POLICY;

  // Dumbbells, and no gym or heavier gear alongside them.
  const dumbbellOnly = mentionsDumbbell && !mentionsHeavyGear && !/gym|صالة|نادي|قاعة/.test(t);
  if (dumbbellOnly) return DUMBBELL_POLICY;

  // "Basic gym" and anything ambiguous: the person has real equipment, so the
  // prompt's guidance is enough and a hard rule would risk false positives.
  return ANY;
}
