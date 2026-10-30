/* 12–14px icons in the composer's line style (1.2 stroke, round), plus VS Code's default file-type icons. */

export const Chevron = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Search = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="6.25" cy="6.25" r="4.375" stroke="currentColor" strokeWidth="1.4" />
    <path d="M9.625 9.625L12.25 12.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const Check = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="7" />
    <path d="M4.2 7.2L6.1 9.1L9.8 5.2" pathLength={1} />
  </svg>
);

const Globe = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M7 1.75C5.6 3.25 4.9 5 4.9 7C4.9 9 5.6 10.75 7 12.25C8.4 10.75 9.1 9 9.1 7C9.1 5 8.4 3.25 7 1.75ZM1.75 7H12.25"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const Doc = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7.875 1.75H4.083C3.439 1.75 2.917 2.272 2.917 2.917V11.083C2.917 11.728 3.439 12.25 4.083 12.25H9.917C10.561 12.25 11.083 11.728 11.083 11.083V4.958L7.875 1.75Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M7.875 1.75V4.958H11.083" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

// VS Code / Cursor's default file icons (Seti): coloured glyphs, no badge behind them.
const SETI_BLUE = "#519aba";

/** TypeScript: "TS" in Seti's blue. */
const TsIcon = () => (
  <svg width="14" height="13" viewBox="0 0 14 13" aria-hidden="true">
    <text
      x="7"
      y="10.2"
      textAnchor="middle"
      fontSize="9.5"
      fontWeight="800"
      fill={SETI_BLUE}
      fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
      letterSpacing="-0.4"
    >
      TS
    </text>
  </svg>
);

/** React (.tsx / .jsx): Seti's atom, in the same blue. */
const Atom = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <g stroke={SETI_BLUE} strokeWidth="1.05">
      <ellipse cx="7" cy="7" rx="5.9" ry="2.3" />
      <ellipse cx="7" cy="7" rx="5.9" ry="2.3" transform="rotate(60 7 7)" />
      <ellipse cx="7" cy="7" rx="5.9" ry="2.3" transform="rotate(120 7 7)" />
    </g>
    <circle cx="7" cy="7" r="1.3" fill={SETI_BLUE} />
  </svg>
);

/** The mark for a chip, by file extension: Seti's TS and React icons, a globe for the web. */
export function ChipIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "ts":
      return <TsIcon />;
    case "tsx":
      return <Atom />;
    case "web":
      return <Globe />;
    default:
      return <Doc />;
  }
}
