# Create PR & merge conflicts

A chat module for a coding agent. Changes and **Create PR** float over the composer. The pull request plays out as a live git log: commit, push, open, then `main`'s new commits slot in and the conflict lands on it. Resolve, then merge.

Light and dark themes, keyboard accessible, and it respects `prefers-reduced-motion`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Move the pointer to the bottom edge for the stage controls, or use the shortcuts:

| Key | Does |
| --- | --- |
| `R` | Replay from the start |
| `D` | Auto demo: plays the whole flow on its own, then starts over |
| `T` | Switch light / dark |

## Use it in your project

It's a React client component for **Next.js (App Router)** with CSS Modules and no other dependencies.

1. Copy these into your project, keeping the paths:

   ```
   src/components/merge-conflicts/
   src/components/prompt-composer/   (the chat input it sits on)
   src/components/thinking-state/    (the "Worked for 5s" panels)
   src/lib/use-glide.ts
   src/fonts/inter-3-variable.woff2
   ```

2. Make sure `@/*` resolves to `src/*` in `tsconfig.json` (the Next.js default):

   ```json
   "paths": { "@/*": ["./src/*"] }
   ```

3. Load the fonts and expose them as CSS variables on `<html>`. The component reads `--font-inter3` for text and `--font-geist-mono` for code. See [`src/app/layout.tsx`](src/app/layout.tsx).

   Inter 3 is bundled on purpose: the design was made in Figma, which renders Inter 3, and Inter 4 (what Google Fonts serves now) sets wider.

4. Render it inside a `<main>`:

   ```tsx
   import { MergeConflicts } from "@/components/merge-conflicts";

   export default function Page() {
     return (
       <main>
         <MergeConflicts />
         {/* or <MergeConflicts theme="dark" demo /> */}
       </main>
     );
   }
   ```

   Inside a `<main>` it caps its height at the screen's and scrolls the chat within it. Put it on a white (light) or `#111111` (dark) background.

### Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `theme` | `"light" \| "dark"` | `"light"` | |
| `demo` | `boolean` | `false` | Plays the flow on its own, looping |

`MergeConflictsDark` is the same component with `theme="dark"`.

### Changing the content

The commits, files, conflicts, branch names and the assistant's replies all live in [`src/components/merge-conflicts/data.ts`](src/components/merge-conflicts/data.ts). Colours are tokens at the top of [`merge-conflicts.module.css`](src/components/merge-conflicts/merge-conflicts.module.css), for both themes.

### Dictation (optional)

The composer's microphone uses the browser's speech recognition and punctuates as you speak. To have Claude refine the punctuation when you pause, copy [`src/app/api/punctuate/route.ts`](src/app/api/punctuate/route.ts) too and set `ANTHROPIC_API_KEY` in `.env.local`. Without it, the composer uses its own rules.

## License

Code: [MIT](LICENSE). Inter: [SIL Open Font License 1.1](src/fonts/OFL.txt).
