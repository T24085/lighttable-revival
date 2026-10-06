# Light Table revival — experimental Windows testing

The Patch Vigilantes are reviving the original [Light Table](https://github.com/LightTable/LightTable) ClojureScript editor. This repository retains upstream source, history and MIT attribution. It is ongoing restoration work, with no supported stable release or clean-machine certification yet.

The current implementation includes project opening and creation, original editing and saving, source-versioned JavaScript evaluation, Node/npm workflows, browser previews and scoped live updates, local/external language REPLs, and a local Ollama coding assistant. Compatible live edits preserve selected running state; other changes explicitly restart the program. Arbitrary JavaScript side effects cannot be reliably detected or undone.

- [Build and try the editor](docs/revival/TESTING.md)
- [Assistant usage and Full Access limits](docs/revival/ASSISTANT.md)
- [Selectable preview reviewers and bounded correction](docs/revival/REVIEWERS.md)
- [Current experimental changelog](docs/revival/CHANGELOG.md)
- [Known limits](docs/revival/KNOWN-LIMITS.md)
- [Original feature comparison](docs/revival/LEGACY-PARITY.md)
- [Detailed implementation and evidence](REVIVAL.md)

Use disposable projects for initial testing. Node, npm, language runtimes and assistant commands execute with your account's permissions. The assistant can access explicitly named paths outside the project. Undo protects recorded source edits but cannot reverse arbitrary commands or external side effects.

The revived runtime currently pins Electron 44.5.1. Windows x64 is the tested environment. macOS/Linux packaging and hosted CI are not verified. Existing upstream developer documentation is historical and is not the installation guide for this revival.

## License and attribution

Original Light Table copyright and [MIT license](LICENSE.md) remain intact. See [third-party notices](docs/revival/third-party) for restored Paredit and ClojureScript components. This project is an independent experimental continuation, not an official upstream release.
