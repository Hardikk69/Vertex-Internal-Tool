# Plan: UX audit fixes (all 15 findings)

Source: UX audit of the VMH internal tool run with the `ux-patterns` skill. The
app's visual layer is sound; the defects are missing states, missing feedback,
sub-threshold focus/contrast, and destructive actions without recovery.

No spec document exists. This plan is the authority; where a task and the
Global Constraints disagree, the Global Constraints win.

## Global Constraints

These bind every task.

1. **No new dependencies.** Everything is solvable with what is installed:
   `react`, `react-router`, `lucide-react`, `sonner`, `@radix-ui/*`,
   `tailwindcss` v4, `tailwind-merge`/`clsx` via `cn()`.
2. **Verification gate.** This repo has no UI test runner (`package.json` has
   only `test:rls`, a node script against pglite). Do not add one. Every task
   verifies with:
   - `npx tsc --noEmit` — must exit 0 with no output
   - `npm run build` — must succeed

   Baseline before this plan: both clean. A task that names an extra concrete
   check (e.g. grepping built CSS) must run it and paste the output into its
   report. Report the commands you ran and their real output; do not claim a
   check you did not run.
3. **Match the surrounding code.** 2-space indent, double quotes, semicolons,
   `cn()` for conditional classes, named exports for components,
   `type X = {...}` for local row types. The codebase is comment-light and its
   comments explain *why*, never *what* — follow that. Do not add JSDoc.
4. **Minimal diffs.** No refactors beyond the task. No new abstractions beyond
   the ones a task explicitly names. No reformatting of untouched lines.
5. **Do not touch:** `supabase/migrations/**`, `supabase/functions/**`,
   `scripts/rls-check.mjs`, `README.md`, `src/lib/supabase.ts`,
   `src/lib/brief.ts`, `src/auth.tsx`.
6. **`#FF4B33` stays hardcoded.** Tokenizing the brand colour is out of scope.
7. **Both themes.** Any colour or token change must be reasoned about in
   `:root` *and* `.dark` in `src/styles.css`. State the contrast ratio you are
   targeting in your report.
8. **Deliberate ceilings get a comment.** Where a task's chosen approach has a
   known limit, mark it `// ponytail: <ceiling>, <upgrade path>` — matching the
   existing comments at `src/pages/time.tsx:64` and `src/pages/reports.tsx:25`.
9. **One commit per task**, message naming the task: `ux: <task summary>`.
10. **Working on `main`** by the user's explicit instruction. No worktree, no
    branch. Pre-existing uncommitted changes in the tree are NOT yours — never
    `git add -A`, never `git commit -a`. Stage only the files your task names,
    by path.

---

## Task 1: Shared async-state components

**File:** `src/components/async-state.tsx` (new, ~35 lines)

Seven call sites across the app render `null` while loading and have no error
surface at all. This task creates the two shared pieces; later tasks wire them
in. It changes no existing file.

Export exactly two components:

```tsx
// Loading placeholder: a centred spinner for an unknown-duration wait.
export function Loading({ className }: { className?: string })
```
- Renders a `Loader2` from `lucide-react` with `animate-spin`, `size-5`,
  `text-muted-foreground`, inside a centred wrapper with `py-10`.
- Accepts `className` merged via `cn()` so callers can change the padding.
- Add `role="status"` and an `sr-only` "Loading…" label so the wait is
  announced.

```tsx
// Dead-end recovery: what broke, and the retry.
export function LoadFailed({
  message,
  onRetry,
  className,
}: { message?: string; onRetry: () => void; className?: string })
```
- A `Card`-free block (callers decide the container): centred, `py-10`,
  `grid gap-3 justify-items-center`.
- An `AlertCircle` icon (`size-5 text-destructive`) above the text — the error
  must not be signalled by colour alone.
- Text: `message ?? "Couldn't load this."` in `text-sm text-muted-foreground`.
- A `Button variant="outline" size="sm"` labelled "Try again" calling
  `onRetry`.
- `role="alert"` on the wrapper.

