"use client";

import Image from "next/image";
import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./prompt-composer.module.css";
import folderIcon from "./icons/folder-02.svg";

export type Workspace = { name: string; path: string };

// Example recent projects; the first is the one in the Figma file.
export const WORKSPACES: Workspace[] = [
  { name: "acme-webapp", path: "~/Coding/acme-webapp" },
  { name: "acme-api", path: "~/Coding/acme-api" },
  { name: "design-system", path: "~/Coding/design-system" },
  { name: "marketing-site", path: "~/Sites/marketing-site" },
  { name: "mobile-app", path: "~/Coding/mobile-app" },
  { name: "infra", path: "~/Coding/infra" },
];

export function filterWorkspaces(query: string) {
  const q = query.trim().toLowerCase();
  return q ? WORKSPACES.filter((w) => w.name.includes(q) || w.path.toLowerCase().includes(q)) : WORKSPACES;
}

/**
 * Measures every project name at the chip's type, rounded up as Figma sizes text, so the
 * chip can animate its width when the project changes. Render `measurer` anywhere.
 */
export function useWorkspaceNameWidths() {
  const ref = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({ "acme-webapp": 83 });
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      const el = ref.current;
      if (cancelled || !el) return;
      const next: Record<string, number> = {};
      [...el.children].forEach((c, i) => {
        // hidden (the narrow layout drops the names), it measures "auto": keep the width it had
        const w = Math.ceil(parseFloat(getComputedStyle(c).width));
        if (Number.isFinite(w)) next[WORKSPACES[i].name] = w;
      });
      setWidths((old) => ({ ...old, ...next }));
    });
    return () => void (cancelled = true);
  }, []);
  const measurer = (
    <span ref={ref} className={styles.measure} aria-hidden="true">
      {WORKSPACES.map((w) => (
        <span key={w.name} className={styles.chipLabel}>
          {w.name}
        </span>
      ))}
    </span>
  );
  return [widths, measurer] as const;
}

type ChipProps = { name: string; width: number | undefined; open: boolean; onToggle: () => void };

