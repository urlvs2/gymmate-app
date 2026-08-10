'use client';

/**
 * Illustration for an exercise.
 *
 * There is no photo library behind GymMate, so rather than shipping a broken
 * image slot each exercise gets a generated panel: a deterministic gradient
 * derived from its name plus a silhouette hinting at the equipment. It reads as
 * artwork, never as a missing asset.
 */

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

type Shape = 'barbell' | 'dumbbell' | 'machine' | 'body';

function shapeFor(equipment: string, name: string): Shape {
  const text = `${equipment} ${name}`.toLowerCase();
  if (/barbell|bar\b|ez|smith/.test(text)) return 'barbell';
  if (/dumbbell|kettlebell|goblet/.test(text)) return 'dumbbell';
  if (/machine|cable|press|pulldown|rope|pulley/.test(text)) return 'machine';
  return 'body';
}

export function ExerciseArt({
  name,
  equipment,
  height = 224,
}: {
  name: string;
  equipment: string;
  height?: number;
}) {
  const seed = hash(name);
  const hue = seed % 360;
  const shape = shapeFor(equipment, name);
  const gradientId = `art-${seed.toString(36)}`;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface2)',
      }}
    >
      <svg
        viewBox="0 0 320 224"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', display: 'block' }}
        role="img"
        aria-label={name}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`oklch(0.42 0.09 ${hue})`} />
            <stop offset="100%" stopColor={`oklch(0.24 0.05 ${(hue + 40) % 360})`} />
          </linearGradient>
        </defs>

        <rect width="320" height="224" fill={`url(#${gradientId})`} />
        <circle cx="252" cy="42" r="86" fill="rgba(255,255,255,0.05)" />
        <circle cx="52" cy="196" r="64" fill="rgba(255,255,255,0.04)" />

        <g
          transform="translate(160 112)"
          fill="none"
          stroke="rgba(255,255,255,0.82)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {shape === 'barbell' && (
            <>
              <path d="M-96 0h192" />
              <path d="M-76 -26v52M-60 -38v76M60 -38v76M76 -26v52" />
            </>
          )}
          {shape === 'dumbbell' && (
            <>
              <path d="M-46 0h92" />
              <path d="M-58 -30v60M-40 -20v40M40 -20v40M58 -30v60" />
            </>
          )}
          {shape === 'machine' && (
            <>
              <path d="M-70 -54v108M-70 -54h44a26 26 0 0 1 0 52h-44" />
              <path d="M40 -54v40a34 34 0 0 1-34 34h-8" />
              <path d="M40 40h44M62 40v-24" />
            </>
          )}
          {shape === 'body' && (
            <>
              <circle cx="0" cy="-52" r="18" />
              <path d="M0 -34v46M0 12l-26 44M0 12l26 44M-34 -14l34 10 34-10" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
