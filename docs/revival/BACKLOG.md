# Light Table possible-fixes backlog

Related: [[CHECKPOINT]]. Historical reports are investigation leads; every item is UNVERIFIED until reproduced on the retained official source and current local environment. Open upstream status does not establish current applicability or fixability.

Priority: launch, file open/edit/save, version-linked JavaScript evaluation; UI polish follows the first proof.

| Priority | Report | Status | Reproduction / evidence needed |
| --- | --- | --- | --- |
| P0 | [Startup #2518](https://github.com/LightTable/LightTable/issues/2518) — Ide not starting | Unverified | Record OS/runtime/revision, startup log and first visible window. |
| P0 | [Language connection #2523](https://github.com/LightTable/LightTable/issues/2523) | Unverified | Distinguish plugin/runtime errors from connection failures; no existing ports/services changed. |
| P0 | [Language connection #2487](https://github.com/LightTable/LightTable/issues/2487) — We couldn't connect | Unverified | Reproduce with isolated evaluation context and exact plugin tag. |
| P1 | [Missing menus #2529](https://github.com/LightTable/LightTable/issues/2529) | Unverified | Screenshot menus and record platform differences. |
| P1 | [Blank welcome #2525](https://github.com/LightTable/LightTable/issues/2525) | Unverified | Inspect renderer loading errors after successful compilation. |
| P2 | [Auto Tab #2517](https://github.com/LightTable/LightTable/issues/2517) | Unverified | Minimal input file, settings and keystrokes. |
| P2 | [Multiple cursor #2427](https://github.com/LightTable/LightTable/issues/2427) | Unverified | Minimal cursor operation sequence and expected result. |
| P2 | [CI #2528](https://github.com/LightTable/LightTable/issues/2528) | Unverified | Compare historical CI assumptions with a reproducible local build; no public CI execution now. |
| Review before affected runtime use | [normalize-url #2519 / CVE-2021-33502](https://github.com/LightTable/LightTable/issues/2519) | Unverified dependency applicability | Identify exact locked dependency path/version and consult authoritative advisory; no security bypass or unsupported claim that installed code is affected. |

## Separate modernization track

Official develop pins Electron 13.1.2; master and develop have different dependency generations. Inventory lockfiles, advisories, renderer Node integration, Electron APIs, socket.io and plugins before choosing upgrades. Preserve original ClojureScript. Modernization is outside first-proof scope, and fork upgrades are not validated remedies. No blanket promise of full restoration or public release.

Issue titles/states verified read-only via official GitHub API on 2026-10-03; all listed reports were open. The security advisory itself has not yet been assessed.

## Reproduced revival blocker
Official develop now compiles; pinned Electron13 launch reaches splash but renderer bootstrap fails with global undefined because Node integration is disabled. This is reproduced local compatibility evidence, not confirmation of any historical issue above. Prefer preload/IPC migration; security-relaxing compatibility settings require explicit approval.