Import `Button` from `@/components/ui/button` and `cn` from `@/lib/utils`.

**Verification:** the Global Constraints gate. Nothing imports this file yet,
so also confirm `npx tsc --noEmit` does not report it as unused (it will not —
the project does not enable `noUnusedLocals` across files).

---

## Task 2: Kill the two permanent dead ends (clients, reports)

**Files:** `src/pages/clients.tsx`, `src/pages/reports.tsx`

Both pages hang forever on a failed fetch. Today a network error leaves
`clients` at `null` (blank screen, `clients.tsx:164`) or `rows` at `null`
("Loading…" forever, `reports.tsx:72`), with only an expiring toast.

Depends on Task 1 (`Loading`, `LoadFailed`).

### `src/pages/clients.tsx`

- Add `const [failed, setFailed] = useState<string | null>(null);`
- In `load` (line ~101): on error, `setFailed(error.message)` **in addition to**
  the existing `toast.error`; on success `setFailed(null)`.
- Replace `if (!clients) return null;` (line 164) with:
  - `if (failed) return <LoadFailed message={failed} onRetry={() => { setFailed(null); load(); }} />;`
  - `if (!clients) return <Loading />;`
- Keep the existing toast calls. The toast is the transient notice; the inline
  block is the recoverable surface.

### `src/pages/reports.tsx`

- Add `const [failed, setFailed] = useState<string | null>(null);`
- The paging loop at line ~61 currently does
  `if (error) return void toast.error(error.message);` inside the async IIFE,
  which abandons the load with `rows` still `null`. Change it to set `failed`
  (guarded by the existing `stale` check so a superseded fetch cannot write)
  and return.
- Clear `failed` at the start of each effect run.
- Replace the `"Loading…"` string in the header subtitle (line ~117) with
  `failed ? "Couldn't load" : "Loading…"`.
- Below the header, render — before the existing `rows?.length === 0` block:
  - `{failed && <Card><LoadFailed message={failed} onRetry={() => setRange((r) => ({ ...r }))} /></Card>}`
  - `{!failed && !rows && <Card><Loading /></Card>}`
- The retry works by producing a new `range` object identity, which the effect
  depends on. Add a one-line comment saying so — it is not obvious.

**Verification:** the Global Constraints gate. Both pages are admin/team routes
behind auth; describe in your report how a reviewer would reach each state
(e.g. offline in devtools), but do not add test scaffolding.

---

## Task 3: Separate loading from empty (time, todos)

**Files:** `src/pages/time.tsx`, `src/pages/todos.tsx`

Both pages currently show their empty-state copy during the first fetch, so a
slow network reads as "you have no data" — a false empty state.

Depends on Task 1 (`Loading`, `LoadFailed`).

**Both pages also need the error branch**, for the same reason Task 2 gives,
and here it is load-bearing: making the list state nullable turns the existing
toast-only error path (`time.tsx:82`, `todos.tsx:49`, both of which `return`
without setting the list) into a *permanent* spinner, which is worse than
today. So in each page, alongside the nullable change:

- add `const [failed, setFailed] = useState<string | null>(null);`
- in `load`, set it on error next to the existing `toast.error`, and clear it
  on success
- render `<LoadFailed message={failed} onRetry={() => { setFailed(null); load(); }} />`
  in place of the loading branch when `failed` is set

Use the same ordering as Task 2: failed first, then loading, then empty, then
data.

### `src/pages/time.tsx`

- `history` is `useState<Log[]>([])`. Change it to `useState<Log[] | null>(null)`
  so "not yet loaded" and "loaded, nothing there" are distinguishable.
- Update every read of `history` for the nullable type:
  - `sum(history)` → guard: `const total = sum(history ?? []);`
  - `history.length > 0 &&` entry-count line → `!!history?.length &&`
  - `disabled={!history.length}` on Export CSV → `disabled={!history?.length}`
  - `exportCsv` uses `history.toReversed()` → it is only reachable when the
    button is enabled, but use `(history ?? [])` for type safety
  - the render branch at line ~312 becomes three branches:
    `!history` → `<Card><Loading /></Card>`;
    `history.length === 0` → the existing empty card;
    else → the existing grouped list
  - `Map.groupBy(history, …)` is inside the else branch, so it is non-null
