# Assistant argument recovery — 2026-10-07

## New About-page recovery follow-up

The reported About-page request produced a complete HTML payload without a
`path` and without reading a file in the current request. Existing-file recovery
was therefore ineligible, and a later full coding retry returned an empty reply.
The user stopped the run; no About page was saved.

Explicit new HTML-page requests now qualify independently of previous reads.
The destination request receives the retained document title and local HTML links
alongside actual project folders, filenames and bounded page-title excerpts.
The inventory skips links, hidden folders, dependencies and generated outputs;
it is bounded to 200 entries, 24 folders, 40 page titles and three folder levels.
The full generated source is still retained locally and omitted from inference.
The response must contain only a path or null. A new destination must be an HTML
file in a listed existing folder inside the resolved project. Existing disk files
and unsaved buffers are refused. Absence is recorded before execution so a newly
appearing file cannot be overwritten; a redirected destination is also refused
before tool execution. Existing-file recovery retains read/hash/buffer guards.
Building a website from a previously read entry still uses replacement recovery.

Resending the same stopped request can recover its stored failed payload before
another full coding generation. A new request cannot replay an unrelated payload,
and steering updates which request is eligible. Saving remains an ordinary
journaled file-tool operation; normal coding and verification continue afterward.
Retained source can include trailing narration from the model. This repair reuses
it exactly and does not certify its markup, navigation or full task completion.

The isolated native Electron test used a read-only copy of the exact reported
4,772-character About payload. Actual `gemma4:12b` destination inference selected
`golf-course-website/about.html`, followed by a real save and rendered About-page
inspection. The fixture's home page remained byte-for-byte unchanged. Coding
responses and subsequent preview tool choices were simulated; the destination
model, file operations and browser inspection were real. The fixtures used isolated profiles and did not resume the normal conversation
or write website files. Its `updatedAt` advanced during validation, while its
latest events still describe the original stopped run; full chat byte identity
is not claimed. No About page was manually added to the user's website by validation.

Final focused checks: 86 controller/transport, 13 source-verification, 29 native
Electron and 39 reviewer-controller checks passed (167 total). The full broader
regression and a complete real coding/reviewer task were not rerun. Receipts are
`.revival/assistant-new-page-native-result.json`,
`.revival/assistant-new-page-reviewer-result.json` and
`.revival/assistant-new-page-final-check.json`. Cleanup confirms no owned runs,
commands, editor requests, views, jobs, pending work or memory helper, plus fixture
removal and restoration of test project state.

Restart Light Table, then resend the same About-page prompt to load this fix and
recover the stored content through the application.

## Earlier destination-only recovery follow-up

