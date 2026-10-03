# Light Table Revival — Experimental First Proof

A Patch Vigilantes restoration, **not a supported release**. [The original Light Table](https://github.com/LightTable/LightTable) remains the foundation; its ClojureScript, MIT license, attribution and complete ancestor history are retained.

## Verified

Official develop ancestor: `000cc9b308296461f4ca8f639e3acf74ae3a86eb` (declares 0.9.0). Original CLJS compiled on Windows with existing Java 24, Node 24.15.0 and project-local Leiningen 2.11.2. Electron remains pinned to 13.1.2 for this historical proof.

The original File Open and Save commands work for the isolated proof file. The original CodeMirror editor accepted an edit through Chromium text input. The accompanying bounded calculation panel evaluated `(12 + 30)` to **42**, then `(12 + 31)` to **43** in fresh contexts. A changed buffer makes previous output stale immediately. Every output contains the exact editor-buffer SHA-256; Save normalizes the editor to LF with a trailing newline and writes CRLF on Windows.

Renderer Node integration is off; context isolation and web security are on; actual Electron remote is off. Privileged operations pass through a narrow preload/IPC bridge. Reads are restricted to bundled assets and `.revival` proof folders; writes are restricted to proof user data/files. Traversal, links, unrecognized operations and oversized writes are rejected. Network requests are blocked, and legacy shell/background worker/server capabilities are unavailable.

## Run or Reproduce

Requires existing Java, Node/npm and PowerShell; no global install, administrator access, PATH edit or TLS/security bypass. Inspect the build script before running. It obtains official pinned Leiningen with recorded SHA-256, uses project-local caches, runs locked npm installs with lifecycle scripts disabled, runs only the inspected official Electron installer, then compiles the original CLJS. Historical build scripts are preserved for attribution, not used for this proof.

```powershell
.\script\revival-build.ps1
.\script\revival-test.ps1
.\deploy\electron\node_modules\electron\dist\electron.exe .\deploy\core
```

Tests exercise the real proof buttons and editor input, disk Save, stale-output transition, fresh calculations and renderer security preferences. The test resets only `.revival/proof-files/calculation.js`. Runtime data, logs, screenshots and caches stay in ignored `.revival`. 44 focused policy checks and 23 editor UI edge checks pass; full editor integration passes. This is bounded integration testing, not comprehensive editor QA.

## Experimental Limits

- One proof file and numeric arithmetic, not arbitrary JavaScript or a restored language-plugin ecosystem. The panel is new integration around the original editor, not a claim that the old JS plugin is restored.
- No auto-rerun; explicit calculation only. Run/revision guards prevent slow test results from replacing newer output; Cancel invalidates pending output, not an arbitrary running program. The allowlist excludes calls, properties, assignments, identifiers, comments and exponentiation. The Node VM is not a general JavaScript security boundary. The numeric grammar is the supported boundary; globals/prototypes/async constructs are rejected, not supported. VM contexts are disposable; accepted arithmetic is at most 256 characters with a 50ms timeout. This restriction, not general side-effect detection, provides the evaluation boundary.
- Native popup/application menus, clipboard, filesystem watching, shell workflows, arbitrary file dialogs, background tasks and language connections are incomplete. Dialog compatibility currently selects only the proof file.
- Electron 13 is obsolete. Legacy CSP/eval patterns remain inside the original trusted local editor; no claim of production security. Remote API migration uses a browser capability facade, not the legacy remote module. Full dependency/runtime modernization is separate work.
- Three required CodeMirror addons are vendored from official master and retain their original notices. The default old sample User compiled plugin is omitted; no third-party fork software is executed.
- No public release, download recommendation, auto-update service or upstream contribution has been made.

See [historical backlog](docs/revival/BACKLOG.md). Every historical report stays unverified until reproduced; none is promised fixable.

## Attribution

Original Light Table contributors, Kodowa and Cognitect: see retained [README](README.md) and [MIT license](LICENSE.md). CodeMirror: [upstream](https://github.com/codemirror/codemirror5), with original MIT notices in vendored addon files. Electron and npm distributions preserve their included licenses when packaged. Workshop changes retain the repository's original MIT terms.
## JavaScript execution checkpoint

The experimental Run JavaScript button evaluates synchronous statements, variables, functions, arrays and objects using a new sandboxed Chromium renderer and dedicated worker for every run. It does not use Node vm for this language mode. Renderer Node integration, legacy remote, preload and host IPC are absent. The worker has no DOM; networking is blocked by CSP and session request denial. Navigation and new windows are denied. Async results are explicitly unsupported; timers, imports and nested worker constructors are unavailable. There is no automatic rerun.

Each response carries the main-process source snapshot and SHA-256. Editing makes prior output stale; superseding or cancelling a run destroys its context. State does not carry to the next run. This does not update other running application state.

Limits: 16 KiB source/output, a 750 ms whole-job watchdog, and a 192 MiB observed renderer working-set guard sampled every 20 ms. The memory guard is reactive, not a Windows Job Object hard quota; transient overshoot and native allocations remain possible. Chromium process sandboxing is the capability boundary, not deletion of JavaScript properties. Electron 13 is obsolete and this is not a production sandbox or approval to execute hostile third-party code.

### Findings and evidence

Original startup failed because legacy renderer Node/global assumptions no longer worked with the restricted renderer. A narrow explicit bridge and browser compatibility facade restore the bounded editor workflow. The facade absolute-path resolver initially duplicated an absolute path; corrected. Missing CodeMirror addons were restored byte-for-byte from official upstream master. The legacy sample User plugin references an unavailable crate; its sample loading behavior is omitted, not claimed repaired.

44 policy checks and 23 actual UI edge checks cover numeric grammar, path restrictions, stale versions, reordered responses, cancel guards and recovery. UI delays are test transports, not proof that arbitrary asynchronous user programs work. A save comparison initially failed because the original editor adds a final newline and writes CRLF; the assertion now compares canonical newlines, with disk bytes reported separately.

The language integration additionally verifies variables/functions/objects/arrays, fresh globals, absent Node/network/DOM/worker capabilities, actual infinite-loop termination, unsupported Promise results, syntax/runtime error recovery, genuine active cancellation, superseded execution destruction, and original-editor version-linked output 43. The live socket server and background plugin worker remain disabled; historical GitHub issue numbers in BACKLOG are unverified unless explicitly reproduced.
