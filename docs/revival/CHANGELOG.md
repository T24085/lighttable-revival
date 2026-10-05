# Experimental revival changelog

## Release candidate â€” 2026-10-05

Experimental Windows x64 prerelease; see [release verification](TEST-RESULTS.md) and the release source manifest.

- Retained the original upstream ClojureScript editor and rebuilt its app and self-hosted REPL on the pinned Electron runtime.
- Restored project/CLI opening, editing, saving and dirty-buffer safeguards; results and errors retain source identity.
- Added JavaScript/Node, npm scripts, browser previews, scoped automatic live view, supported JSX/TypeScript transforms and source maps.
- Restored structural editing, rainbow parentheses, HTML tag helpers, persistent local Python/Clojure/ClojureScript REPLs and external nREPL/IPython clients.
- Added the Ollama Chat / Activity dock, native file/command/preview tools, source guards, recorded-edit undo, paused recovery and Stop controls.
- Added explicit context settings: default 65,536, custom 2,048â€“262,144; tests observe actual outgoing values.

Latest focused verification: 50 assistant controller checks, 27 original-editor native checks, 6 actual disposable-worker checks and 5 provider-registration checks passed. The earlier broad baseline is historical; hosted CI and clean-machine certification remain pending. [Verification details](TEST-RESULTS.md).

Original upstream changes remain in [the historical changelog](../../CHANGELOG.md). See [known limits](KNOWN-LIMITS.md) and [implementation notes](../../REVIVAL.md) for supported behavior and earlier verification.
