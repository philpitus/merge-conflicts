"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useImperativeHandle,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import styles from "./prompt-composer.module.css";
import { isSkillPrefix, searchSkills } from "./skills";
import { DEFAULT_EFFORT, EffortChip, EffortPanel, MAX_EFFORT, useEffortLabelWidths } from "./effort";
import { useBurst } from "./max-burst";
import { useAnchor } from "./use-anchor";
import { useDismiss } from "./use-dismiss";
import { WORKSPACES, WorkspaceChip, WorkspaceMenu, useWorkspaceNameWidths } from "./workspace";
import plusIcon from "./icons/plus.svg";
import micIcon from "./icons/mic-01.svg";
import { punctuate } from "./punctuate";
import { useDictation, type DictationError } from "./use-dictation";
import { Waveform } from "./waveform";
import arrowUpIcon from "./icons/arrow-up-02.svg";
import { FileTile, countPdfPages, fileId, toComposerFile, type ComposerFile } from "./attachments";

/** Something to mention with "@", such as a connector: its name, a line about it, and its logo (an image URL) */
export type Mention = { name: string; description: string; icon: string };

/** For a page that scripts the composer, as someone typing into it would */
export type ComposerHandle = {
  /** Types the text in, a key at a time: on from what's in the field if the text starts with it, else from empty */
  type: (text: string, signal: AbortSignal) => Promise<void>;
  /** Picks the highlighted skill or mention, as Enter would */
  accept: () => void;
  /** Sends what's in the field */
  send: () => void;
  /** Attaches files, as dropping them on the card would; ones without a File take `loadMs` to read in */
  attach: (files: Omit<ComposerFile, "id">[], loadMs?: number) => void;
};

type Props = {
  /** Loop a scripted session (type, accept the skill, switch project, switch to Remote and back, try Max effort, send). */
  demo?: boolean;
  /** Called with what you sent, for a chat built around the composer */
  onSend?: (text: string, files: ComposerFile[]) => void;
  /** Lets files be attached: "+" opens a picker for these types, and they can be dropped on the card */
  attachments?: { accept: string };
  placeholder?: string;
  /** What "@" offers: typing it opens the list, and a picked one sits in the text with its logo */
  mentions?: Mention[];
  handle?: Ref<ComposerHandle>;
  /** More controls at the start of the toolbar's right-hand group (a context meter, say) */
  accessory?: ReactNode;
  /** Show the effort control (on by default) */
  showEffort?: boolean;
};

/** A row in the list under "/" (a skill) or "@" (a mention, with its logo) */
type Option = { name: string; description: string; icon?: string };

type Env = "local" | "remote";

// What the demo types: the state shown in Figma, up to "/improve-codeb" with the rest suggested.
const DEMO_TEXT = "yeah so for this just use /improve-codeb";

// Send animation: each word lifts out over FLY_MS, starting FLY_STAGGER ms after the previous one.
const FLY_MS = 420;
const FLY_STAGGER = 18;
// After a send, the field keeps its height this long, then shrinks to one line over SHRINK_MS
const SHRINK_DELAY_MS = 180;
const SHRINK_MS = 500;
const SHRINK_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // gentle: settles without snapping

// Label widths at 12px / 460, used until the real ones are measured.
const LABEL_FALLBACK = { local: 31, remote: 44 };

/** The "/command" or "@mention" the caret is in, if any. */
function commandAt(text: string, caret: number) {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  const trigger = text[start];
  if (trigger !== "/" && trigger !== "@") return null;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { start, end, query: text.slice(start + 1, caret), trigger };
}

/** The mentions matching what's typed after "@": names starting with it, then names containing it. */
function searchMentions(mentions: Mention[], query: string) {
  const q = query.toLowerCase();
  const starts = mentions.filter((m) => m.name.toLowerCase().startsWith(q));
  return [...starts, ...mentions.filter((m) => !starts.includes(m) && m.name.toLowerCase().includes(q))];
}

