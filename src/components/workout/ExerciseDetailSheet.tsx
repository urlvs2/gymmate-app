'use client';

import { Button, Sheet, StatGrid } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { restLabel, schemeLabel } from '@/lib/domain/exercise';
import type { PlanExercise } from '@/lib/domain/types';
import { ExerciseArt } from './ExerciseArt';
import styles from './workout.module.css';

/** Full details for one exercise: artwork, scheme, equipment and the AI's cues. */
export function ExerciseDetailSheet({
  exercise,
  onClose,
}: {
  exercise: PlanExercise | null;
  onClose: () => void;
}) {
  const { t, lang } = usePreferences();
  if (!exercise) return null;

  return (
    <Sheet open onClose={onClose}>
      <ExerciseArt name={exercise.name} equipment={exercise.equipment} />

      <div className={styles.detailMuscle}>{exercise.muscle}</div>
      <div className={styles.detailName}>{exercise.name}</div>

      <StatGrid
        className={styles.detailStats}
        items={[
          { value: schemeLabel(exercise), label: t.setsReps },
          { value: restLabel(exercise.restSeconds, lang), label: t.rest },
          { value: exercise.equipment, label: t.equipment },
        ]}
      />

      {exercise.howTo.length > 0 && (
        <>
          <div className={styles.stepsLabel}>{t.howTo}</div>
          <div className={styles.steps}>
            {exercise.howTo.map((step, i) => (
              <div className={styles.step} key={i}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <span className={styles.stepText}>{step}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {exercise.note && <div className={styles.hint}>{exercise.note}</div>}

      <Button size="md" style={{ marginTop: 22 }} onClick={onClose}>
        {t.close}
      </Button>
    </Sheet>
  );
}
