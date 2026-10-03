# Verified First Proof

Original source ancestor: 000cc9b308296461f4ca8f639e3acf74ae3a86eb.

- Original editor File Open, Chromium text-input edit and original Save passed.
- `(12 + 30)` -> 42; editor-buffer SHA256 `10e4f368f9b6ebdfe04b11e24c830ec71848d5558bff6f58a9cd4278c96ab926`.
- Saved buffer `(12 + 31)\n` -> 43; SHA256 `c5a5c6f0f730d6bbd80647cf5d88ef0995974a47597965fca2988aa27abe23ac`. Disk uses CRLF; the exact hash identifies the LF editor buffer, not raw disk bytes.
- 44 policy checks passed: arithmetic, syntax/finite-result limits, fs root bounds, unsupported operations, loop/async/Node/prototype/network rejection.
- 23 real-editor UI edge checks passed: delayed old run vs newer revision; edit during pending run; cancellation; rapid run/run; syntax/runtime errors and recovery; rejected loop/promise/timer/Node/fs/network/prototype forms and recovery; independent repeated numeric runs.
- Delay/race tests use test-only deferred transport around the real calculation API. User-supplied async JavaScript is not supported. The 50ms VM timeout is defense in depth; infinite-loop execution is never permitted by this grammar, and arbitrary-program cancellation is not claimed.
- Runtime preferences verified: nodeIntegration=false, contextIsolation=true, enableRemoteModule=false, webSecurity=true. `require` and Node process.versions unavailable in renderer. Default historical Electron renderer sandbox is false; no production-security claim.

Commands: `node test/revival/policy.cjs` and `./script/revival-test.ps1`. Tests produce ignored local evidence under `.revival`; raw runtime logs/user data are not uploaded to source control.