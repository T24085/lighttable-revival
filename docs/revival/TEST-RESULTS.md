# Experimental release verification

Release: **v0.9.0-revival.1**, Windows x64. The source commit and complete source-file SHA256 manifest are recorded in the release asset `SOURCE-PROVENANCE.json`. Upstream develop ancestor: `000cc9b308296461f4ca8f639e3acf74ae3a86eb`. Original application metadata remains 0.9.0 for upstream compatibility; `REVIVAL-VERSION.json` identifies the revival distribution.

## Fresh isolated build and focused verification

The original ClojureScript app compiled in 51.186 seconds and its self-hosted REPL in 27.763 seconds on 2026-10-05, using Node 24.15.0, npm 11.12.1, PowerShell 7.6.6, Java 24 and Electron 44.5.1. Existing upstream compiler warnings remain.

| Validation | Result | Scope |
| --- | --- | --- |
| Assistant controller/transport | 50 passed | Mock model; context, source guards, recovery, Stop and cleanup |
| Original native editor assistant fixture | 27 passed | Actual CodeMirror editing, dirty buffers, save/undo conflicts, foreground commands, native preview DOM/pixels, Quick Run and cleanup |
| Actual disposable JavaScript worker | 6 passed | `20 + 22` returns 42 with exact source hash; fresh global state, promise, console protocol, unchanged 1500 ms authored-code timeout and cancellation |
| Server-provider registration | 5 passed | Late cleanup cannot remove a replacement provider, including reused provider objects |

The native run used an isolated test profile and a test-only no-focus wrapper. It did not interact with the user's active editor. Native and worker receipts report zero owned views/jobs/pending work and no remaining quota helper. A final test-fixture-only change adds an animation-frame wait to the successful retry assertion; it does not change runtime code. An additional focused Quick Run fixture is included but not represented as another fresh passing run.

The worker startup repair gives trusted initialization its own bounded startup phase before starting the unchanged authored-code deadline. Preview initialization similarly separates inert painting/quota setup from authored execution. Quotas, sandbox requirements and execution deadlines remain enforced.

An earlier actual Ollama smoke completed with `ornith-1.5:9b` and requested 65,536 context, using the native editor, and separately captured the program result 42. This was not rerun during final packaging. Ollama/models are optional user-managed prerequisites.

## Limits of this evidence

The earlier broad baseline (41 native entrypoints, Vite 33 checks and demo 5 checks) predates the latest focused changes and is historical evidence. The entire broad suite has not been rerun against this release. Hosted CI and a fresh Windows machine have not been certified. The Windows package is unsigned and experimental. Runtime workflow prerequisites include existing Node 24+ and PowerShell 7+; Java, Python and Ollama are optional for their respective features.

Archives are checked for CRC integrity, source identity and exclusion of local profiles, raw transcripts and credentials. Pattern scanning is not a security guarantee. Recognized historical upstream test-key fixtures remain in upstream history; they are not new user credentials. Read [known limits](KNOWN-LIMITS.md) and [testing instructions](TESTING.md).