/** The folder chip from Figma; it now opens the project picker. */
export const WorkspaceChip = forwardRef<HTMLButtonElement, ChipProps>(function WorkspaceChip(
  { name, width, open, onToggle },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.btn} ${styles.folder}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Project: ${name}`}
      onClick={onToggle}
    >
      <Image className={styles.icon} src={folderIcon} alt="" width={14} height={14} />
      <span className={styles.labelWrap} style={{ width }}>
        <span key={name} className={`${styles.chipLabel} ${styles.swapLabel}`}>
          {name}
        </span>
      </span>
    </button>
  );
});

type MenuProps = {
  open: boolean;
  current: string;
  query: string;
  active: number;
  onQuery: (query: string) => void;
  onActive: (index: number) => void;
  onPick: (name: string) => void;
  onClose: (returnFocus: boolean) => void;
};

/* Icons in the Figma set's style (14px, 1.2 stroke, round). Laptop and cloud are the Figma
   assets; the closed folder, folder-plus and chevron are drawn to match. */
const Folder = () => (
  <svg className={styles.wsIcon} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M1.75 3.5C1.75 2.856 2.272 2.333 2.917 2.333H5.135C5.444 2.333 5.741 2.456 5.96 2.675L6.952 3.667H11.083C11.728 3.667 12.25 4.189 12.25 4.833V10.5C12.25 11.144 11.728 11.667 11.083 11.667H2.917C2.272 11.667 1.75 11.144 1.75 10.5V3.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);
const FolderPlus = () => (
  <svg className={styles.wsIcon} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M12.25 6.708V4.833C12.25 4.189 11.728 3.667 11.083 3.667H6.952L5.96 2.675C5.741 2.456 5.444 2.333 5.135 2.333H2.917C2.272 2.333 1.75 2.856 1.75 3.5V10.5C1.75 11.144 2.272 11.667 2.917 11.667H7"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10.5 8.75V12.25M8.75 10.5H12.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const Chevron = () => (
  <svg className={styles.wsChevron} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5.25 3.5L8.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Current project">
    <path d="M3.5 7.4L5.9 9.8L10.5 4.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Row =
  | { kind: "recent"; name: string }
  | { kind: "action"; id: string; label: string; icon: ReactNode; more?: boolean };

// How many recent projects show before you search (search covers all of them).
const RECENT_LIMIT = 4;

// These actions aren't wired up yet; choosing one just closes the menu.
const ACTIONS: Row[] = [
  { kind: "action", id: "mac", label: "On This Mac", more: true, icon: <span className={`${styles.maskIcon} ${styles.laptop}`} /> },
  { kind: "action", id: "remote", label: "Remote", more: true, icon: <span className={`${styles.maskIcon} ${styles.cloud}`} /> },
  { kind: "action", id: "new", label: "New Folder", icon: <FolderPlus /> },
];

/** After Claude's project picker: search, recent projects (current one checked), and a few actions. */
export const WorkspaceMenu = forwardRef<HTMLDivElement, MenuProps>(function WorkspaceMenu(
  { open, current, query, active, onQuery, onActive, onPick, onClose },
  ref,
) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLUListElement>(null);
  const searching = query.trim() !== "";
  const matches = filterWorkspaces(query);
  const recents: Row[] = (searching ? matches : matches.slice(0, RECENT_LIMIT)).map((w) => ({ kind: "recent", name: w.name }));
  // Everything the arrow keys walk through, in order.
  const rows = searching ? recents : [...recents, ...ACTIONS];
  const act = Math.min(active, rows.length - 1);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  }, [open]);

  // When the list scrolls, keep the highlighted row in view; start at the top on open.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !open) return;
    const el = body.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < body.scrollTop + 26) body.scrollTop = Math.max(0, top - 26);
    else if (bottom > body.scrollTop + body.clientHeight - 4) body.scrollTop = bottom - body.clientHeight + 4;
  }, [act, open]);

  const choose = (row: Row) => (row.kind === "recent" ? onPick(row.name) : onClose(true));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) onActive((act + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[act]) choose(rows[act]);
    }
  };

  const q = query.trim().toLowerCase();
  const highlight = (name: string) => {
    const at = q ? name.indexOf(q) : -1;
    if (at < 0) return name;
    return (
      <>
        {name.slice(0, at)}
        <b>{name.slice(at, at + q.length)}</b>
        {name.slice(at + q.length)}
      </>
    );
  };

  const renderRow = (row: Row, i: number) => (
    <li
      key={row.kind === "recent" ? row.name : row.id}
      id={`${listId}-${i}`}
      role="option"
      aria-selected={i === act}
      className={styles.wsItem}
      onPointerEnter={() => onActive(i)}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => choose(row)}
    >
      {row.kind === "recent" ? <Folder /> : row.icon}
      <span className={styles.wsName}>{row.kind === "recent" ? highlight(row.name) : row.label}</span>
      {row.kind === "recent" ? row.name === current ? <Check /> : <span /> : row.more ? <Chevron /> : <span />}
    </li>
  );

  return (
    <div
      ref={ref}
      className={`${styles.popover} ${styles.anchored} ${styles.wsPop}`}
      data-open={open}
      role="dialog"
      aria-label="Projects"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose(true);
        }
      }}
    >
      <input
        ref={inputRef}
        className={styles.wsInput}
        value={query}
        placeholder="Search repos, cloud environments…"
        spellCheck={false}
        autoComplete="off"
        tabIndex={open ? 0 : -1}
        role="combobox"
        aria-label="Search projects"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={rows[act] ? `${listId}-${act}` : undefined}
        onChange={(e) => {
          onQuery(e.target.value);
          onActive(0);
        }}
        onKeyDown={onKeyDown}
      />

      <ul ref={bodyRef} id={listId} className={styles.wsBody} role="listbox" aria-label="Projects">
        <li className={styles.wsSection} role="presentation">
          Recents
        </li>
        {recents.map((row, i) => renderRow(row, i))}
        {searching && !recents.length && <li className={styles.wsEmpty}>No projects match “{query.trim()}”</li>}
        {!searching && (
          <>
            <li className={styles.wsSep} role="separator" />
            {ACTIONS.map((row, i) => renderRow(row, recents.length + i))}
          </>
        )}
      </ul>
    </div>
  );
});
