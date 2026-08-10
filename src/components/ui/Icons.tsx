/** Line icons from the mockup. All inherit `currentColor` and stroke width. */

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
});

export function DumbbellIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.1} className={className} aria-hidden="true">
      <path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10" />
    </svg>
  );
}

export function ProfileIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c1-3.6 3.8-5.4 7.2-5.4s6.2 1.8 7.2 5.4" />
    </svg>
  );
}

export function SparkIcon({ size = 21, className }: IconProps) {
  return (
    <svg
      {...base(size)}
      strokeWidth={1.7}
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3.2l2.3 5.3 5.3 2.3-5.3 2.3L12 18.4l-2.3-5.3L4.4 10.8l5.3-2.3z" />
    </svg>
  );
}

export function WorkoutIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden="true">
      <path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9" />
    </svg>
  );
}

export function CalendarIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.7} className={className} aria-hidden="true">
      <rect x="3.6" y="5" width="16.8" height="15" rx="3" />
      <path d="M3.6 10h16.8M8.5 3.5v3M15.5 3.5v3" />
    </svg>
  );
}

export function SunIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </svg>
  );
}

export function MoonIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={1.9} className={className} aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
    </svg>
  );
}

export function ChevronIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2} className={className} aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4} className={className} aria-hidden="true">
      <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
    </svg>
  );
}
