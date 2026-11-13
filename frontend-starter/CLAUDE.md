# Claude instructions

Follow `AGENTS.md` and `best-practices.md`. This project uses Angular 22 standalone components, `inject()`, Signals, Reactive Forms, and native `@if`/`@for` control flow. Preserve `API_CONTRACT.md`, keep shared infrastructure in `src/app/shared`, and do not modify `backend/`. If an API route must intentionally change, update `API_CONTRACT.md` in the same change with its method, URL, auth, parameters, body, responses, and errors.

Before changing the interface, read `../docs/ARCHITECTURE_FRONTEND.md` (services, components, Web Audio graph, degradation) and `../docs/DIRECTION_ARTISTIQUE.md` (design tokens, measured contrasts), and update them in the same change when the structure or the charter moves. `AGENTS.md` lists the invariants that are easy to break: shared state lives in root services, there is exactly one permanent `<audio>` element, no hard-coded colors, and no information carried by color alone.
