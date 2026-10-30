"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import styles from "./attachments.module.css";

/** A file attached to a message: what the chat shows of it, and the file itself when there is one */
export type ComposerFile = {
  id: string;
  name: string;
  /** In bytes */
  size: number;
  /** MIME type, e.g. "application/pdf" */
  type: string;
  /** A PDF's page count, once it's been read */
  pages?: number;
  /** Still being read in */
  loading?: boolean;
  /** About how long it takes to read in, ms: the loader fills over this long */
  loadMs?: number;
  file?: File;
};

let nextId = 0;
export const fileId = () => `file-${++nextId}`;

/** Reads a PDF's page count from its page tree (the largest /Count), or by counting its /Page objects. */
export async function countPdfPages(file: Blob): Promise<number | undefined> {
  try {
    const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => +(m[1] ?? m[2]));
    if (counts.length) return Math.max(...counts);
    const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length;
    return pages || undefined;
  } catch {
    return undefined;
  }
}

/** A dropped or picked file, as the composer holds it while it's read in (a PDF's pages are counted) */
export function toComposerFile(file: File): Omit<ComposerFile, "id"> {
  return { name: file.name, size: file.size, type: file.type, file, loading: true };
}

const KIND: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "text/plain": "TXT",
  "text/csv": "CSV",
};
export function fileKind(f: Pick<ComposerFile, "name" | "type">) {
  return KIND[f.type] ?? f.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "File";
}
export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** "PDF · 3 pages", or its size while the pages are unknown */
export function fileMeta(f: Pick<ComposerFile, "name" | "type" | "size" | "pages">) {
  return `${fileKind(f)} · ${f.pages ? `${f.pages} ${f.pages === 1 ? "page" : "pages"}` : formatSize(f.size)}`;
}

/** The name on two lines, as Figma's tile has it: a long one keeps its first word and its last ("Contractor / ...Agreement") */
export function nameLines(name: string): [string, string?] {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "");
  const words = base.split(/\s+/);
  if (base.length <= 17 || words.length < 3) return [base];
  return [words[0], `...${words[words.length - 1]}`];
}

type TileProps = {
  file: Pick<ComposerFile, "name" | "type" | "size" | "pages" | "loading" | "loadMs">;
  /** Shows a remove button on hover (and always on touch screens) */
  onRemove?: () => void;
  /** Makes the tile a link to the file, e.g. to download it */
  href?: string;
  download?: string;
  /** What sits at the top right once it's in (nothing, unless given) */
  corner?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * A file as a tile (Figma, posts › 140:51): its kind, a ring while it's read in, and its name on two lines.
 * Used in the composer and in the conversation.
 */
export function FileTile({ file, onRemove, href, download, corner, className, style }: TileProps) {
  const [first, second] = nameLines(file.name);
  const label = `${file.name}, ${file.loading ? "uploading" : fileMeta(file)}`;
  // a tile that was read in keeps its loader a moment once it's full, then lets it go
  const [hadLoader] = useState(!!file.loading);
  const inner = (
    <>
      <span className={styles.top}>
        <span className={styles.kind}>{fileKind(file)}</span>
        {hadLoader && !corner && <Loader done={!file.loading} ms={file.loadMs ?? 1200} />}
        {corner && !file.loading && (
          <span key="corner" className={styles.corner}>
            {corner}
          </span>
        )}
      </span>
      <span className={styles.name} aria-hidden="true">
        {first}
        {second && (
          <>
            <br />
            {second}
          </>
        )}
      </span>
    </>
  );
  return (
    <span className={`${styles.tile} ${className ?? ""}`} style={style} data-loading={file.loading ? "" : undefined}>
      {href ? (
        <a className={styles.face} href={href} download={download} aria-label={`Download ${label}`}>
          {inner}
        </a>
      ) : (
        <span className={styles.face} role="img" aria-label={label}>
          {inner}
        </span>
      )}
      {onRemove && (
        <button type="button" className={styles.remove} aria-label={`Remove ${file.name}`} onClick={onRemove}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * The loader: Figma's 12px ring (a grey track, its arc in blue/500), filling as the file reads in. It fills over
 * about `ms`, easing off towards the end as uploads do, closes the moment the file is in, then fades.
 */
function Loader({ done, ms }: { done: boolean; ms: number }) {
  return (
    <svg className={styles.loader} data-done={done || undefined} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5" stroke="#c2c2c2" strokeWidth="2" />
      <circle
        className={styles.loaderArc}
        cx="6"
        cy="6"
        r="5"
        stroke="#3b82f6"
        strokeWidth="2"
        pathLength={100}
        strokeDasharray="100"
        style={{ "--ms": `${ms}ms` } as CSSProperties}
      />
    </svg>
  );
}

/** A page with a folded corner and a few lines of text: the mark for a file */
export function PageGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 1.75h4.6l3.15 3.15v8.1c0 .7-.55 1.25-1.25 1.25H4.5c-.7 0-1.25-.55-1.25-1.25V3c0-.7.55-1.25 1.25-1.25Z" fill="#fff" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M9 1.9v2.35c0 .45.35.8.8.8h2.3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M5.6 8h4.8M5.6 10.1h4.8M5.6 12.2h2.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
