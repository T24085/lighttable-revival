# Failed HTML write recovery — 2026-10-06

The saved normal-profile chat attempted `write_file` for Nubs and Clubs at 5:52 PM Central with `content` but no `path`. The tool rejected it with `Missing path`. At 5:59 PM the coding model printed complete HTML and claimed creation without another successful file write. Automatic review then paused with `Start a live preview before reviewing`.

The complete HTML block from the last assistant answer was recovered verbatim, with one trailing newline, into `C:/Users/edchr/OneDrive/Desktop/Taylor/my-project/golf-course-website/index.html`. The recovery created a new file without overwriting an existing file. The saved chat and normal assistant settings were not edited or replayed.

The assistant controller now keeps unresolved file-action failures in the conversation checkpoint. A prose answer or pasted code cannot complete the run or enter automatic review while those failures remain. It requests a corrective file-tool action and pauses after three unresolved completion attempts. Successful unrelated writes, reads or commands cannot clear a failure with a known target. Pending failures survive Resume, restart, follow-up messages and context compaction. A new conversation remains independent. Unverified prose and stream chunks are withheld while file changes remain unresolved.

When automatic review lacks a live preview, the controller returns to coding with instructions to start and inspect the saved site. This also works when resuming an older missing-preview checkpoint. Two recovery requests are allowed before a clear pause; other review errors still pause normally. No filename is invented for malformed tool calls, and existing read-before-write and stale-file protections remain enforced.

Validation: 65 assistant controller checks and 32 reviewer checks passed. Eight new assistant regression cases cover corrective saves, bounded false-completion attempts, unrelated progress, restart/Resume, follow-up isolation, the write-to-preview-to-review flow, ignored preview recovery and older paused checkpoints. Tests use actual temporary file saves and journals, with simulated model responses and preview evidence. Ten structural checks passed for the recovered HTML. Native browser rendering, real Gemma/Tev1 inference and the full regression sweep were not run in this side conversation.

Evidence: `.revival/html-recovery-result.json`, `.revival/html-recovery-structure-result.json`, `.revival/file-completion-assistant-result.json`, `.revival/file-completion-reviewer-result.json` and `.revival/file-completion-final-check.json`.

Restart Light Table to load the changed main-process controller. The recovered HTML can be opened directly from its project folder. The user's paused task remains paused until explicitly resumed.
