/*
 * Punctuation for dictated text. Chrome's speech recogniser returns bare words ("hey is this working
 * i guess it is"), so these rules put back what a person would write: capitals, a comma after an
 * opener, question marks (including a closing "…, alright?"), and a sentence break where a question has ended and a new thought begins
 * ("Hey, is this working? I guess it is"). They run on every update, so they stay instant; a language
 * model can refine the result when the speaker pauses (see /api/punctuate).
 */

// Helper verbs open a question when a subject follows ("do you", "is this"); alone they're a command ("do the refactor")
const AUX = new Set(
  ("is are am was were do does did can could would will should shall have has had may might " +
    "isn't aren't wasn't weren't don't doesn't didn't can't couldn't won't wouldn't shouldn't haven't hasn't")
    .split(" "),
);
const SUBJECTS = new Set("i you we they he she it this that these those there the my your our their his her its anyone someone anybody somebody everyone".split(" "));
// Question words open a question on their own
const WH = new Set("what why how where when who whom whose which".split(" "));
const PRONOUNS = new Set("i you we they he she anyone someone anybody somebody everyone".split(" ")); // people: "do it" is still a command
// "do the refactor" and "have a look" are commands, so after these only a pronoun makes a question ("do you", "have we")
const COMMAND_LIKE = new Set("do don't have has had".split(" "));
const asks = (w: string, next?: string) => {
  const v = bare(w);
  if (WH.has(v)) return true;
  if (!AUX.has(v) || !next) return false;
  return (COMMAND_LIKE.has(v) ? PRONOUNS : SUBJECTS).has(bare(next));
};
// Openers that take a comma when more follows: "Hey, …", "Okay, …"
const OPENERS = new Set("hey hi hello okay ok alright well yes yeah yep no nope oh actually anyway honestly basically right".split(" "));
// A new sentence can start with one of these once a question has run its course
const STARTS = new Set("i i'm i'll i've i'd we we're let's it's that's there's".split(" "));
// …but not straight after one of these, which carry the clause on ("is this what I want", "can you tell me if I")
const CARRY = new Set(
  ("and but or so because if that what when where which who whom how why than as like " +
    "think guess know hope mean say said feel believe wonder sure suppose " +
    "can could would should will do did does am is are was were have has had " +
    "the a an of for to with from about something anything everything nothing way thing things one time " +
    "maybe then before after until unless since while whether me you")
    .split(" "),
);
// A question to someone starts a new sentence, even straight after a statement: "…it is. Can you …"
const ASK_PERSON = new Set("can could would will should do does did".split(" "));
const PERSONS = new Set("you we i they he she".split(" "));
// …unless it's still part of the clause before ("let me know if you can", "tell me what you would do")
const ASK_CARRY = new Set("and or but so if that whether because than when where what why how who which me to know".split(" "));
// Once a question has said enough, these begin the next instruction: "…keep the padding? Just do …"
const NEXT = new Set("just also please".split(" "));
// A sentence ending on one of these is a check with the listener: "Do the refactor, alright?"
const tagAt = (s: string[]) => {
  const n = s.length;
  const last = bare(s[n - 1] ?? "");
  if (last === "alright" && n >= 3) return n - 1;
  if (last === "right" && bare(s[n - 2] ?? "") === "all" && n >= 4) return n - 2;
  return -1;
};
const ALWAYS_CAPS: Record<string, string> = { i: "I", "i'm": "I'm", "i'll": "I'll", "i've": "I've", "i'd": "I'd" };

const bare = (w: string) => w.toLowerCase().replace(/[.,?!;:]+$/, "");
const ends = (w: string) => /[.?!]$/.test(w);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Punctuates dictated text. The last sentence only gets a mark if it's a question: you may still be talking. */
export function punctuate(raw: string): string {
  const words = raw
    .trim()
    .replace(/\b(a|some|the|quick|little|usual|more|bit of) clean up\b/gi, "$1 cleanup") // the noun is one word
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ALWAYS_CAPS[w.toLowerCase()] ?? w);
  if (!words.length) return "";

  // split into sentences
  const sentences: string[][] = [[]];
  words.forEach((w, i) => {
    const cur = sentences[sentences.length - 1];
    const prev = words[i - 1];
    const question = cur.length > 0 && isQuestion(cur);
    const next = words[i + 1];
    const breakHere =
      cur.length > 0 &&
      (ends(prev) ||
        (question && cur.length >= 3 && STARTS.has(bare(w)) && !CARRY.has(bare(prev))) ||
        (question && cur.length >= 5 && NEXT.has(bare(w)) && !CARRY.has(bare(prev))) ||
        (cur.length >= 3 && ASK_PERSON.has(bare(w)) && !!next && PERSONS.has(bare(next)) && !ASK_CARRY.has(bare(prev))) ||
        (tagAt(cur) > 0 && STARTS.has(bare(w)))); // "…, alright? I'll check later"
    if (breakHere) sentences.push([w]);
    else cur.push(w);
  });

  return sentences
    .map((s, i) => {
      const out = [...s];
      const last = i === sentences.length - 1;
      // a comma after an opener, and after a name you're addressing: "Hey Claude, can you …"
      if (out.length > 1 && OPENERS.has(bare(out[0])) && !/[,.?!]$/.test(out[0])) {
        const named = out.length > 2 && /^[A-Z]/.test(out[1]) && out[1] !== "I" && asks(out[2], out[3]);
        if (named) out[1] += ",";
        else out[0] += ",";
      }
      // a comma before "but" in a longer sentence
      for (let k = 4; k < out.length; k++) {
        if (bare(out[k]) === "but" && !/[,.?!;:]$/.test(out[k - 1])) out[k - 1] += ",";
      }
      out[0] = cap(out[0]);
      const end = out.length - 1;
      const tag = isQuestion(s) ? -1 : tagAt(s);
      // a pause ends a sentence with a full stop; a question gets its question mark instead
      const open = !ends(out[end]) || /[^.]\.$/.test(out[end]);
      if (tag > 0 && open) {
        if (!/[,.?!;:]$/.test(out[tag - 1])) out[tag - 1] += ",";
        out[end] = out[end].replace(/[,.]$/, "") + "?";
      } else if (isQuestion(s) && open) {
        out[end] = out[end].replace(/[,.]$/, "") + "?";
      } else if (!ends(out[end]) && !last) {
        out[end] = out[end].replace(/,$/, "") + ".";
      }
      return out.join(" ");
    })
    .join(" ");
}

function isQuestion(s: string[]) {
  // skip an opener ("hey") and a name after it ("hey Claude") to find the first real word
  let k = 0;
  if (OPENERS.has(bare(s[0])) && s.length > 1) k = 1;
  if (k === 1 && s.length > 2 && /^[A-Z]/.test(s[1]) && s[1] !== "I" && asks(s[2], s[3])) k = 2;
  return !!s[k] && asks(s[k], s[k + 1]);
}
