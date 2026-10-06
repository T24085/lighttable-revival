# Automatic Vite preview — 2026-10-06

Vite/Tailwind project creation was supported, but the automatic live-view controller still treated its HTML entry as a captured file instead of launching the Vite development server. Reopening a project therefore did not restore the intended served application beside the code. Automatic live view now recognizes the saved Vite project configuration, installs missing dependencies, starts the development server and opens the actual served app in the existing split preview.

The existing project-execution permission and process-family quotas apply. Cancelling permission pauses setup without repeated prompts. Run reloads the existing server or retries a failed start. Pause closes an automatically owned server, while changing projects releases that server and restores the next project's preview. Reloading the editor adopts an existing automatically started server without launching another. Turning Automatic live view off remains respected across project changes. Failed or incomplete setup leaves a visible preview pane with recovery guidance.

Automatic setup waits while the coding assistant works or displays its own preview. Existing plain HTML automatic execution and its unsaved-buffer updates remain available. Vite receives saved source changes through its development server. The existing finite server lifetime remains in effect; Run restarts after expiry. The stopped golf-project chat and its partial source were preserved; a missing dev script or entry now produces visible setup guidance rather than a vanished pane.

The dedicated native fixture passes **15 checks**, including actual dependency installation, React interaction and Tailwind styles, journaled live updates, Run reuse, editor reload, visible native-view bounds and captured pixels, Pause cleanup, a deliberately broken Vite config and repaired retry, switching to plain HTML, incomplete setup, cancelled execution permission, and the disabled automatic-view setting. Model discovery is simulated; npm, Vite, the original editor and browser execution are real. The receipt is `.revival/auto-vite-result.json` and the actual application capture is `.revival/auto-vite-preview.png`. Cleanup reports zero owned commands, editor requests, previews, quota jobs and pending work, with the prior test profile/project restored and the disposable project removed.

Related regressions were rerun serially on this implementation:

| Suite | Passing checks |
| --- | --- |
| Existing automatic live editor | 21 |
| Existing native assistant | 27 |
| Native npm controls | 15 |
| Native development-server preview | 45 |
| Project controller | 28 |
| npm backend and process cleanup | 18 |

All ten changed JavaScript/CommonJS files and the main PowerShell test script passed syntax checks. `.revival/auto-preview-final-check.json` binds the current source and passing receipts. The earlier real Gemma4 Vite/Tailwind workflow remains a separate historical result and was not rerun for this automatic-launch increment.

The main regression script includes this new native fixture, increasing its serialized native entrypoints from 44 to 45. A complete 45-entry sweep was not run for this increment.

Restart Light Table using `Launch-LightTable.bat` to load the updated backend. Leave **Run → Automatic live view** enabled, then create or open a configured Vite project. Allow the existing project-execution prompt to run a trusted project. The preview opens beside the code automatically; setup progress and failures stay visible there.
