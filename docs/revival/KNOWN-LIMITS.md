# Known limits for experimental testing

- Windows x64 is the tested platform. Clean Windows installation, hosted CI, signing, macOS/Linux packaging and broad third-party project compatibility remain unverified.
- Live updates preserve only supported classic function/constants, CSS and compatible markup state. Initialization, module and other incompatible edits explicitly restart. Arbitrary edits cannot update all running state.
- Isolated JavaScript evaluation uses disposable contexts. Native Node, npm, Python, JVM runtimes and assistant commands execute trusted code with account permissions; memory quotas do not make them a general security sandbox.
- The assistant's Full Access is not confined by editor file grants. It has no universal per-tool approval/diff workflow. Undo cannot reverse arbitrary shell commands, network actions or external side effects. Stop only owns work it started.
- Local Ollama inference is requested through loopback HTTP. Commands and user programs may use external networks; a local service endpoint is not a promise that every model/workflow is offline. Model downloads and Ollama are user-managed. `ornith-1.5:9b` passed earlier local web/Python workflows. Although an earlier Gemma 4 12B run failed in the Ollama runner, the current `gemma4:12b` create/edit/test/preview workflow and desktop/mobile button checks pass; see [the current run](RUN-TEST-2026-10-06.md). General model reliability is not established.
- On the tested Windows Ollama 0.35.1 installation, `tev1:latest` answered a live decision request successfully, while `clef-flash:latest` failed with `Clef: non-finite logit`. This matches [Ollama issue 18769](https://github.com/ollama/ollama/issues/18769). Clef support is temporarily removed from the app, including model selectors, stored selections and direct requests.
- Current local process-family quotas are 1 GiB; Clojure uses a 1 GiB heap within a 2 GiB family limit. External REPLs and Ollama manage their own memory. Ordinary language evaluations and live sessions have finite deadlines.
- TypeScript transforms do not provide semantic type checking or declarations. Inline HTML scripts, native add-ons/workspaces and broader import/browser edge cases retain gaps listed in [BACKLOG.md](BACKLOG.md).
- External IPython image results and language watches remain pending. Windows external kernel work can continue after a client disconnect; interrupt it through the kernel host when necessary.
- No inline AI autocomplete, MCP integration or cooperating model agents are claimed.

Use disposable projects and retain independent backups of valuable work. Respect normal OS security checks for any unsigned build; no security bypass is part of this setup.