type Part = { text: string; command?: boolean; mention?: Mention };
/** Splits text into plain runs, "/command" runs that name (or are becoming) a skill, and "@Name" mentions. */
function tokenize(text: string, mentions: Mention[]) {
  const parts: Part[] = [];
  const re = /(^|\s)([/@][\w-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const word = m[2].slice(1);
    const mention = m[2][0] === "@" ? mentions.find((x) => x.name === word) : undefined;
    const command = m[2][0] === "/" ? isSkillPrefix(word) : mentions.some((x) => x.name.toLowerCase().startsWith(word.toLowerCase()));
    if (!mention && !command) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push(mention ? { text: m[2], mention } : { text: m[2], command: true });
    last = start + m[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** A picked mention, in the text: its logo stands where the "@" is, so the field's width (and caret) don't move */
function MentionRun({ mention }: { mention: Mention }) {
  return (
    <span className={styles.mention}>
      <span className={styles.mentionAt} style={{ "--icon": `url("${mention.icon}")` } as CSSProperties}>
        @
      </span>
      {mention.name}
    </span>
  );
}

/** How long a pause in speech before the language model tidies the punctuation */
const PUNCTUATE_PAUSE_MS = 700;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("aborted", "AbortError"))));
  });

const NO_MENTIONS: Mention[] = [];