- Do NOT change the `active` timer card — `active` being `null` legitimately
  means "no timer running".

### `src/pages/todos.tsx`

- `todos` is `useState<Todo[]>([])`. Change to `useState<Todo[] | null>(null)`.
- The subtitle at line ~104 currently reads
  `todos.length ? \`${left} of ${todos.length} left\` : "Nothing planned yet."`.
  Make it three-way: `!todos` → `"Loading…"`; `todos.length` → the count;
  else → `"Nothing planned yet."`.
- `left` → `todos?.filter((t) => !t.done).length ?? 0`.
- `toggle` optimistically maps over `todos` — make it null-safe
  (`ts?.map(...) ?? null`).
- The list block `{todos.length > 0 && <Card>…}` becomes:
  `!todos` → `<Loading className="py-6" />`; `todos.length > 0` → the existing
  card; else nothing (Task 11 adds the real empty state here).

**Verification:** the Global Constraints gate. `tsc` is the real check here —
it will catch every missed nullable read.

---

## Task 4: Loading placeholders for auth and the remaining nulls

**Files:** `src/main.tsx`, `src/components/brief-form.tsx`,
`src/components/retainer-usage.tsx`

Four more `return null`s. These are the cold-load white screen.

Depends on Task 1 (`Loading`).

- `src/main.tsx:38` — `RoleLayout`: `if (loading) return null;` becomes a
  full-height centred `Loading`:
  `<main className="flex min-h-screen items-center justify-center"><Loading /></main>`
- `src/main.tsx:53` — `Home`: same replacement.
- Leave `src/pages/set-password.tsx:30`'s `if (loading) return null;` alone —
  it is a one-shot page reached from an email link and the card below it would
  flash. Record that decision in your report.
- `src/components/brief-form.tsx:91` — `if (!loaded) return null;` becomes
  `if (!loaded) return <Loading />;`. Note the existing line order: `const left
  = missing(answers)` sits above the guard; keep it there, it is harmless.
- `src/components/retainer-usage.tsx:21` — `if (hours === null) return null;`
  currently makes the page reflow when the number lands. Replace with a
  fixed-height skeleton that matches the loaded layout's height:
  `<p className="text-sm text-muted-foreground">
     <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted align-middle" />
   </p>`
  Wrap in the same `grid max-w-md gap-1.5` container used when a retainer
  exists, and include a matching `h-1.5` pulsed bar, so the swap does not move
  the page. This is a skeleton, not a spinner, because the loaded shape is
  known.

**Verification:** the Global Constraints gate.

---

## Task 5: Token fixes in styles.css (focus ring, muted text, reduced motion)

**File:** `src/styles.css`

Three token-level defects. All are small, mechanical edits in one file.

1. **Focus ring contrast.** `--ring: oklch(0.7 0 0)` in `:root` is roughly
   2.4:1 against the white background — below the 3:1 minimum for a focus
   indicator. Change the light value to `oklch(0.6 0 0)` (≈3.5:1 on white).
   In `.dark`, `--ring: oklch(0.551 0.027 264.364)` is a leftover blue-grey
   from a different palette; change it to `oklch(0.7 0 0)` for consistency with
   the neutral scale (≈5.7:1 on the dark card).

2. **Muted text contrast.** `:root`'s `--muted-foreground: oklch(0.5 0 0)` is
   ≈4.4:1 on white — a borderline fail for body text, and it is used at
   `text-sm` all over the app. Change to `oklch(0.47 0 0)` (≈5.1:1). Leave the
   `.dark` value (`oklch(0.65 0 0)`, ≈4.8:1 on the card) alone.

3. **Reduced motion.** `html { scroll-behavior: smooth }` at line ~140 has no
   opt-out, and the app has no reduced-motion handling anywhere. Add to the
   `@layer base` block, after the `html` rule:

