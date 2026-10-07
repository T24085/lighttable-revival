# Next steps for coding and local review

The approved GitHub update was fast-forwarded from `eeca552` to `8ad2651` on
2026-10-07. Clef remains excluded as requested. Tev1 remains the independent,
text-only decision model. Review is now required and runs in the background. The per-task selector and Off
option have been removed. Conversational
follow-up questions are not needed when the request and evidence are sufficient.

## Establish real workflow evidence

The new `script/revival-assistant-reviewer-real-test.ps1` runs the actual Electron
composer against installed coding and decision weights. It uses a disposable
counter with a seeded mobile overflow, journaled source edits, actual Node tests,
and browser interaction checks. It observes production Ollama calls without
substituting responses. The test restores the test profile and project selection,
removes its generated project and stops owned work. Normal conversations and
settings are not changed.

```powershell
& .\script\revival-assistant-reviewer-real-test.ps1 -CodingModel 'ornith-1.5:9b' -ReviewerModel 'tev1:4b'
```

Read `.revival/assistant-reviewer-ollama-result.json` for actual payloads, answers,
probabilities, measurements, source changes, checks and the final checkpoint.
`passed` verifies reviewer integration and cleanup; `workflowPassed` separately
requires a completed run with a passing final review. An uncertainty pause must
never be described as a successful correction. Run this fixture serially with
other native proofs because they share the test profile.

## Recommended implementation order

The first implementation pass now covers project-bound test receipts, named
acceptance checks and alternate-tool coding recovery. Tests can run before
preview startup. Every test receipt must match current saved project source;
unsaved or incomplete inventories do not count as tested. Declared control
selectors and individual interaction IDs are verified at both viewports.
Failed edits can be repaired by a journaled write of the intended result, and
the intent survives restart. Unrelated changes cannot clear the failure.

Focused validation passed 66 existing assistant controller checks, 13 new source
and recovery checks, 39 reviewer controller checks and nine native Electron
checks. The native fixture repaired the seeded mobile overflow, ran actual Node
tests before preview startup, then completed named control and interaction
checks at desktop and mobile sizes. It also checked uncertainty, server-source
binding and cleanup. The existing 27-check native assistant regression also
passed, covering editor saves, Undo, Stop, previews and process cleanup.
Reviewer responses were simulated; these checks establish
application behavior, not real-model judgment accuracy. Receipts are
`.revival/assistant-verification-unit-result.json`,
`.revival/reviewer-receipts-unit-result.json` and
`.revival/reviewer-verification-native-result.json`.

The next experiment should repeat the real Ornith/Tev1 composer fixture with
these changes, recording whether the model declares useful criteria, saves
corrections, runs all required checks and reaches an accurate final outcome.
Keep the current context setting until the isolated comparison below is run.

1. **Validate the implemented coding recovery with installed weights.** Failed
   operations now retain their intended effects and clear only after a matching
   successful action. Alternate-tool repair, unrelated-file edits, rename and
   delete failures, and restart/Resume are covered by controller tests. Repeat
   the pre-pull scenario with Ornith to confirm a completed save no longer
   produces the false “File changes were not saved” checkpoint.
2. **Exercise explicit checks in real coding runs.** Have Ornith derive named
   acceptance checks before coding or ask for a missing product requirement.
   Check that both viewports and current-source tests establish those outcomes.
   Tev1 probabilities remain advisory; actual failed checks override them.
   Generic clean classifications cannot establish an unspecified requirement,
   visual quality or missing interaction receipts.
3. **Add a small, durable reviewer outcome.** Keep review in the background, but
   show a compact result such as “Tev1: desktop passed; mobile overflow; paused.”
   Include whether review actually ran, its source revision, completed checks,
   correction count and unavailable evidence. Preserve an expandable technical
   report. Show “not run” when coding ends before review, and
   invalidate the outcome when source changes. Do not add mandatory follow-up
   dialogs to ordinary successful runs.
4. **Ask only actionable questions.** The decision endpoint returns fixed-choice
   classifications and cannot ask a conversational question. When uncertainty
   requires a user decision, the coding controller should produce one specific
   question through `ask_user`. Missing measurable evidence should trigger the
   relevant check or an explicit pause; it should not ask the user to certify
   correctness the program can test itself.
5. **Prove daily workflows before expansion.** Repeat cold and warm runs on an
   existing static app, a Vite development-server app and a broken mobile layout.
   Include clean, uncertain and missing-control fixtures. Record coding latency,
   reviewer latency, source binding, cleanup and preview responsiveness. Keep
   optional model validation and honest Untested labels. Do not tune judgment
   prompts solely to pass known fixtures. Browser frame measurements describe
   rendering intervals, not application FPS or a full performance diagnosis.

## Image review

Tev1 receives DOM, logs, bounds, tests and browser measurements; it receives no
screenshots. Clef is intentionally disabled. Keep image appearance explicitly
unverified until another installed, compatible image decision model is selected
and tested with actual pixels and labeled cases. Do not reinstate Clef or change
model selections silently.

## Current UI behavior

Light Table automatically retains an eligible remembered reviewer or selects the
smallest installed local decision model. Send cannot opt out of review.
Current review progress is a transient status message; the completed report is
collapsed JSON in chat. The coding tool now explicitly identifies check_preview
source as executable JavaScript and bounds repeated URL misuse to three failures.
The current evidence pipeline requires a browser preview; unsupported preview-free
tasks may pause pending a future structured task-evidence path.
The absence of a follow-up question is not evidence that
review failed to run. The report and actual decision calls establish invocation;
the checks and judgments establish what was verified.

## Actual run on this machine

The first real composer run used `ornith-1.5:9b` at the existing 65,536-token
setting and `tev1:4b` Q8_0. It finished its integration proof in 17 minutes
43 seconds, with the application correctly paused rather than reporting success.
The receipt is `.revival/assistant-reviewer-ollama-before-fix-result.json`.

- Ornith saved three source changes and ran two passing Node tests, but ran the
  tests before starting the preview. The receipt could not be bound to preview
  source, so it did not count as verified review evidence.
- Ornith repeatedly supplied a preview URL or ID instead of JavaScript to
  `check_preview`. No interaction assertions succeeded. The clarified schema and
  three-attempt URL-misuse guard were implemented after observing this failure.
- Tev1 actually received and answered both System One requests: 1,459 input
  tokens for desktop and 1,515 for mobile, with no image data. The desktop request
  took 195.9 seconds including loading; mobile took 0.94 seconds.
- Tev1 selected `clean` for mobile despite the recorded overflow, with only
  0.476 probability. Both viewport judgments were below the 0.85 threshold.
  Deterministic checks retained the mobile overflow and invalid test receipt;
  missing behavior checks and low confidence paused correction at round zero.
- Reviewer residency samples peaked near 5.02 GiB model memory and 3.91 GiB
  VRAM. Browser responsiveness probes completed during inference; the maximum
  recorded response was 122 ms. These probes are not a complete UX benchmark.
- Owned commands, jobs, views and the helper were cleared; the test profile and
  project selection were restored. No normal conversation was changed.

This proves that review runs and that unfavorable evidence prevents completion.
It does not prove Tev1 accurately classifies defects or reliably improves an app.
The model's mobile clean answer shows why deterministic checks and conservative
pauses must remain authoritative.

Before expanding the reviewer, repeat the real composer experiment to verify
that Ornith uses the new named criteria and current-source receipts reliably.
Compare coding contexts below 64K in isolated runs to measure loading and RAM
pressure. Keep the user's normal context setting unchanged until the comparison
establishes a useful tradeoff.