export function PromptComposer({ demo = false, onSend, placeholder = "Ask anything, or type / for skills", mentions = NO_MENTIONS, handle, accessory, showEffort = true, attachments }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const localLabelRef = useRef<HTMLSpanElement>(null);
  const remoteLabelRef = useRef<HTMLSpanElement>(null);
  const scriptRef = useRef<AbortController | null>(null);

  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [env, setEnv] = useState<Env>("local");
  const [workspace, setWorkspace] = useState(WORKSPACES[0].name);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsQuery, setWsQuery] = useState("");
  const [wsActive, setWsActive] = useState(0);
  const wsChipRef = useRef<HTMLButtonElement>(null);
  const [wsWidths, wsMeasurer] = useWorkspaceNameWidths();
  const [effort, setEffort] = useState(DEFAULT_EFFORT);
  const [effortOpen, setEffortOpen] = useState(false);
  const effortChipRef = useRef<HTMLButtonElement>(null);
  const [effortWidths, effortMeasurer] = useEffortLabelWidths();
  const rootRef = useRef<HTMLDivElement>(null);
  // toolbar menus hang from their buttons
  const effortPanelRef = useAnchor<HTMLDivElement>(effortOpen, rootRef, effortChipRef, "end");
  const wsMenuRef = useAnchor<HTMLDivElement>(wsOpen, rootRef, wsChipRef, "start");
  const cardRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLSpanElement>(null);
  const BURST_INSET = 180; // the particle canvas reaches this far past the composer
  const { canvasRef: burstCanvasRef, burst } = useBurst(BURST_INSET);
  const [labels, setLabels] = useState(LABEL_FALLBACK);
  // Sent messages animating out of the field (there is no message list to send them to).
  const [outgoing, setOutgoing] = useState<{ id: number; text: string }[]>([]);
  const [sends, setSends] = useState(0);
  const sendId = useRef(0);
  // Attached files, and the ones lifting away after a send
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [leaving, setLeaving] = useState<ComposerFile[]>([]);
  const [dropping, setDropping] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const dictation = useDictation();
  // While dictating: the text from before it started, and where the dictated words begin
  const [dict, setDict] = useState<{ base: string; from: number } | null>(null);
  // The language-model punctuation pass: which session it's for, what it has answered, and whether it's set up
  const smart = useRef({ session: 0, raw: "", timer: undefined as ReturnType<typeof setTimeout> | undefined, cache: new Map<string, string>(), off: false });

  const command = useMemo(() => commandAt(text, caret), [text, caret]);
  const results: Option[] = useMemo(
    () => (!command ? [] : command.trigger === "@" ? searchMentions(mentions, command.query) : searchSkills(command.query)),
    [command, mentions],
  );
  const open = !!command && results.length > 0 && !dismissed;
  const current = open ? results[Math.min(active, results.length - 1)] : null;

  // While the list fades out, keep showing the rows it had, instead of an empty box.
  const live = { results, query: command?.query.toLowerCase() ?? "", active: Math.min(active, results.length - 1) };
  const [shown, setShown] = useState(live);
  if (open && (shown.results !== live.results || shown.query !== live.query || shown.active !== live.active)) {
    setShown(live);
  }
  const list = open ? live : shown;
  const suggestion =
    current && command && command.query && caret === command.end && current.name.toLowerCase().startsWith(command.query.toLowerCase())
      ? current.name.slice(command.query.length)
      : "";

  // ---------- editing ----------
  const sync = useCallback((value: string, pos: number) => {
    setText(value);
    setCaret(pos);
    setActive(0);
    setDismissed(false);
  }, []);

  const accept = useCallback(
    (skill: Option) => {
      if (!command) return;
      const insert = `${command.trigger}${skill.name} `;
      const value = text.slice(0, command.start) + insert + text.slice(command.end).replace(/^\s/, "");
      const pos = command.start + insert.length;
      sync(value, pos);
      setDismissed(true);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
    },
    [command, text, sync],
  );

  const stopScript = () => {
    scriptRef.current?.abort();
    scriptRef.current = null;
  };

  // Sends a message: the field clears at once and the text flies out word by word.
  // A message of several lines would leave the card snapping to one line under the departing words,
  // so the field holds its height while they lift off, then eases down.
  const fieldRef = useRef<HTMLDivElement>(null);
  const shrinkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const launch = useCallback(
    (value: string) => {
      if (!value.trim()) return;
      const field = fieldRef.current;
      if (field) {
        clearTimeout(shrinkTimer.current);
        field.style.transition = "none";
        field.style.minHeight = `${field.offsetHeight}px`;
        shrinkTimer.current = setTimeout(() => {
          // ease down to the height the field has now (the empty line), then let go of it
          const target = field.querySelector<HTMLElement>(`.${styles.mirror}`)?.offsetHeight ?? 0;
          field.style.transition = matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : `min-height ${SHRINK_MS}ms ${SHRINK_EASE}`;
          field.style.minHeight = `${target}px`;
          shrinkTimer.current = setTimeout(() => {
            field.style.transition = "";
            field.style.minHeight = "";
          }, SHRINK_MS + 20);
        }, SHRINK_DELAY_MS);
      }
      const id = ++sendId.current;
      const words = value.split(/\s+/).filter(Boolean).length;
      setOutgoing((o) => [...o, { id, text: value }]);
      setSends((n) => n + 1);
      sync("", 0);
      setTimeout(() => setOutgoing((o) => o.filter((m) => m.id !== id)), FLY_MS + Math.min(words, 30) * FLY_STAGGER + 50);
    },
    [sync],
  );
  const send = () => {
    stopScript();
    // nothing goes until every file is in
    if ((!text.trim() && !files.length) || files.some((f) => f.loading)) return;
    launch(text);
    if (files.length) {
      const sent = files;
      setLeaving(sent);
      setFiles([]);
      setTimeout(() => setLeaving((l) => (l === sent ? [] : l)), 460);
    }
    onSend?.(text.trim(), files);
    inputRef.current?.focus({ preventScroll: true });
  };

  // ---------- attachments ----------
  // each file is read in (a PDF's pages counted) while its tile shows a ring, for at least a beat
  const attach = useCallback((added: Omit<ComposerFile, "id">[], loadMs = 1200) => {
    const withIds = added.map((f) => ({ ...f, id: fileId(), loading: true, loadMs: f.file ? 700 : loadMs }));
    setFiles((fs) => [...fs, ...withIds]);
    for (const f of withIds) {
      const read =
        f.file && f.type === "application/pdf" && f.pages == null ? countPdfPages(f.file) : Promise.resolve(f.pages);
      const beat = new Promise((r) => setTimeout(r, f.file ? 700 : loadMs));
      Promise.all([read, beat]).then(([pages]) =>
        setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, pages: pages ?? x.pages, loading: false } : x))),
      );
    }
  }, []);
  const accepts = (f: File) =>
    !attachments ||
    attachments.accept.split(",").some((a) => {
      const t = a.trim();
      return t.startsWith(".") ? f.name.toLowerCase().endsWith(t.toLowerCase()) : t.endsWith("/*") ? f.type.startsWith(t.slice(0, -1)) : f.type === t;
    });
  const takeFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter(accepts);
    if (!picked.length) return;
    stopScript();
    attach(picked.map(toComposerFile));
    inputRef.current?.focus({ preventScroll: true });
  };
  const dropProps = attachments && {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.types.includes("Files")) setDropping(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropping(false);
      takeFiles(e.dataTransfer.files);
    },
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    stopScript();
    // while dictating, Enter keeps the words and Esc throws them away
    if (dict && e.key === "Escape") {
      e.preventDefault();
      cancelDictation();
      return;
    }
    if (dict && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      finishDictation();
      return;
    }
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");
    // Esc hid the list; ArrowDown brings it back while the caret is still in a /command
    if (!open && down && command && results.length && dismissed) {
      e.preventDefault();
      setDismissed(false);
      return;
    }
    if (open) {
      if (down || up) {
        e.preventDefault();
        setActive((a) => (a + (down ? 1 : -1) + results.length) % results.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        if (current) accept(current);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    // Enter sends; Shift+Enter adds a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onSelect = () => {
    const el = inputRef.current;
    if (el && el.selectionStart !== caret) setCaret(el.selectionStart);
  };

  // ---------- dictation ----------
  // Heard words go after whatever was already typed, dimmed and in italics until you keep them.
  const startDictation = () => {
    stopScript();
    setEffortOpen(false);
    setWsOpen(false);
    const base = text;
    const sep = base && !/\s$/.test(base) ? " " : "";
    setDict({ base, from: base.length + sep.length });
    const sm = smart.current;
    const session = ++sm.session;
    // after text that doesn't end a sentence, the words carry it on rather than start a new one
    const midSentence = /[^\s.?!]\s*$/.test(base);
    const show = (punctuated: string) => {
      const said = midSentence && !/^I\b/.test(punctuated) ? punctuated.charAt(0).toLowerCase() + punctuated.slice(1) : punctuated;
      const value = base + (said ? sep + said : "");
      sync(value, value.length);
      setDismissed(true); // a spoken "/" shouldn't open the skill list
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(value.length, value.length));
    };
    dictation.start(
      (heard) => {
        // punctuated by the rules straight away; refined by the language model once you pause
        sm.raw = heard;
        show(sm.cache.get(heard) ?? punctuate(heard));
        clearTimeout(sm.timer);
        if (sm.off || !heard || sm.cache.has(heard)) return;
        sm.timer = setTimeout(() => {
          fetch("/api/punctuate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: heard }) })
            .then((r) => {
              if (r.status === 501) sm.off = true; // no API key: the rules carry on alone
              return r.ok ? (r.json() as Promise<{ text?: string }>) : null;
            })
            .then((d) => {
              if (!d?.text) return;
              sm.cache.set(heard, d.text);
              if (sm.session === session && sm.raw === heard) show(d.text);
            })
            .catch(() => {});
        }, PUNCTUATE_PAUSE_MS);
      },
      (error: DictationError) => {
        // the microphone was refused or kept failing: put the text back as it was
        if (error) sync(base, base.length);
        setDict(null);
      },
    );
    inputRef.current?.focus({ preventScroll: true });
  };
  const endSmart = () => {
    smart.current.session++;
    clearTimeout(smart.current.timer);
  };
  /** Keep the dictated words as they stand. */
  const finishDictation = (refocus = true) => {
    endSmart();
    dictation.end();
    setDict(null);
    if (refocus) inputRef.current?.focus({ preventScroll: true });
  };
  /** Throw the dictated words away. */
  const cancelDictation = () => {
    endSmart();
    dictation.end();
    if (dict) sync(dict.base, dict.base.length);
    setDict(null);
    inputRef.current?.focus({ preventScroll: true });
  };

  // ---------- the skill list animates its height as results change (+1.5 for the 0.75px borders) ----------
  useLayoutEffect(() => {
    const list = listRef.current;
    const pop = popoverRef.current;
    if (list && pop && open) pop.style.height = `${list.offsetHeight + 1.5}px`;
  }, [open, results]);

  // ---------- local / remote ----------
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      // Rounded up, as Figma sizes auto-width text ("Remote" 43.6 → 44); rounding down clips the last glyph.
      // Computed width is the layout size, unaffected by the entrance animation's scale.
      const width = (el: HTMLElement | null) => (el ? Math.ceil(parseFloat(getComputedStyle(el).width)) : 0);
      const local = width(localLabelRef.current);
      const remote = width(remoteLabelRef.current);
      if (local && remote) setLabels({ local, remote });
    });
    return () => void (cancelled = true);
  }, []);
  // ---------- effort ----------
  const closeEffort = useCallback((returnFocus: boolean) => {
    setEffortOpen(false);
    if (returnFocus) effortChipRef.current?.focus();
  }, []);
  const toggleEffort = () => {
    stopScript();
    setWsOpen(false);
    setEffortOpen((o) => !o);
  };
  const changeEffort = (level: number) => {
    stopScript();
    setEffort(level);
  };

  // ---------- Max: burst from where it was chosen, knock the card, flare the aura ----------
  const prevEffort = useRef(effort);
  useEffect(() => {
    const prev = prevEffort.current;
    prevEffort.current = effort;
    if (effort !== MAX_EFFORT || prev === MAX_EFFORT) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;
    // From where the slider's knob is about to land (7px in from the track's end), or from the chip.
    const track = effortOpen ? effortPanelRef.current?.querySelector<HTMLElement>("[role=slider]") : null;
    const r = (track ?? effortChipRef.current ?? root).getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const x = track ? r.right - 7 : r.left + r.width / 2;
    burst(x - rr.left, r.top + r.height / 2 - rr.top);
    cardRef.current?.animate(
      [
        { transform: "none" },
        { transform: "translate3d(-2px, 1px, 0) rotate(-0.25deg) scale(1.006)" },
        { transform: "translate3d(2px, -1px, 0) rotate(0.2deg)" },
        { transform: "translate3d(-1px, 0, 0)" },
        { transform: "none" },
      ],
      { duration: 340, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
    );
    auraRef.current?.animate(
      [
        { opacity: 0, transform: "scale(0.97)" },
        { opacity: 1, transform: "scale(1.035)", offset: 0.22 },
        { opacity: 0.45, transform: "scale(1)" },
      ],
      { duration: 1200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [effort, effortOpen, burst, effortPanelRef]);

  // Opening moves focus to the slider, so the arrow keys work straight away.
  useEffect(() => {
    if (!effortOpen) return;
    const panel = effortPanelRef.current;
    const focusTimer = setTimeout(
      () => panel?.querySelector<HTMLElement>("[role=slider]")?.focus({ preventScroll: true }),
      30,
    );
    return () => clearTimeout(focusTimer);
  }, [effortOpen, effortPanelRef]);
  const dismissEffort = useCallback(() => closeEffort(false), [closeEffort]);
  useDismiss(effortOpen, effortPanelRef, effortChipRef, dismissEffort);

  // ---------- project picker ----------
  const closeWs = useCallback((returnFocus: boolean) => {
    setWsOpen(false);
    if (returnFocus) wsChipRef.current?.focus();
  }, []);
  const dismissWs = useCallback(() => closeWs(false), [closeWs]);
  useDismiss(wsOpen, wsMenuRef, wsChipRef, dismissWs);
  const toggleWs = () => {
    stopScript();
    setEffortOpen(false);
    setWsQuery("");
    setWsActive(WORKSPACES.findIndex((w) => w.name === workspace));
    setWsOpen((o) => !o);
  };
  const pickWs = (name: string) => {
    stopScript();
    setWorkspace(name);
    closeWs(!!wsMenuRef.current?.contains(document.activeElement));
  };

  const ENVS = ["local", "remote"] as const;
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const chooseEnv = (which: Env, focus = false) => {
    stopScript();
    setEnv(which);
    if (focus) segRefs.current[ENVS.indexOf(which)]?.focus();
  };
  // Arrow keys move between the two options, like any segmented control.
  const onSwitchKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next: Env | null =
      e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home"
        ? "local"
        : e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "End"
          ? "remote"
          : null;
    if (!next) return;
    e.preventDefault();
    chooseEnv(next, true);
  };
  // Clicking anywhere on the card that isn't a control puts the caret at the end of the message.
  const focusField = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    setCaret(el.value.length);
  };

  // Segments: 10px padding, 14px icon, 5px gap, label, 10px padding; the first overlaps the second by 2px.
  // Local gets 2px more on the right, as its label ends on a tight "l" (Remote keeps Figma's 10px).
  const segWidth = (which: Env) => (env === which ? 39 + labels[which] + (which === "local" ? 2 : 0) : 34);
  const thumb = env === "local" ? { left: 2, width: segWidth("local") } : { left: 34, width: segWidth("remote") };

  // ---------- scripted typing: only in demo mode; otherwise the composer just appears in the Figma state ----------
  useEffect(() => {
    if (!demo || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctrl = new AbortController();
    const field = inputRef.current;
    scriptRef.current = ctrl;
    const { signal } = ctrl;
    const type = async (value: string, from = "") => {
      for (let i = from.length; i <= value.length; i++) {
        sync(value.slice(0, i), i);
        const ch = value[i - 1];
        await wait(ch === " " ? 70 + Math.random() * 60 : ch === "/" ? 240 : 38 + Math.random() * 46, signal);
      }
    };
    const run = async () => {
      await wait(0, signal);
      sync("", 0);
      inputRef.current?.focus({ preventScroll: true });
      await wait(700, signal);
      await type(DEMO_TEXT);
      let nextWs = "design-system";
      for (;;) {
        await wait(1100, signal);
        const value = "yeah so for this just use /improve-codebase-architecture ";
        sync(value, value.length);
        setDismissed(true);
        await wait(900, signal);
        // switch project by searching for it, alternating between two
        const next = nextWs;
        nextWs = next === "design-system" ? "acme-webapp" : "design-system";
        setWsQuery("");
        setWsActive(0);
        setWsOpen(true);
        await wait(600, signal);
        for (const q of [next.slice(0, 1), next.slice(0, 2), next.slice(0, 3)]) {
          setWsQuery(q);
          setWsActive(0);
          await wait(140, signal);
        }
        await wait(650, signal);
        setWorkspace(next);
        setWsOpen(false);
        await wait(900, signal);
        setEnv("remote");
        await wait(1400, signal);
        setEnv("local");
        await wait(900, signal);
        setEffortOpen(true);
        await wait(650, signal);
        setEffort(3);
        await wait(480, signal);
        setEffort(MAX_EFFORT);
        await wait(1500, signal);
        setEffortOpen(false);
        await wait(1600, signal);
        setEffort(DEFAULT_EFFORT);
        await wait(700, signal);
        launch(value);
        await wait(1100, signal);
        await type(DEMO_TEXT);
      }
    };
    run().catch(() => {});
    return () => {
      ctrl.abort();
      // The demo focused the field to show its caret; let go so the stage's R and D keys work again.
      if (field && document.activeElement === field) field.blur();
    };
  }, [demo, sync, launch]);

  // keep the real caret where the state says it is while the script types
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el && el.selectionStart !== caret) el.setSelectionRange(caret, caret);
  }, [caret, text]);

  // The sent text, split into words that each animate out (commands stay blue).
  const flying = (value: string) => {
    let n = 0;
    return tokenize(value, mentions).flatMap((p, i) =>
      p.text.split(/(\s+)/).map((chunk, j) =>
        !chunk || /^\s+$/.test(chunk) ? (
          chunk
        ) : (
          <span
            key={`${i}-${j}`}
            className={`${styles.word} ${p.command || p.mention ? styles.command : ""}`}
            style={{ animationDelay: `${Math.min(n++, 30) * FLY_STAGGER}ms`, animationDuration: `${FLY_MS}ms` }}
          >
            {chunk}
          </span>
        ),
      ),
    );
  };

  const runs = (value: string, key: string) =>
    tokenize(value, mentions).map((p, i) =>
      p.mention ? (
        <MentionRun key={key + i} mention={p.mention} />
      ) : (
        <span key={key + i} className={p.command ? styles.command : undefined}>
          {p.text}
        </span>
      ),
    );

  // a page can script the composer the way someone would type into it
  useImperativeHandle(handle, () => ({
    type: async (value: string, signal: AbortSignal) => {
      inputRef.current?.focus({ preventScroll: true });
      // carries on from what's in the field already, if the text starts with it (after picking a mention, say)
      for (let i = value.startsWith(text) ? text.length : 0; i <= value.length; i++) {
        sync(value.slice(0, i), i);
        const ch = value[i - 1];
        await wait(ch === " " ? 70 + Math.random() * 60 : ch === "@" || ch === "/" ? 260 : 38 + Math.random() * 46, signal);
      }
    },
    accept: () => {
      if (current) accept(current);
    },
    send: () => send(),
    attach,
  }));

  return (
    <div ref={rootRef} className={styles.root} data-max={effort === MAX_EFFORT}>
      <div
        ref={popoverRef}
        className={styles.popover}
        data-open={open}
        onPointerDown={(e) => e.preventDefault()}
      >
        <ul ref={listRef} id={listId} className={styles.list} role="listbox" aria-label={command?.trigger === "@" ? "Connectors" : "Skills"}>
          {list.results.map((skill, i) => {
            const selected = i === list.active;
            const q = list.query;
            const highlight = selected && q && skill.name.toLowerCase().startsWith(q);
            return (
              <li
                key={skill.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                className={styles.item}
                onPointerEnter={() => setActive(i)}
                onClick={() => {
                  stopScript();
                  accept(skill);
                  inputRef.current?.focus();
                }}
              >
                <p className={styles.name}>
                  {skill.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- a small logo, often a data URI
                    <img className={styles.optionIcon} src={skill.icon} alt="" width={14} height={14} />
                  )}
                  {highlight ? (
                    <>
                      <b>{skill.name.slice(0, q.length)}</b>
                      {skill.name.slice(q.length)}
                    </>
                  ) : (
                    skill.name
                  )}
                </p>
                <p className={styles.desc}>{skill.description}</p>
              </li>
            );
          })}
        </ul>
      </div>

      {showEffort && (
        <EffortPanel
          ref={effortPanelRef}
          level={effort}
          open={effortOpen}
          onLevel={changeEffort}
          onClose={closeEffort}
        />
      )}
      {/* Max effort: a rotating gradient glow behind the card and a gradient ring on its edge */}
      <span ref={auraRef} className={styles.aura} aria-hidden="true" />
      <span className={styles.auraRing} aria-hidden="true" />
      <canvas
        ref={burstCanvasRef}
        className={styles.burst}
        // a canvas keeps its default 300 × 150 size unless given one, so set both explicitly
        style={{
          left: -BURST_INSET,
          top: -BURST_INSET,
          width: `calc(100% + ${BURST_INSET * 2}px)`,
          height: `calc(100% + ${BURST_INSET * 2}px)`,
        }}
        aria-hidden="true"
      />
      {effortMeasurer}
      {wsMeasurer}
      <WorkspaceMenu
        ref={wsMenuRef}
        open={wsOpen}
        current={workspace}
        query={wsQuery}
        active={wsActive}
        onQuery={setWsQuery}
        onActive={setWsActive}
        onPick={pickWs}
        onClose={closeWs}
      />


      <div ref={cardRef} className={styles.card} onPointerDown={focusField} data-dropping={dropping} {...dropProps}>
        {(files.length > 0 || leaving.length > 0) && (
          <div className={styles.files} data-leaving={!files.length}>
            <div className={styles.filesInner}>
              {(files.length ? files : leaving).map((f) => (
                <FileTile
                  key={f.id}
                  file={f}
                  className={styles.fileTile}
                  onRemove={files.length ? () => setFiles((fs) => fs.filter((x) => x.id !== f.id)) : undefined}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={fieldRef} className={styles.field}>
          <div className={styles.mirror} aria-hidden="true">
            {dict && text.length > dict.from ? (
              <>
                {runs(text.slice(0, dict.from), "d")}
                <span className={styles.dictated}>{text.slice(dict.from)}</span>
              </>
            ) : !text ? (
              <span className={`${styles.placeholder} ${outgoing.length ? styles.placeholderLate : ""}`}>
                {dict
                  ? "Listening…"
                  : dictation.error === "not-allowed"
                    ? "Allow microphone access to dictate"
                    : placeholder}
              </span>
            ) : command ? (
              <>
                {runs(text.slice(0, command.start), "a")}
                <span className={open || (command.trigger === "/" && isSkillPrefix(command.query)) ? styles.command : undefined}>
                  {text.slice(command.start, caret)}
                  {suggestion && <span className={styles.ghost}>{suggestion}</span>}
                  {text.slice(caret, command.end)}
                </span>
                {runs(text.slice(command.end), "b")}
              </>
            ) : (
              runs(text, "t")
            )}
            {"​"}
          </div>
          {outgoing.map((m) => (
            <div key={m.id} className={styles.outgoing} aria-hidden="true">
              {flying(m.text)}
            </div>
          ))}
          <textarea
            ref={inputRef}
            className={styles.input}
            value={text}
            rows={1}
            spellCheck={false}
            aria-label="Message"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${listId}-${Math.min(active, results.length - 1)}` : undefined}
            onChange={(e) => {
              stopScript();
              if (dict) finishDictation(false); // typing takes over from the microphone, keeping what was said
              sync(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onKeyDown}
            onSelect={onSelect}
            onPointerDown={stopScript}
            onBlur={() => setDismissed(true)}
            onFocus={() => setDismissed(false)}
          />
        </div>

        {dict ? (
          // Recording: your voice across the toolbar, cancel where the mic was, keep where send was
          <div className={`${styles.toolbar} ${styles.recBar}`}>
            <Waveform on={dictation.listening} />
            <button
              type="button"
              className={`${styles.btn} ${styles.circle} ${styles.tertiary}`}
              aria-label="Cancel dictation"
              onClick={cancelDictation}
            >
              <svg className={styles.icon} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.circle} ${styles.send}`}
              aria-label="Finish dictation"
              onClick={() => finishDictation()}
            >
              <svg className={styles.icon} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M4.5 9.4L7.5 12.4L13.5 5.9" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
        <div className={styles.toolbar}>
          <div className={styles.group}>
            <button
              type="button"
              className={`${styles.btn} ${styles.circle} ${styles.tertiary}`}
              aria-label={attachments ? "Attach files" : "Add"}
              onClick={attachments ? () => pickerRef.current?.click() : undefined}
            >
              <Image className={styles.icon} src={plusIcon} alt="" width={14} height={14} />
            </button>
            {attachments && (
              <input
                ref={pickerRef}
                type="file"
                multiple
                accept={attachments.accept}
                hidden
                onChange={(e) => {
                  takeFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            )}
            <WorkspaceChip
              ref={wsChipRef}
              name={workspace}
              width={wsWidths[workspace]}
              open={wsOpen}
              onToggle={toggleWs}
            />
            <div className={styles.switch} role="radiogroup" aria-label="Where to run" onKeyDown={onSwitchKeyDown}>
              <span className={styles.thumb} style={thumb} aria-hidden="true" />
              {ENVS.map((which, i) => (
                <button
                  key={which}
                  ref={(el) => void (segRefs.current[i] = el)}
                  type="button"
                  role="radio"
                  className={styles.seg}
                  aria-checked={env === which}
                  aria-label={which === "local" ? "Local" : "Remote"}
                  tabIndex={env === which ? 0 : -1}
                  style={{ width: segWidth(which), transition: "width 0.42s var(--ease-swap)" }}
                  onClick={() => chooseEnv(which)}
                >
                  <span className={`${styles.maskIcon} ${which === "local" ? styles.laptop : styles.cloud}`} />
                  <span className={styles.segLabelWrap} style={{ width: env === which ? labels[which] : 0 }}>
                    <span ref={which === "local" ? localLabelRef : remoteLabelRef} className={styles.segLabel}>
                      {which === "local" ? "Local" : "Remote"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            {accessory}
            {showEffort && (
              <EffortChip
                ref={effortChipRef}
                level={effort}
                open={effortOpen}
                widths={effortWidths}
                onToggle={toggleEffort}
                onLevel={changeEffort}
              />
            )}
            <button
              type="button"
              className={`${styles.btn} ${styles.circle} ${styles.ghostBtn} ${styles.mic}`}
              aria-label="Dictate"
              disabled={!dictation.supported}
              title={dictation.supported ? undefined : "Dictation isn't available in this browser"}
              onClick={startDictation}
            >
              <Image className={styles.icon} src={micIcon} alt="" width={14} height={14} />
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.circle} ${styles.send}`}
              aria-label="Send"
              onClick={send}
            >
              {sends > 0 && <span key={sends} className={styles.ripple} aria-hidden="true" />}
              <Image className={styles.icon} src={arrowUpIcon} alt="" width={18} height={18} />
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
