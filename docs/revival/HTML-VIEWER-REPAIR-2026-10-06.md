# HTML viewer repair — 2026-10-06

The normal chat checkpoint reported `Start a live preview before reviewing`. Its saved HTML entry is `my-project/golf-course-website/index.html`, while the project opens at `my-project`. Automatic discovery previously required a root HTML entry or an already-open source editor. Separately, the HTML compiler tried to resolve the page's HTTPS Tailwind CDN script as a local project file and rejected it. The reviewer UI also injected a model selector, Review and Improve buttons into both viewers and moved their content down by 76 pixels.

Both viewer panes now have only the existing Run button. Reviewer selection remains in the task composer and Assistant Settings. Automatic preview discovers a unique nested `index.html` or `index.htm` from Welcome, without requiring the coding model to call a preview tool. A selected HTML editor still takes precedence for plain HTML projects. Discovery is bounded, skips dependency/build/hidden folders and links, and does not choose arbitrarily between multiple sites. Existing Vite detection and server ownership remain in place. Review can ensure an enabled automatic preview has started before collecting evidence; a paused or disabled automatic preview stays paused or disabled.

HTTPS scripts, stylesheets, fonts and images now load as browser assets. The local compiler leaves HTTPS script tags intact. External asset requests allow GET/HEAD for those resource types, using the [Electron WebRequest resource classifications](https://www.electronjs.org/docs/latest/api/web-request). Network asset loading has a bounded 15-second allowance; synchronous authored JavaScript still uses its existing 1.5-second evaluation timeout. External fetches, frames, objects, workers and window creation remain blocked; Node and the editor bridge remain unavailable in the sandboxed preview. Local source containment and the Windows process-family memory quota remain enforced. Tailwind's browser setup is described in its [Play CDN documentation](https://tailwindcss.com/docs/installation/play-cdn).

Targeted checks passed:

| Check | Count | Receipt |
| --- | ---: | --- |
| HTML discovery, compiler routing and asset policy | 9 | `.revival/html-viewer-unit-result.json` |
| Project operations | 28 | `.revival/viewer-projects-result.json` |
| Assistant controller | 65 | `.revival/viewer-assistant-unit-result.json` |
| Reviewer controller | 32 | `.revival/viewer-reviewer-unit-result.json` |
| Native HTML auto-preview, one-button panes, Run and evidence startup | 5 | `.revival/html-viewer-native-result.json` |
| Native reviewer UI and independent model selection | 10 | `.revival/reviewer-ui-result.json` |
| Native Run, unsaved updates, Stop and server reuse | 6 | `.revival/quick-run-native-result.json` |
| Native browser resource and execution boundaries | 23 | `.revival/preview-result.json` |
| Native automatic Vite and Tailwind workflow | 15 | `.revival/auto-vite-result.json` |
| Native migrated-profile reviewer and reviewed Chat Send | 11 | `.revival/reviewer-profile-native-result.json` |

The native viewer tests use actual Electron views at 125% display scaling, assert that the native surface matches the visible pane's position and dimensions, and exercise a real button interaction and reset through Run. Both panes start their content directly below the single header. The default regression fixture loads real Tailwind CDN styles, checks the rendered heading color and viewport-height section, and captures actual preview pixels. The Vite run installed the starter dependencies, checked its React interaction and compiled Tailwind styles, and verified reload, pause, failed-start retry and project switching.

An unchanged copy of the user's actual HTML passed the same five native viewer checks. Its rendered page title, heading, Tailwind-generated color and viewport-height hero were asserted, and its native bounds matched the pane at 125% display scaling. The source hash was checked again after cleanup. The receipt is `.revival/html-viewer-user-copy-result.json`; the actual browser pixels are `.revival/html-viewer-user-copy.png`. The migrated-profile reviewed Chat Send also passed after removing the viewer toolbar. Native reviewer model replies were simulated, so these tests do not qualify installed decision-model weights. Twelve changed JavaScript files and the PowerShell regression script passed syntax checks.

The user's HTML has four external photo URLs that returned HTTP 404 on independent HEAD requests. The styled page can render, but those URLs cannot supply photos. Status observations are saved in `.revival/html-viewer-assets-result.json`. The user's source and stopped chat are preserved; this repair does not rewrite the website or resume its coding model. Source and receipt hashes for the completed targeted checks are saved in `.revival/html-viewer-final-check.json`.

Restart Light Table with the root `Launch-LightTable.bat` to load the changed renderer and preview modules. The restored project can open its nested HTML viewer automatically. The main regression script now includes the viewer unit checks and native entrypoint, for 47 serialized native workflows. The complete 47-workflow sweep was not rerun for this repair.
