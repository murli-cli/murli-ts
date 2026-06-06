# murli-work-commander

Reference `murli-work` task tracker wrapped with `@murli-cli/commander`. Demonstrates
dual-audience output, `describe`/`--schema`, the mutation guard, dry-run, and structured
errors.

## Scoping notes
- App-level `--output table|json|csv` is omitted (collides with murli's injected `--output`).
  Human mode renders tables; agent mode returns structured `result` payloads.
- Errors use murli's taxonomy: `not_found` (5), `conflict` (7); invalid enums → `flag_error` (1).
- Set `MURLI_WORK_DIR` to override the storage directory (used by tests).
