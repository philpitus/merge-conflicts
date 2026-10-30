/*
 * Punctuates dictated text with Claude, for the prompt composer's dictation. Optional: set
 * ANTHROPIC_API_KEY in .env.local to turn it on. Without it this answers 501 and the composer keeps
 * its own punctuation rules. The reply is only used if it keeps the speaker's words exactly.
 */

const MODEL = "claude-haiku-5-5";
const MAX_CHARS = 4000;

const SYSTEM =
  "You punctuate dictated text for a chat input. Add punctuation and capitalisation only: " +
  "commas, full stops, question marks, apostrophes and capital letters. Never add, remove, reorder " +
  "or change words. Leave the last sentence without a full stop, since the speaker may still be " +
  "talking, but do end it with a question mark if it is a question. Reply with the text only.";

/** The words alone, for checking the reply didn't change what was said. */
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "not configured" }, { status: 501 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) return Response.json({ error: "bad text" }, { status: 400 });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok) return Response.json({ error: "upstream" }, { status: 502 });

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const out = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
  if (!out || words(out) !== words(text)) return Response.json({ error: "changed words" }, { status: 422 });
  return Response.json({ text: out });
}
