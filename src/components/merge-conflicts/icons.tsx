/* 14px line icons in the composer's style: 1.3 stroke, round caps and joins. */
import type { SVGProps } from "react";

const Svg = ({ children, size = 14, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

/** Git pull request: two commits on a branch, and the arrow back to the base */
export const PrIcon = (p: { size?: number; className?: string }) => (
  <Svg {...p}>
    <circle cx="3.75" cy="3.25" r="1.5" />
    <circle cx="3.75" cy="10.75" r="1.5" />
    <path d="M3.75 4.75v4.5" />
    <circle cx="10.25" cy="10.75" r="1.5" />
    <path d="M10.25 9.25V5.9c0-.97-.78-1.75-1.75-1.75H6.6" />
    <path d="M7.9 2.85 6.6 4.15l1.3 1.3" />
  </Svg>
);

/** Git merge: the branch curving back into the base */
export const MergeIcon = (p: { size?: number; className?: string }) => (
  <Svg {...p}>
    <circle cx="3.75" cy="3.25" r="1.5" />
    <circle cx="3.75" cy="10.75" r="1.5" />
    <circle cx="10.25" cy="7.5" r="1.5" />
    <path d="M3.75 4.75v4.5" />
    <path d="M3.75 4.75c0 1.6 1.3 2.75 2.9 2.75h2.1" />
  </Svg>
);

export const ChevronDown = (p: { size?: number; className?: string }) => (
  <Svg size={12} {...p}>
    <path d="M3.5 5.25 7 8.75l3.5-3.5" />
  </Svg>
);

export const ArrowRight = (p: { size?: number; className?: string }) => (
  <Svg size={12} {...p}>
    <path d="M2.75 7h8.5M8 3.75 11.25 7 8 10.25" />
  </Svg>
);

export const Warn = (p: { size?: number; className?: string }) => (
  <Svg {...p}>
    <path d="M6.13 2.3a1 1 0 0 1 1.74 0l4.6 8.1a1 1 0 0 1-.87 1.5H2.4a1 1 0 0 1-.87-1.5l4.6-8.1Z" />
    <path d="M7 5.6v2.3M7 9.9h.01" />
  </Svg>
);

export const Tick = (p: { size?: number; className?: string }) => (
  <Svg {...p}>
    <path d="M3.3 7.4 5.8 9.9l4.9-5.3" pathLength={1} />
  </Svg>
);

/** A ring with a quarter of it darker, turned by CSS */
export const Spinner = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
    <path d="M7 2a5 5 0 0 1 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** GitHub's mark (Octicons, MIT) */
export const GitHubMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);
