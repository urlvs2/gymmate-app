import type { PlanExercise } from './types';

/**
 * A stable identity for an exercise so today's "Goblet Squat" matches the one
 * logged three weeks ago even if the AI words it slightly differently.
 */
export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9؀-ۿ]+/g, '-') // keep latin, digits and arabic

    .replace(/^-+|-+$/g, '');
}

/** "90s" style label used across the workout screen. */
export function restLabel(seconds: number, lang: 'en' | 'ar'): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const m = seconds / 60;
    return lang === 'ar' ? `${m} د` : `${m}m`;
  }
  return lang === 'ar' ? `${seconds} ث` : `${seconds}s`;
}

export function schemeLabel(ex: Pick<PlanExercise, 'sets' | 'reps'>): string {
  return `${ex.sets} × ${ex.reps}`;
}
