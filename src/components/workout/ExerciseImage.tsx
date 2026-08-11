'use client';

import { useEffect, useState } from 'react';
import styles from './workout.module.css';

/**
 * The demonstration panel for an exercise.
 *
 * When the exercise has been matched to a real photo pair (the start and
 * mid-rep positions from the open free-exercise-db) the two frames are
 * cross-faded to animate the movement. When there is no confident match — an
 * unusual movement, a warm-up walk, a stretch — it falls back to a silhouette of
 * the right movement *pattern* (a squat looks like a squat, a press like a
 * press), never a generic standing figure that misrepresents the exercise.
 */

type Pattern = 'push' | 'pull' | 'squat' | 'hinge' | 'core' | 'cardio';

function patternFor(name: string, muscle: string, equipment: string): Pattern {
  const t = `${name} ${muscle} ${equipment}`.toLowerCase();
  const has = (re: RegExp) => re.test(t);

  if (has(/walk|march|jog|run|cardio|step[-\s]?touch|skip|مشي|هرول|رك[ضْ]|قلب|كارديو/)) return 'cardio';
  if (has(/plank|crunch|dead\s?bug|bird\s?dog|sit[-\s]?up|hold|core|abdom|بلانك|بطن|معدة|وسط|بلانْك/)) return 'core';
  if (has(/squat|lunge|leg\s?press|step[-\s]?up|sit[-\s]?to[-\s]?stand|wall\s?sit|سكوات|قرفص|طعن|فخذ|أرجل|سمان/)) return 'squat';
  if (has(/deadlift|rdl|hinge|bridge|hip|glute|good\s?morning|رفعة|روماني|مؤخر|حوض|جسر/)) return 'hinge';
  if (has(/row|pull|curl|shrug|lat|chin|سحب|تجديف|ظهر|باي|عقلة/)) return 'pull';
  return 'push';
}

/** Distinct line poses so the fallback reads as the actual movement. */
const POSE: Record<Pattern, React.ReactNode> = {
  push: (
    // Lying press: horizontal body, bar pressed above the chest.
    <g>
      <circle cx="96" cy="150" r="15" />
      <path d="M111 150h150" />
      <path d="M170 150v-46M210 150v-46" />
      <path d="M150 104h80" />
    </g>
  ),
  pull: (
    // Overhead pull-down: arms up to a bar, torso tall.
    <g>
      <path d="M96 44h128" />
      <circle cx="160" cy="96" r="16" />
      <path d="M160 112v58" />
      <path d="M160 118l-40-72M160 118l40-72" />
      <path d="M160 170l-26 48M160 170l26 48" />
    </g>
  ),
  squat: (
    // Deep squat: hips back, knees bent, torso upright-ish.
    <g>
      <circle cx="150" cy="70" r="16" />
      <path d="M150 86l14 60" />
      <path d="M164 146l40 6-6 62" />
      <path d="M164 146l-44 12 6 60" />
      <path d="M136 86h44" />
    </g>
  ),
  hinge: (
    // Hip hinge: torso folded forward, hips pushed back, weight hanging.
    <g>
      <circle cx="88" cy="92" r="15" />
      <path d="M103 96l96 26" />
      <path d="M199 122v76" />
      <path d="M199 122l-18 62" />
      <path d="M150 112v54" />
    </g>
  ),
  core: (
    // Forearm plank: long flat body from head to heels.
    <g>
      <circle cx="70" cy="150" r="14" />
      <path d="M84 154l150 30" />
      <path d="M96 156l-8 40M234 184l16 20" />
    </g>
  ),
  cardio: (
    // Mid-stride: one leg forward, arms swinging.
    <g>
      <circle cx="152" cy="58" r="16" />
      <path d="M152 74v58" />
      <path d="M152 92l-34 26M152 92l36 20" />
      <path d="M152 132l-30 60M152 132l34 54" />
    </g>
  ),
};

export function ExerciseImage({
  name,
  muscle,
  equipment,
  imageStart,
  imageEnd,
  height = 224,
}: {
  name: string;
  muscle: string;
  equipment: string;
  imageStart?: string;
  imageEnd?: string;
  height?: number;
}) {
  const [broken, setBroken] = useState(false);

  // A new exercise may reuse this component instance; reset the error state.
  useEffect(() => setBroken(false), [imageStart]);

  const hasPhoto = Boolean(imageStart) && !broken;

  if (hasPhoto) {
    const second = imageEnd ?? imageStart;
    return (
      <div className={styles.demo} style={{ height }}>
        {/* Plain <img>, not next/image: these are external CDN photos shown at a
            fixed small size, so Next's optimizer would add cost without benefit.
            The start frame sits underneath; the second fades in and out on top,
            so the pair reads as one rep. */}
        {/* Eager, not lazy: the demo is the hero of the sheet and always visible
            the moment it opens, so there is nothing to defer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.demoFrame}
          src={imageStart}
          alt={name}
          decoding="async"
          onError={() => setBroken(true)}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.demoFrame} ${styles.demoFrameTop}`}
          src={second}
          alt=""
          aria-hidden
          decoding="async"
        />
      </div>
    );
  }

  const pattern = patternFor(name, muscle, equipment);

  return (
    <div className={styles.demo} style={{ height }}>
      <svg
        viewBox="0 0 320 224"
        preserveAspectRatio="xMidYMid meet"
        className={styles.demoArt}
        role="img"
        aria-label={name}
      >
        <g
          fill="none"
          stroke="rgba(255,255,255,0.8)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {POSE[pattern]}
        </g>
      </svg>
    </div>
  );
}
