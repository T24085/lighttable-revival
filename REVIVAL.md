# Light Table Revival — Experimental First Proof

A Patch Vigilantes restoration, **not a supported release**. [The original Light Table](https://github.com/LightTable/LightTable) remains the foundation; its ClojureScript, MIT license, attribution and complete ancestor history are retained.

## Verified

Official develop ancestor: `000cc9b308296461f4ca8f639e3acf74ae3a86eb` (declares 0.9.0). Original CLJS compiled on Windows with existing Java 24, Node 24.15.0 and project-local Leiningen 2.11.2. Electron is now pinned to supported stable 44.5.1, verified from the official release and registry; Chromium 152.0.7977.130. Original CLJS remains intact.

The original File Open and Save commands work for the isolated proof file. The original CodeMirror editor accepted an edit through Chromium text input. The accompanying bounded calculation panel evaluated `(12 + 30)` to **42**, then `(12 + 31)` to **43** in fresh contexts. A changed buffer makes previous output stale immediately. Every output contains the exact editor-buffer SHA-256; Save normalizes the editor to LF with a trailing newline and writes CRLF on Windows.

Renderer Node integration is off; renderer sandboxing, context isolation and web security are on; actual Electron remote is unavailable. Permissions, navigation and new windows are denied. Privileged operations pass through a narrow preload/IPC bridge. Reads are restricted to bundled assets and `.revival` proof folders; writes are restricted to proof user data/files. Traversal, links, unrecognized operations and oversized writes are rejected. Network requests are blocked, and legacy shell/background worker/server capabilities are unavailable.

## Run or Reproduce

Requires existing Java, Node/npm and PowerShell; no global install, administrator access, PATH edit or TLS/security bypass. Inspect the build script before running. It obtains official pinned Leiningen with recorded SHA-256, uses project-local caches, runs locked npm installs with lifecycle scripts disabled, runs only the inspected official Electron installer, then compiles the original CLJS. Historical build scripts are preserved for attribution, not used for this proof.

```powershell
.\script\revival-build.ps1
.\script\revival-test.ps1
.\deploy\electron\node_modules\electron\dist\electron.exe .\deploy\core
```

Tests exercise the real proof buttons and editor input, disk Save, stale-output transition, fresh calculations and renderer security preferences. The test resets only `.revival/proof-files/calculation.js`. Runtime data, logs, screenshots and caches stay in ignored `.revival`. 44 focused policy checks and 23 editor UI edge checks pass; full editor integration passes. This is bounded integration testing, not comprehensive editor QA.

## Experimental Limits

- One isolated proof file. The panel supports numeric arithmetic separately from disposable full JavaScript execution, including awaited promises and bounded one-shot timers. It is new integration around the original editor; the old JS plugin ecosystem is not restored.
- No automatic rerun or general side-effect detection. Cancel destroys the active JavaScript context and invalidates pending UI output. Numeric arithmetic retains its explicit 256-character grammar and 50 ms Node VM timeout; that VM is not the boundary for full JavaScript.
- Native popup/application menus, clipboard, filesystem watching, shell workflows, arbitrary file dialogs, background tasks and language connections are incomplete. Dialog compatibility currently selects only the proof file.
- Electron 44.5.1 is supported, but this experimental restoration is not a production sandbox or complete dependency modernization. Legacy CSP/eval patterns remain in the trusted local editor, which has network requests blocked. Remote API compatibility uses a browser capability facade, not Electron remote.
- Three required CodeMirror addons are vendored from official master and retain their original notices. The default old sample User compiled plugin is omitted; no third-party fork software is executed.
- No public release, download recommendation, auto-update service or upstream contribution has been made.

See [historical backlog](docs/revival/BACKLOG.md). Every historical report stays unverified until reproduced; none is promised fixable.

## Attribution

Original Light Table contributors, Kodowa and Cognitect: see retained [README](README.md) and [MIT license](LICENSE.md). CodeMirror: [upstream](https://github.com/codemirror/codemirror5), with original MIT notices in vendored addon files. Electron and npm distributions preserve their included licenses when packaged. Workshop changes retain the repository's original MIT terms.
## JavaScript execution checkpoint

The experimental Run JavaScript button evaluates synchronous statements, variables, functions, arrays and objects using a new sandboxed Chromium renderer and dedicated worker for every run. It does not use Node vm for this language mode. Renderer Node integration, legacy remote, preload and host IPC are absent. The worker has no DOM; networking is blocked by CSP and session request denial. Navigation and new windows are denied. Promises are awaited. One-shot timers accept only function callbacks and delays from 0 to 500 ms, with 32 live handles and 128 total timers per run. Intervals, imports and nested worker constructors are unavailable. Top-level await requires an async function wrapper. There is no automatic rerun.

Each response carries the main-process source snapshot and SHA-256. Editing makes prior output stale; superseding or cancelling a run destroys its context. State does not carry to the next run. This does not update other running application state.

Limits: 16 KiB source/output, a 5000 ms startup deadline and 1500 ms execution watchdog, and a 192 MiB observed renderer working-set guard sampled every 20 ms. The memory guard is reactive, not a Windows Job Object hard quota; transient overshoot and native allocations remain possible. Chromium process sandboxing is the capability boundary, not deletion of JavaScript properties. The supported runtime does not make this a production sandbox or approval to execute hostile third-party code.

### Findings and evidence

Original startup failed because legacy renderer Node/global assumptions no longer worked with the restricted renderer. A narrow explicit bridge and browser compatibility facade restore the bounded editor workflow. The facade absolute-path resolver initially duplicated an absolute path; corrected. Missing CodeMirror addons were restored byte-for-byte from official upstream master. The legacy sample User plugin references an unavailable crate; its sample loading behavior is omitted, not claimed repaired.

44 policy checks and 23 actual UI edge checks cover numeric grammar, path restrictions, stale versions, reordered responses, cancel guards and recovery. UI delays are test transports, not proof that arbitrary asynchronous user programs work. A save comparison initially failed because the original editor adds a final newline and writes CRLF; the assertion now compares canonical newlines, with disk bytes reported separately.

The language integration additionally verifies variables/functions/objects/arrays, fresh globals, absent Node/network/DOM/worker capabilities, actual infinite-loop termination, Promise results, syntax/runtime error recovery, genuine active cancellation, superseded execution destruction, and original-editor version-linked output 43. The live socket server and background plugin worker remain disabled; historical GitHub issue numbers in BACKLOG are unverified unless explicitly reproduced.

## Supported runtime and bounded async checkpoint

Electron 44.5.1 from https://github.com/electron/electron/releases/tag/v44.5.1 is pinned in the local package and lockfile. All registry URLs were inspected; lifecycle scripts stayed disabled until the official installer and its downloader/extractor were reviewed. The downloaded Windows x64 archive matches official SHA-256 `9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db`. No global install, TLS bypass, administrator install, renderer Node, experimental V8 flag or legacy remote was enabled.

Actual regression: original open/edit/save and numeric proof pass; 44 policy checks, 23 UI edge checks, 15 current language checks and 31 async/resource checks pass. Async checks include promises/timer result 43, unresolved promises, CPU loops in microtasks, rejection/timer-error recovery, bounded delays/counts, prototype mutation resistance, oversized source/output, real stale-buffer completion, cancellation and superseding. A 240 MiB allocation is terminated by the observed working-set guard, followed by a successful recovery run. This verifies reactive termination, not prevention of transient memory overshoot. Final cleanup reports zero active jobs and one original editor window.

The first modern-runtime harness exposed changed preference reporting and a catch block that could retain an earlier pass flag. The harness now watches the first editor window explicitly and every exception fails integration. Modern hidden-window startup also needed its own bounded deadline and disabled background throttling; execution remains separately bounded. No security preference was relaxed.

Current evidence is `.revival/evaluation-result.json` and `.revival/async-43.png` (ignored runtime artifacts). Packaging/download work is paused at Taylor's request; earlier experimental artifacts are retained, and no new public release exists.