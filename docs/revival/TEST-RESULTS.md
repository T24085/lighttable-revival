# Installed reviewer qualification — 2026-10-06

The installed model files are in `E:\OllamaData\models`, served by local Ollama **0.35.1**. The installed tags are `tev1:4b` (Q8_0, about 4.5 GB on disk) and `clef-flash:9b` (Q8_0, about 10 GB). No downloads, relocation, coding/reviewer selection changes or normal-profile qualification writes occurred. Light Table now recognizes Clef's installed vision projector even when `/api/show` omits `vision` from its decision capabilities. A regression check rejects descriptive model tags as proof of vision support.

The new isolated real-weight runner uses production collection, System One transport and qualification rules, actual browser fixtures at both sizes, and a live-preview responsiveness probe. The completed receipt is `.revival/reviewer-real-result.json` (`simulated:false`).

| Installed reviewer | Real result | Automatic correction |
| --- | --- | --- |
| Tev1 `4b`, text | 10/12 correct layout cases; both uncertainty cases passed; no defect classifications on clean fixtures. The missing-button case was uncertain, and the clipped-heading case was classified clean. All seeded missing controls must be detected, so qualification failed. | Disabled; Untested |
| Clef Flash `9b`, images | The first desktop screenshot request reached the five-minute deadline before loading completed. Ollama logged cancellation during model loading. No accuracy or complete-cycle result is available. | Disabled; Untested |

Tev1's three full desktop/mobile cycles took **17,311 / 17,249 / 17,316 ms**, including five seconds of frame/long-task sampling per viewport. Desktop requests took about 6 seconds and mobile requests about 0.8 seconds. Sampled live-preview evaluations took at most 2 ms; this checks responsiveness of the fixture, rather than certifying arbitrary user programs. Ollama reported a loaded model size of 5,387,489,114 bytes and VRAM of 4,196,044,635 bytes when the runner was sampled. These values are not additive host-RAM measurements. Runner loading observations include scheduling/polling and are unavailable for requests completed between samples. Clef's load did not reach a sampled `/api/ps` entry.

Cleanup reported zero active previews, jobs or pending work, no quota helper, and no remaining owned Electron processes. `/api/ps` reported no loaded models after release; the user's Ollama service remains running. Normal conversations, settings and qualification state were preserved. The hardware was an RTX 2060 with 6 GiB VRAM and approximately 16 GiB system RAM; this run does not establish that hardware capacity alone caused the Clef timeout.

Manual review remains available after restarting the source app and refreshing installed models. Automatic correction stays gated; neither result justifies enabling it. A dedicated launcher, `script/revival-reviewer-real-test.ps1`, records failed qualification and returns a failure status. The UI's **Validate reviewer** stores normal-profile qualification receipts. The transport now reports a clear five-minute deadline message while preserving explicit caller cancellation reasons. Existing release archives were not rebuilt.

After these fixes, **29 reviewer controller**, **10 native reviewer**, and **50 assistant controller** checks passed. The native proof uses simulated inference with actual PNG capture, viewport/scroll restoration, Stop, qualification gating, journaled mobile source correction, tests and behavior assertions at both sizes, independent settings, and cleanup. JavaScript/PowerShell syntax and `git diff --check` passed. `.revival/reviewer-installed-final-check.json` binds the real and simulated receipts to the current source checkpoint. The complete editor regression suite was not rerun for this metadata/transport increment.

# Startup fixture repair — 2026-10-05

The three failing fixtures now pass: module evaluation **45 checks**, browser preview **23 checks**, and event/SVG watches **39 checks**. Ordinary previews and expression watches now attach and paint their inert bootstrap before the authored loading deadline, using the existing bounded initialization path. Authored execution/loading deadlines, sandboxing and memory limits are unchanged; the preview proof still checks infinite-loop termination, pending-promise cancellation, quota failures and cleanup.

The module fixture now creates its own project instead of depending on the earlier evaluation fixture's selected project. Module and event/SVG proofs start with an empty test workspace and restore the exact previous test cache and project selection. Event/SVG startup failures now report the underlying preview error instead of dereferencing a missing watch snapshot. The initial reproduction passed preview/event-SVG but exposed the module fixture's project-order dependency; the earlier deadline failures were intermittent.

Related native checks pass for browser watches **17**, development-server watches **17**, hot updates **10**, the live editor **21**, and reviewer integration **10**. The reviewer integration includes actual image capture, viewport restoration, cancellation and journaled mobile correction with tests and behavior assertions; inference is simulated. Module compilation **31**, preview-file handling **16**, reviewer controller **27**, and assistant controller **50** checks also pass. `.revival/startup-final-check.json` records the current source/receipt hashes and cleanup inventory: **182 native + 124 controller/file checks**. This focused repair supersedes the three outstanding failures in the historical reviewer increment below. The entire 42-entrypoint suite was not rerun after this repair.

# Historical selectable reviewer increment — 2026-10-05

The source app now has independent local reviewer selection, System One transport, desktop/mobile evidence collection, manual review, model qualification and bounded automatic correction. No reviewer weights were downloaded or used. Each installed reviewer starts **Untested** and automatic correction remains disabled until its real-model qualification passes. Restart using the root `Launch-LightTable.bat` to load this source increment; existing release/portable archives were not rebuilt.

| Validation | Result | Scope |
| --- | --- | --- |
| Reviewer protocol/controller | 27 passed | Simulated decisions; capability selection, payload/schema bounds, cancellation, stale evidence, locked criteria, changed test sources, uncertainty and correction limits |
| Reviewer native proof | 10 passed | Actual screenshots and controls; viewport/scroll restoration, text/image routing, qualification cases and cycles, source binding, settings, journaled mobile correction and cleanup; simulated inference |
| Supplemental native correction | 1 passed | Latest controller safeguards and coding-model release before measurement; actual file correction, Node tests and interactions at both sizes; simulated qualification/inference |
| Existing assistant | 50 controller + 27 native passed | Transport/controller and actual editor/save/Undo/command/preview workflows |
| Development-server preview | 33 passed | Actual Vite preview integration |
| Shipped animated demo | 6 passed | Actual rendered pixels, advancing frames, live updates, Run and complete editor layout |
| Broader native sweep | 39 of 42 entrypoints passed | Three legacy fixture failures remain: module compilation startup, preview page-load deadline and event/SVG page-load/watch setup |

At this historical checkpoint the complete regression was **not all green**. The original failures are retained as `.revival/module-result.json.before-baseline`, `preview-result.json.before-baseline` and `event-svg-result.json.before-baseline`; the primary receipts were replaced by passing runs during the startup repair above. The feature proof used an isolated test profile and restored its project/cache. Receipts distinguish simulated reviewer decisions from actual browser, editor, command and test execution. Real reviewer accuracy, loading, latency and memory measurements remain pending.

The local `.revival/reviewer-final-check.json` records current source hashes, receipt hashes, syntax validation and cleanup inventory. The full native proof precedes the last controller safeguards; the current controller tests and supplemental correction cover those changes. See [reviewer usage and qualification](REVIEWERS.md).

# Historical experimental release verification

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
