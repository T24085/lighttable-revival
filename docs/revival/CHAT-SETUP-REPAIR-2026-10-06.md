# Chat setup repair and Vite/Tailwind support — 2026-10-06

The stopped golf-project chat exposed setup failures that the earlier plain JavaScript model test did not cover. Light Table now supplies a configured Vite + React + TypeScript + Tailwind starter, detects misleading setup results, and prevents empty model replies from completing a task. The actual Gemma4 workflow now passes installation, production build, native preview, and desktop/mobile interactions.

## Findings from the saved chat

- Eleven Vite scaffolding attempts returned `Operation cancelled` because the target folder already contained files. The CLI exited with code 0, which Light Table incorrectly treated as successful setup. No React/Vite entry files or scripts had been created.
- The installed Tailwind version was 4.3.3. The model repeatedly attempted the old `npx tailwindcss init` workflow, which failed because that executable is no longer supplied by the v4 package.
- Bash `touch` failed in PowerShell. Precreating blank files then triggered the intentional read-before-write guard, adding further failed tool calls.
- Automatic review was attempted without a live preview. In a separate reproduction, Gemma4 returned an empty reply and the app incorrectly completed the task before starting its preview.

The original chat remains stopped, and its partial project files were preserved. These tests used disposable projects and did not resume or rewrite that project.

## Changes

File → New project now offers **Vite + React + Tailwind**, alongside JavaScript and Empty project. The assistant can request the same source with `create_project` and `template: "vite-react-tailwind"`. The starter has React 19.2.8, Vite 8.3.0, TypeScript 6.0.2 and Tailwind 4.3.3, including `@tailwindcss/vite`, the CSS import, and type-check/build/dev scripts. Each assistant-created source file is journaled. Dependencies are installed separately with `npm install`.

Command handling rejects interactive Vite scaffolding before starting it and reports actual cancelled scaffolding as failed even at exit code 0. Existing files are preserved. Recovery instructions explain the installed Tailwind v4 configuration and Windows shell behavior. Equivalent setup errors count together despite changed flags, preventing endless retries. PowerShell and native-command failures stop a batch before a later successful command can mask the failure, while retaining the native exit code.

The model receives setup instructions to inspect existing files, use file tools directly, verify scaffold output, and build/open a preview before claiming success. A reply with neither content nor tool calls is retried twice; a third pauses with a clear reason. Actual tools and ordinary text answers remain unaffected.

## Validation on the final implementation

| Validation | Passed | Coverage |
| --- | --- | --- |
| Assistant controller | 57 | Setup diagnostics, cancelled exit-zero results, repeated failures, journaled starter files, stale edits, empty reply recovery/pause, existing lifecycle checks |
| Project controller | 28 | Existing project creation, opening, validation and file protections |
| Reviewer controller | 32 | Existing independent reviewer selection and temporary Clef exclusion |
| Existing native assistant | 27 | Actual editor, saves, Undo, commands, Stop, settings, previews and cleanup; simulated inference |
| Native Vite/Tailwind | 13 | Original New project dialog, actual install/build, cancellation and shell failure reproduction, compiled styles and React interactions at both sizes, journaled Vite live update, edited rebuild |
| Real Gemma4 12B Vite workflow | 6 | Real Ollama discovery and tool calls, configured project creation, dependency installation and production build, actual native preview, desktop/mobile checks, captured pixels |

The first real-model run exposed an empty-response completion bug; the final rerun passed after the fix. Native fixtures and the real-model workflow were serialized. Cleanup receipts report zero owned commands, editor requests, previews, quota jobs and pending work, with no helper process, restored test project state and removed disposable projects.

Receipts are in `.revival/assistant-unit-result.json`, `project-unit-result.json`, `reviewer-unit-result.json`, `assistant-native-result.json`, `vite-tailwind-result.json` and `assistant-ollama-vite-result.json`. Captures are `.revival/vite-tailwind.png` and `.revival/assistant-ollama-vite.png`. The native starter fixture is included in the main test script, which now runs 44 native entrypoints. The earlier 43-entry full sweep predates this increment; all 44 entrypoints were not rerun for this follow-up. These checks establish the tested starter and workflows, not arbitrary model-generated websites or every npm dependency combination.

## Use and rerun

Restart Light Table with the root `Launch-LightTable.bat` to load the updated backend. Choose **File → New project → Vite + React + Tailwind**, install dependencies, run the `build` npm script, then start the `dev` development-server script and open its preview. Save source changes for Vite live updates.

```powershell
pwsh -NoProfile -File script/revival-assistant-test.ps1
pwsh -NoProfile -File script/revival-assistant-test.ps1 -OllamaViteModel "gemma4:12b"
```

Setup references: [Vite non-interactive scaffolding](https://vite.dev/guide/), [Tailwind's Vite installation](https://tailwindcss.com/docs/installation/using-vite), and [Tailwind v4 CLI changes](https://tailwindcss.com/docs/upgrade-guide).
