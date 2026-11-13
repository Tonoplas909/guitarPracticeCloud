# Instructions for coding assistants

This is an Angular 22 standalone application. Read `best-practices.md` before changing code.

- Keep one class per TypeScript file and one component per component folder.
- Keep each component's TypeScript, HTML, and CSS files together.
- Use `inject()`, Signals, Reactive Forms, `@if`, and `@for`.
- Keep services, guards, authentication, interceptors, and models in `src/app/shared`.

Read `../docs/ARCHITECTURE_FRONTEND.md` (services, components, audio graph) and
`../docs/DIRECTION_ARTISTIQUE.md` (design tokens) before changing the UI, and
update them in the same change when the structure or the charter moves.

Rules that are easy to break without noticing:

- **Shared state belongs in a service, not a page.** Playback
  (`PlayerService`), the library (`LibraryStore`), uploads
  (`UploadQueueService`) and local metadata (`TrackMetaService`) are
  `providedIn: 'root'`, because the player bar, the stage and the library rows
  all read the same state.
- **There is exactly one `<audio>` element**, in `player-bar.html`, and it is
  never wrapped in an `@if`. `createMediaElementSource()` can be called only
  once per element, so a re-created element permanently kills the visualizer
  and the equalizer. Its `src` is bound with `[attr.src]` and `null` when
  empty — a `src=""` resolves to the page URL and fires a bogus error.
- **No hard-coded colors, sizes or spacing.** Everything comes from the CSS
  custom properties declared in `src/styles.css`. If a value is missing, add
  the token there and document it.
- **Never style bare `button`** beyond `font`/`cursor`: Angular Material
  components contain their own buttons. Use `.btn`, `.icon-btn` and friends.
- **No information carried by color alone**, and keyboard focus must stay
  visible. Every icon-only control needs an `aria-label` that follows its state.
- Guard browser APIs that may be missing (`AudioContext`,
  `canvas.getContext('2d')`, `localStorage`, `matchMedia`, `roundRect`): the
  app must degrade, and the test environment has none of them.
- Changing the four `--fmt-*` chart colors requires re-validating the palette
  (lightness band, chroma floor, CVD separation, contrast) — see
  `../docs/DIRECTION_ARTISTIQUE.md`, section 3.
- Preserve the HTTP contract in `../API_CONTRACT.md` and never modify `backend/`.
- If a mission intentionally changes an API route, update `../API_CONTRACT.md` in the same change and document method, URL, auth, parameters, body, responses, and errors.
- Do not put passwords or JWT secrets in frontend code.
- Keep explicit `subscribe({ next, error })` blocks at user-action/HTTP boundaries so behavior can be traced in the console.
- After a change, run `npm run build` **and** `npm test` (132 tests, 12 files),
  then manually verify the browser Network panel. The suite covers the stores
  and the player, so a behavior change should show up there — if it does not,
  the test is missing.