The real coding model continued omitting `path` after it had read the correct
HTML file. The controller now retains that rejected write payload and requests
only its destination using Ollama's
[JSON-schema structured output](https://docs.ollama.com/capabilities/structured-outputs).
The schema restricts the answer to at most eight previously read existing files
inside the project, or `null` for an ambiguous target. The generated HTML is not
sent to this request. It uses up to 4,096 context tokens, at most 192 output
tokens, disabled thinking and a one-minute deadline.

A confirmed choice is replayed through the ordinary `write_file` tool, editor
transaction, journal and source-hash checks. Original generated content is reused
exactly. Disk or buffer changes during recovery block the save, and a failed
recovery does not refresh stale observations. Invalid JSON, an unread path,
ambiguous selection or Stop preserves the pending payload and saves nothing.
Steering during selection prevents the old write. Recovery never substitutes an
active editor or guessed filename. At that checkpoint, with no eligible prior read, the existing
required-argument guidance remained in use; the new-page follow-up above extends it. Restart or resend of the same request
can recover its stored pending write before another full coding generation; a
different new request does not automatically replay an older payload.

The native Electron fixture used the installed `gemma4:12b` for the actual
destination response and a read-only copy of the then-current 12,533-character failed
payload. Its initial malformed coding call was injected to reproduce the failure;
subsequent path inference was real, followed by a real editor save and browser
inspection in a disposable project. The first run selected the path in about
15 seconds, with 432 input and 70 output tokens, versus the reported full-code
retries of six to seven minutes. This verifies destination recovery, not general
coding-model quality or a complete reviewed website task. The normal website and
chat were not modified or resumed. Retained content can include mistakes or
trailing prose from the coding model; recovery does not silently rewrite it, and
the normal coding/preview/review flow still needs to inspect the saved result.

Receipts are `.revival/assistant-destination-real-result.json` and
`.revival/assistant-destination-final-check.json`. Restart Light Table and resend
the latest prompt to use the changed controller. Earlier measurements and repair
notes below describe the first iteration.

Final checks passed: 77 assistant controller/transport checks, 13 source
verification checks, 28 native Electron checks and 39 reviewer controller checks
(157 total), plus seven changed JavaScript files passing syntax checks. One
native rerun saved correctly but exposed a fixture window-layout race before
preview startup; the fixture now waits two animation frames for layout to settle
before requesting its preview, and the subsequent native runs passed. Final
cleanup reported zero owned runs, commands, editor requests, views, jobs and
pending work; the test project was restored and its fixture removed. The full
regression sweep and complete coding-plus-review inference were not rerun.

## Initial recovery iteration

The reported run generated a `write_file` call containing HTML but no `path`.
The tool rejected it with `Missing path`. The coding model then claimed the
website was updated; the controller rejected that completion and requested a
repair. No save occurred, and review did not begin. The first generation took
about eleven minutes with 31,718 input tokens. No new model timing measurement
is implied by this repair.

Schema-invalid calls now report `LT_TOOL_ARGUMENTS` with the required fields and
specific recovery instructions. Required file paths must be nonempty. Repair
guidance reaches the next coding request immediately after all results in the
tool-call exchange, without waiting for a completion answer. The model must
identify and read the target; the application never guesses a missing path.
Equivalent invalid calls pause after three attempts even if generated HTML
changes. Pending-save guidance also accompanies restarted or continued work.
Actual journaled saves, source guards and the existing unresolved-action checks
remain required before completion.

Long conversations now use a request-only working history capped at 32,000
serialized text characters, or less for a smaller configured context. It retains
recorded goals, user requests, known paths, saved changes, unresolved actions,
review criteria and command receipts with recent complete tool exchanges. Large
older source/output can be omitted and must be inspected again. No model call
is needed to summarize history. The complete saved transcript remains intact;
the configured `options.num_ctx` value still reaches each coding request.

Read-only projection of the reported 119-message conversation reduced history
from 107,139 to 21,989 characters. The latest failed HTML payload, latest user
request and unresolved failure were preserved. The saved conversation hash was
unchanged. This measures history text, not total model input tokens or speed.
The receipt is `.revival/assistant-recovery-history-result.json`.

Targeted validation includes the assistant controller and transport, source-bound
verification, reviewer controller, HTML discovery and browser policy, and native
Electron assistant workflows. The native recovery scenario rejects an invalid
call, reads the target, performs a journaled editor save and inspects the actual
updated preview. Coding-model replies in these tests are simulated; editor,
file, browser and command operations are real. The fixture then uses Stop before
review inference and preserves normal profiles and projects. Its follow-on Stop
test waits for the renderer to finish stopping before sending another prompt.

The final assistant runner passed 70 controller/transport checks, 13 source
verification checks and 28 native Electron checks (111 total). Six changed
JavaScript files passed syntax checks. Related reviewer-controller checks (39)
and HTML discovery/browser-policy checks (9) also passed during this repair.
Native cleanup reported no remaining assistant runs, commands, editor requests,
views, jobs, pending operations or memory helper, with project restoration and
fixture removal confirmed. `.revival/assistant-recovery-final-check.json`
records the final source and receipt hashes and unchanged normal chat/site.

Restart Light Table to load the changed modules, then resend the latest prompt
in the existing conversation. The normal chat, its stopped state and the user's
website were not edited or resumed by these tests. Installed coding/reviewer
weights and the full regression sweep were not rerun.
