# Gemini instructions

Follow `AGENTS.md` and `best-practices.md`. Keep one class per TypeScript file, colocate each component's `.ts`, `.html`, and `.css`, use `inject()` and Signals, preserve the documented API routes, and never put credentials or JWT secrets in Angular code. If a route changes intentionally, update `API_CONTRACT.md` in the same change with method, URL, auth, parameters, body, responses, and errors.

Before changing the interface, read `../docs/ARCHITECTURE_FRONTEND.md` and `../docs/DIRECTION_ARTISTIQUE.md`, and update them in the same change when the structure or the charter moves. `AGENTS.md` lists the invariants that are easy to break.