```css
  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }

    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
```

Do not touch any other token. Do not touch `--primary`, `--destructive`, or
the `--chart-*`/`--sidebar-*` blocks.

**Verification:** the Global Constraints gate, plus:
- `npm run build`, then grep the built CSS for the media query and the new
  values: `grep -o "prefers-reduced-motion[^}]*" dist/assets/*.css | head -3`
  and `grep -o "\-\-ring:[^;]*" dist/assets/*.css | head -4`. Paste the output.

---

## Task 6: Focus rings and touch targets in the UI primitives

**Files:** `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`,
`checkbox.tsx`, `select.tsx`

Same-shape mechanical edits across five files.

1. **Ring width and offset.** Every primitive uses
   `focus-visible:ring-1 focus-visible:ring-ring` with no offset — a 1px ring
   flush against the control. In all five files change `ring-1` to
   `ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
   (`select.tsx:20` already has `ring-offset-background` in its class list;
   do not duplicate it there.)

2. **`select.tsx:20` uses `focus:` not `focus-visible:`** — so the ring fires
   on mouse click too. Change `focus:outline-none focus:ring-1 focus:ring-ring`
   to the `focus-visible:` form. Radix's `SelectTrigger` is a button and
   forwards focus normally, so `:focus-visible` behaves correctly.

3. **Touch targets.** `button.tsx`'s `size` variants are below the 44px
   minimum for thumbs: `sm` is 32px and `icon` is 36px, and there are 9 uses of
   them (row-level Edit/Delete icon buttons in `time.tsx` and `todos.tsx` are
   the worst). Grow them on coarse pointers only, keeping the 16px glyph:
   - `sm: "h-8 rounded-md px-3 text-xs pointer-coarse:h-11"`
   - `icon: "h-9 w-9 pointer-coarse:size-11"`
   Tailwind v4 ships the `pointer-coarse` variant; the build-output grep below
   is how you confirm it actually generated a rule rather than being silently
   dropped.

Do not change the `default` or `lg` sizes (36px and 40px with text, already
comfortable) and do not change any colour.

**Verification:** the Global Constraints gate, plus:
- `npm run build`, then `grep -c "pointer: coarse" dist/assets/*.css` — must be
  ≥1. If it is 0, the variant did not compile: fall back to a
  `@media (pointer: coarse)` block in `src/styles.css` targeting the generated
  classes is NOT acceptable (it couples to Tailwind's output); instead report
  BLOCKED with the grep output so the controller can rule on it.
- `grep -o "ring-offset-2" dist/assets/*.css | head -1` — confirms the offset
  utilities are present.

---

## Task 7: In-flight feedback (aria-busy and spinners)

**Files:** `src/pages/time.tsx`, `src/pages/login.tsx`,
`src/pages/set-password.tsx`, `src/pages/people.tsx`,
`src/components/time-entry-dialog.tsx`, `src/components/brief-form.tsx`,
`src/pages/clients.tsx` (the `EditClientDialog` only),
`src/components/comment-thread.tsx`

The app fakes in-flight state with `disabled={busy}` and nothing else — a
dimmed button reads as broken, not working. The codebase has no `aria-busy`
anywhere.

For each submit/action button that has a `busy`/`sending`/`pending` flag, add:
- `aria-busy={busy}` on the button
- a leading `<Loader2 className="animate-spin" />` while busy (the button's
  `[&_svg]:size-4` handles sizing)
- label text that names the work in progress

Keep `disabled` while busy — blocking a double submit is correct here; this
task is about making the state *legible*, not about removing the guard.

Specific sites:
- `time.tsx` Clock in (line ~197): `{busy ? <><Loader2 className="animate-spin" />Clocking in…</> : "Clock in"}`
- `time.tsx` "Save & clock out" (line ~235): same shape, "Saving…"
- `time-entry-dialog.tsx` submit (line ~152) and Delete (line ~145)
- `clients.tsx` `EditClientDialog` Save (line ~80)
- `comment-thread.tsx` Send (line ~211): icon-only button — swap the `Send`
  icon for `Loader2 className="animate-spin"` while `sending`, and the existing
  `aria-label={sending ? "Sending" : "Send"}` already covers the label; add
  `aria-busy={sending}`
- `brief-form.tsx` (lines ~134 and ~162) and `login.tsx` (line ~93) and
  `set-password.tsx` (line ~51) already swap their label text ("Saving…",
  "Signing in…"). Add `aria-busy` and the spinner icon to those too, for one
  consistent in-flight treatment.

`people.tsx`'s invite button (line ~134) already reads "Sending…" — give it the
same two additions.

**Verification:** the Global Constraints gate. Also `grep -rn "aria-busy" src/`
and paste the list, confirming every site above is covered.

---

## Task 8: Enable the submits, validate on click

**Files:** `src/components/time-entry-dialog.tsx`, `src/pages/todos.tsx`,
`src/pages/clients.tsx`, `src/pages/time.tsx`,
`src/components/comment-thread.tsx`

A disabled button drops out of tab order, is unannounced by screen readers, and
kills the pointer events that would let anything explain *why* it is dead. Five
buttons are disabled on validation state. Keep them enabled, validate on click,
and move focus to the blocking control with a message naming what is missing.

Keep `disabled` for the in-flight (`busy`/`sending`) half of each condition —
that half is a double-submit guard, not a validation gate.

### `time-entry-dialog.tsx` — the worst case

`disabled={!valid || busy}` where
`valid = !!form.client_id && ms > 0 && !!form.description.trim()` — three
possible blockers, none named. Date, start, end and description carry native
`required`, so the browser handles those. The two gaps the browser cannot see:

- Change the submit to `disabled={busy}`.
- In `save(e)`, after `e.preventDefault()`, replace `if (!valid) return;` with
  ordered checks:
  - no `form.client_id` → `toast.error("Pick a client first.")`, focus the
    `SelectTrigger` (add a `useRef<HTMLButtonElement>(null)` and pass it to
    `SelectTrigger`, which forwards refs), and return
  - `!(ms > 0)` → `toast.error("End time has to be after the start time.")`,
    focus the End input (second ref), return
  - empty description → native `required` fires first; no extra check needed
- Keep the `valid` const — the `DialogDescription` at line ~96 uses `ms > 0`
  for its live duration readout, which is the right kind of inline feedback and
  must keep working.

### The other four — single blocker each

Keep each enabled; on submit/click with the blocker present, focus the control
that needs filling. No toast needed where the control is adjacent and obvious —
focus alone is the message:
- `todos.tsx:138` Add → `disabled` removed; in `add()`, if `!title.trim()`,
  focus the title input and return (add a ref; the early return already exists)
- `clients.tsx:176` Add → same with the new-client name input
- `time.tsx:197` Clock in → `disabled={busy}`; in `clockIn()`, if `!clientId`,
  `toast.error("Pick a client to start the timer.")` and focus the trigger
  (the select is the only control, so name it)
- `comment-thread.tsx:215` Send → `disabled={sending}`; `send()` already
  returns early on empty — add a focus call on the textarea (ref exists? no —
  add one) before returning

**Leave alone:** `brief-form.tsx`'s `disabled={!dirty || busy}` buttons. Their
label *is* the reason ("Saved" when there is nothing to save), which is the
pattern's recommended treatment rather than the defect it warns about. Say so
in your report.

Do not remove the `disabled={!history?.length}` guards on the Export CSV
buttons in `time.tsx` and `reports.tsx` — an export with no rows is a no-op,
not a blocked action, and those are covered by Task 11's empty states.

**Verification:** the Global Constraints gate. Describe per site what now
happens on an empty submit.

---

## Task 9: Recoverable destruction (todo undo, entry delete)

**Files:** `src/pages/todos.tsx`, `src/components/time-entry-dialog.tsx`

### `todos.tsx` — delete fires instantly with no recovery

`todos.tsx:167` deletes on click: no confirm, no undo, permanent. Prefer undo
to confirmation here — it is a to-do, and taxing every correct delete with a
dialog to catch the rare wrong one is the wrong trade.

Implement a delayed delete with an undo toast:
- On click: remove the row from local state immediately (optimistic), then
  `setTimeout` the actual Supabase delete by 5000ms, keeping the timer id.
- Show `toast("Deleted \"<title>\"", { action: { label: "Undo", onClick: … } })`
  where Undo clears the timeout and calls `load()` to restore the row.
- Use sonner's `duration: 5000` so the toast and the window match.
- Mark the ceiling:
  `// ponytail: a tab closed inside the 5s window leaves the to-do undeleted; soft-delete column if that ever matters`
- Keep a `Map<string, ReturnType<typeof setTimeout>>` in a `useRef` so several
  deletes in a row each get their own timer, and clear all pending timers on
  unmount (`useEffect` cleanup) — firing a delete after navigation away is the
  one real hazard of this approach, and flushing on unmount is wrong (the user
  may have hit Undo mentally but navigated); clearing is the safe default
  because an undeleted to-do is recoverable and a wrongly deleted one is not.

### `time-entry-dialog.tsx` — native confirm, and Delete beside Save

Two separate defects at lines 85 and 145:

1. `confirm("Delete this time entry? …")` is a native blocking dialog fired
   from inside a Radix dialog — it escapes the focus trap and cannot be styled.
   Replace it with a two-step inline confirm: a `const [confirming,
   setConfirming] = useState(false)`. The Delete button sets `confirming`;
   while `confirming`, show "Delete entry" (destructive, runs the delete) and
   "Keep it" (ghost, clears `confirming`) — naming the action on each button
   rather than Yes/No.
2. Delete currently sits in the `DialogFooter` row with Cancel and Save
   (`sm:mr-auto`), where muscle memory for Save lives. Move the delete control
   out of the footer into its own bordered row above it:
   `<div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 px-3 py-2 text-sm">`
   with a short label ("Delete this entry") on the left and the button(s) on
   the right. Only render it when `entry` is non-null (edit mode), as today.

Keep the existing `run(...)` helper and its RLS zero-rows check untouched.

**Verification:** the Global Constraints gate. In your report, state what
happens on: delete + undo inside 5s, delete + navigate away inside 5s, and two
deletes in a row.

---

## Task 10: Comment thread — optimistic send, upload feedback, scoped announcements

**File:** `src/components/comment-thread.tsx`

Three findings in the app's most-used surface. This is the judgment-heavy task
in the plan; the others are mostly mechanical.

1. **Optimistic send.** `send()` currently awaits the insert before clearing
   the composer, so every message has a visible round-trip delay — and chat is
   the textbook reversible, low-stakes case for an optimistic update.
   - On submit, append a pending comment to `comments` with
     `id: crypto.randomUUID()`, the trimmed text, `created_at: new
     Date().toISOString()`, `author_id: userId`, the caller's own role, null
     attachment fields, and `author: null` — plus a local `pending: true` flag.
     Extend the local `Comment` type with `pending?: boolean`; it is a local
     type, not a DB shape.
   - Clear the composer immediately.
   - Render a pending bubble at reduced opacity (`opacity-60`) — and because
     opacity alone is a weak signal, do not rely on it for failure: on insert
     error, remove the pending row, restore the text into the composer so the
     message is not lost, and `toast.error`.
   - On success, the existing `load()` replaces the optimistic row with the
     server row (the realtime INSERT also triggers `load`). Guard against the
     pending row lingering: `load()` replaces the whole array, so this is
     already correct — confirm it rather than adding dedupe logic.
   - Do NOT make the file upload optimistic. An upload that fails after the
     bubble appears is a worse lie than a short wait.

2. **Upload feedback.** A file upload shows nothing today — `setSending(true)`
   dims the send button and that is all, for however long the transfer takes.
   `supabase-js` v2's storage `upload()` exposes no progress events, so a
   percentage is not available without replacing it with raw XHR — out of
   proportion here. Show an indeterminate busy state that names the file
   instead: while `sending` and a `file` is staged, replace the attachment chip
   (line ~165) content with `<Loader2 className="animate-spin size-4" />` plus
   `Uploading {file.name}…`, and hide its remove button. Mark the ceiling:
   `// ponytail: indeterminate — supabase-js storage upload has no progress events; raw XHR if a percentage is ever needed`

3. **Scoped announcements.** `aria-live="polite"` sits on the whole scrolling
   message list (line ~116), so a screen reader announces every message in the
   thread on load, not just arrivals.
   - Remove `aria-live` from the scroll container.
   - Add a visually-hidden live region after the list:
     `<p className="sr-only" aria-live="polite">{announce}</p>`
   - Drive it from a `useState<string>("")` set in the realtime/`load` path
     only *after* the first load has completed (a `useRef<boolean>` first-load
     flag), with the newest message's author and text, e.g.
     `` `${name}: ${text}` ``. Keep it short — truncate the text to ~100 chars.

Preserve every existing behaviour: the `thread_reads` upsert, the realtime
channel and its cleanup, the Enter-to-send handler with its `isComposing`
guard, the signed-URL download, and the scroll-to-bottom effect.

**Verification:** the Global Constraints gate. Walk through, in your report:
send succeeds, send fails, send with attachment, and what a screen reader
announces on initial load versus on an arrival.

---

## Task 11: Empty states, non-colour signals, toast placement

**Files:** `src/components/retainer-usage.tsx`, `src/components/ui/sonner.tsx`,
`src/pages/people.tsx`, `src/pages/todos.tsx`, `src/pages/time.tsx`,
`src/pages/reports.tsx`, `src/pages/clients.tsx`

The remaining findings. Small, independent edits; keep them in one commit.

1. **`retainer-usage.tsx` over-budget is colour-only.** When `over` is true the
   only signals are red text and a red bar — identical to the normal state for
   a red/green colour-blind viewer. Add an `AlertTriangle` (`size-4
   text-destructive` inline before the text) and name the overage in words:
   append `· over by {hoursMinutes((hours - retainerHours) * 3_600_000)}` to
   the line when `over`. Keep the existing `role="progressbar"` and its aria
   values exactly as they are.

2. **`ui/sonner.tsx` placement.** Sonner defaults to bottom-right, which on a
   phone sits on top of the comment composer and the to-do add form. Pass a
   breakpoint-chosen position and a close button:
   - `position={window.matchMedia("(max-width: 640px)").matches ? "top-center" : "bottom-right"}`
   - `closeButton`
   - The Toaster mounts once at the app root, so a resize across the breakpoint
     will not move it: `// ponytail: position fixed at mount; a resize across the breakpoint keeps the old corner`
   - Keep the existing `toastOptions.classNames` block untouched.

3. **Empty states — give each a visual signal and one clear action.** Today
   they are bare sentences, which is indistinguishable from a broken region:
   - `people.tsx:148` "Nobody yet." → centred `Users` icon (`size-5
     text-muted-foreground`) above the text, `py-8`. The invite form is already
     the action directly above; do not add a second one.
   - `todos.tsx` (the `else` branch Task 3 left empty) → a `Card` with a
     centred `ListTodo` icon and "Nothing planned for this day yet." The add
     form sits above it; no button.
   - `time.tsx:312` existing empty card → add a `Clock` icon above the
     sentence, same centred treatment.
   - `reports.tsx:147` existing empty card → add a `ChartNoAxesColumn` icon
     (verify the export name against the installed `lucide-react` version; use
     `BarChart3` if that is what resolves).
   - `clients.tsx:277` "No clients yet. Add your first one." → add a `Building2`
     icon above it.

   Use the same shape everywhere — `grid justify-items-center gap-2 py-10
   text-center text-sm text-muted-foreground` — so the five read as one system.

**Verification:** the Global Constraints gate. Confirm every lucide icon name
you used actually exports: `npx tsc --noEmit` catches a bad import, so paste
its clean output.
