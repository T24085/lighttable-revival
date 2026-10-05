# Experimental Windows testing

This guide applies to experimental prerelease v0.9.0-revival.1. See [release verification](TEST-RESULTS.md) for exactly what passed; hosted CI and clean-machine certification remain pending.

For the Windows x64 distribution, extract the complete ZIP into an isolated writable folder, keep `source` and sibling `toolchain` together, and double-click the outer `Launch-LightTable.bat`. No installer or global setup is included. Respect normal OS security checks. Verify the ZIP against the release `SHA256SUMS.txt` before launch.

## Build from source

Use Windows x64 with Node 24+, npm, PowerShell 7+ and Java 24 available to your account. The preflight reports exact missing tools. Installation of these prerequisites is your own setup decision; the build does not install global tools or change security settings.

Clone this repository into an isolated writable directory, inspect `script/revival-preflight.ps1` and `script/revival-build.ps1`, then run from the repository root:

```powershell
pwsh -NoProfile -File script/revival-preflight.ps1 -ToolchainRoot ..\toolchain
pwsh -NoProfile -File script/revival-build.ps1 -ToolchainRoot ..\toolchain
```

The build uses an isolated sibling `toolchain` directory (also used by local Clojure/IPython discovery), SHA256-checked official Leiningen 2.11.2 artifacts, lockfile-based npm installs from the official npm registry with dependency lifecycle scripts disabled, and the inspected official Electron installer. It compiles the original ClojureScript application and REPL worker. Network access to the named official dependency sources is required. Do not bypass certificate checks or antivirus/OS security if an obsolete dependency fails.

Double-click `Launch-LightTable.bat`. From a terminal, it also accepts a project directory or file argument. The editor can open disposable projects through **File â†’ Open project** and create starters through **File â†’ New project**.

## First evaluation

Create or open a disposable JavaScript file containing `20 + 22`. Select that expression and press **Ctrl+Enter**, or choose **Run â†’ Run selection / line**. Verify the result is 42 and its displayed source/version corresponds to that expression. Change it to `21 + 22` and run again; the current result should be 43, while old output is marked stale. Arbitrary JavaScript does not automatically rerun as a safe pure calculation.

**Ctrl+Shift+Enter** runs the file. **Run â†’ Watch selection** creates an inline expression watch. **Run â†’ Stop** stops owned execution and pauses automatic live view. Native Node and npm commands require trust in the project; use the starter's dependency-free tests before trying arbitrary downloaded projects.

## Assistant

Ollama is optional and is not bundled or installed by this build. Start your existing local Ollama service, open **Assistant â†’ Chat**, refresh installed models and choose a model. No model is downloaded automatically. The default requested context is 65,536 tokens; Settings supports presets and custom values. Model capacity and speed vary.

The assistant has Full Access through your Windows account. Begin with a disposable project. Stop terminates assistant-owned commands, servers and previews; it does not stop a separately started Ollama service or your manually started programs. See [the assistant guide](ASSISTANT.md) before enabling project work.

## Verification and optional languages

```powershell
pwsh -NoProfile -File script/revival-assistant-test.ps1
pwsh -NoProfile -File script/revival-test.ps1
```

Run native fixtures serially because they share the test profile and quota broker. Assistant tests use a mock model by default; passing a model option runs separate real Ollama tests. Full regression is substantial and may require the optional language prerequisites described by preflight/setup. Python needs an existing Python 3.11+ interpreter. Clojure uses the Java/toolchain setup. IPython requires the pinned local client environment created by `script/revival-repl-setup.ps1`; external servers and connection files are supplied by the user, not bundled.

Runtime receipts and user profiles under `.revival` are local and excluded from publication. Do not attach raw logs, conversation journals, connection JSON files or personal project paths to public issues. Report the source commit, tool versions, reproduction and a redacted error instead.
