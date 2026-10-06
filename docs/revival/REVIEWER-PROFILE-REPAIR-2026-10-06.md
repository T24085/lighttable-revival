# Reviewer profile migration repair — 2026-10-06

`Invalid internal reviewer fixture root` was an application regression from the assistant-profile migration. Fixtures were created under the current Local AppData profile, but the preview validator still required the legacy `.revival/proof-user/assistant/reviewer-fixtures` path. Existing native tests kept the legacy test profile and missed the normal-profile mismatch.

The preview validator now resolves the fixture base through the same assistant-profile resolver as the writer. The main-process-only Symbol override and all fixture/resource containment checks remain enforced. A targeted test reproduced the exact reported error before the fix and passes afterward. It also checks that a renderer string field, a granted sibling directory and an entry from another fixture cannot bypass the boundary.

The native reviewer workflow now has a separate migrated-profile entrypoint. It uses the production Local AppData resolver with a disposable temporary base, actual native preview fixtures and simulated model decisions. The normal user's conversations, selections and qualification receipts are preserved. This verifies storage and workflow integration, not the accuracy of Tev1's real weights.

The first migrated native run passed qualification but paused during correction because the mobile preview produced only four frame samples over five seconds. Another correction attempt paused at the existing 20% timing-regression limit when background frame cadence changed between measurements. Both safeguards remain enforced. The collector now uses a scoped active-page condition for desktop and mobile measurements, including baseline and current evidence, and records that condition in the evidence. It releases the override after success, Stop or an error, without taking Windows focus. The protocol capability is documented in the [Chrome DevTools Emulation definitions](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl).

Restart Light Table with the root `Launch-LightTable.bat` to load the corrected validator. Reviewer validation remains optional. Resume a stopped task explicitly or retry Validate reviewer; no stopped conversation is replayed automatically.

Targeted verification passed:

| Check | Count | Receipt |
| --- | ---: | --- |
| Migrated fixture boundary | 5 | `.revival/reviewer-profile-unit-result.json` |
| Sampling restoration on success, Stop and errors | 4 | `.revival/reviewer-evidence-focus-result.json` |
| Reviewer controller | 32 | `.revival/reviewer-profile-controller-result.json` |
| Assistant controller | 57 | `.revival/reviewer-profile-assistant-result.json` |
| Preview files | 16 | `.revival/reviewer-profile-preview-files-result.json` |
| Native migrated-profile reviewer and Chat Send workflow | 11 | `.revival/reviewer-profile-native-result.json` |
| Existing native reviewer and automatic correction workflow | 10 | `.revival/reviewer-native-result.json` |

The migrated native run passed the 12 fixed validation cases, two uncertainty probes and three full measurement cycles. It selected both models through the chat dropdowns, made a journaled responsive edit, ran a real Node test and asserted counter interactions at both viewport sizes before completing review. It also checked settings Cancel/Save and development-server source binding. Cleanup removed the temporary profile and left no active assistant runs, commands, previews or quota helpers. Six changed JavaScript files and the PowerShell regression script passed syntax checks.

The existing native workflow also passed all ten checks, including an automatic correction with actual baseline/current browser measurements, a journaled mobile layout repair, a real Node test and interaction checks at both sizes. Its cleanup left no active runs, commands, previews or quota helpers. The source and receipt hashes for this repair are saved in `.revival/reviewer-profile-final-check.json`. Model replies were simulated in both native workflows; installed model weights were not qualified again.

The main regression script includes the migrated-profile boundary checks, sampling-restoration checks and a separate native workflow, increasing its serialized native workflows to 46. The complete 46-workflow sweep was not rerun for this repair.
