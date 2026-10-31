# Book import workflow and session recovery

These are persistent user instructions. Read `AGENTS.md` first. Direct inspection and manual judgment are primary; scripts support substantial bulk work and meaningful checks.

## Resume after a lost session

1. Read `memory/book_import_handoff.json`. Open its authoritative checkpoint and only the evidence relevant to the next unfinished action.
2. Confirm the current worktree, current book, source hash, completed outputs and any worker handle. Newer verified checkpoint evidence overrides stale memory or the old goal description. Do not restart from the book ID embedded in an old goal.
3. Reuse successful source extraction, OCR, saved reviews, assets, installations and tests. A compact saved visual-review record is sufficient to continue already completed reading; do not reread whole scans because the conversation was lost.
4. If a worker was running, poll that same handle or inspect its actual process/output. An observation timeout does not prove it stopped. Never launch a duplicate merely because a conversation ended.
5. Continue the next unfinished action. Keep the handoff short and current, with evidence paths, work that must not repeat and genuine unresolved questions. Save it before switching tasks or ending a turn with unfinished work. Keep the standing-rule pointer at the top of memory.

Do not load the enormous historical memory files wholesale. Search history only for a specific missing fact. If the small handoff is missing, recover the current book from the pending manifest and newer per-book checkpoints, not from old prose summaries.

## Source and reader fidelity

- Work sequentially in ascending book ID. Check anthology boundaries first; source attachments belonging to individual stories belong to the child books.
- Check printed continuity and completeness before spending time repairing prose. Native text first; use one OCR pass when needed. Personally inspect the original source and compare the full reader, including otherwise unreachable passages.
- Preserve complete prose, original paragraphs, typography, dialogue, verse, lists, tables, navigation, endings, front/back matter, maps and record sheets. Do not silently omit awkward material.
- Preserve genuine print errors and uncertain original wording. They are nonblocking. Correct OCR against the source; never invent dialogue, rules, statistics or routes.
- Make small corrections directly. Do not repeatedly tune general-purpose helpers for minor gains. Reuse proven bulk tools, run them once and inspect their outputs.
- Preserve native protected PNG artwork with original pixel dimensions, aspect, labels, borders, handwriting and disconnected details. No resizing, quantization, transparency masking or recreated art. Maximum 256 KiB per file; if necessary, use adjoining native-pixel segments that reconstruct the whole illustration. Retain repeated source positions. Protected assets belong in the book's reading-image directory, not database blobs or public bypass routes.
- Full original-source and full actual-reader reviews precede the final simulator assessment. Review desktop and mobile rendering, links, matter, artwork and entry behavior. Skip expensive browser image-decode checks as instructed by the user.

## Simulators, installation and completion

- Simulators are optional encounter combat tools. Never automate campaign travel, story choices, inventory, keys or character progression. Follow `public/js/battlesim/AGENTS.md`; keep roster, encounter and chart data in the database. Never recreate the removed app data folder or duplicate catalogs.
- Preserve existing player, library, run, fight, character and unlock data; unrelated books and database state; nonmissing metadata and covers. Stage and verify book changes before guarded production installation. Do not overwrite populated metadata merely for consistency.
- Perform appropriate checks once: source coverage and fidelity, native assets, navigation and layouts, simulator applicability and any actual combat rules, desktop/mobile browser, live API/access controls, database preservation and update notifications. Recheck only affected material after a concrete change or failure.
- Tick each book checkbox only when its corresponding requirement actually passes. A staged draft, green helper or saved checkpoint is not a completed import.
- Announce only genuinely new simulators with short, lively, book-specific text. Follow the latest saved Sofia-day version rules and current version evidence; synchronize VERSION/admin and append today's announcement or create one. Book-only reading work does not require a release announcement or version bump.
- Commit and push completed repository work with short messages omitting the word `imports`. Do not commit duplicate book audits or catalogs. Do not make empty commits for database-only books.
- The user has authorized necessary graceful restarts of only port 3000. Preserve its environment and verify other servers remain unchanged. Never restart unrelated servers.
- Only after genuinely verified completion and successful live notification may an audit be marked fixed. Then delete the completed working/fixed audit logs under the user's standing cleanup rule. Retain external source and verification evidence.
- A genuinely blocked import gets an `_error.md` audit and the batch continues with the next book. Original print defects are not blockers. Ask only for a critical issue that cannot be resolved from available sources.
- Keep the whole-batch goal active until all requested books are genuinely complete. Do not call a partial book or checkpoint complete.

## Resources

- Root agent only; no sub-agents.
- All scratch inputs and audit evidence: `/media/koldKat/MediaDrive/.tmp`.
- Current batch evidence: `/media/koldKat/MediaDrive/.tmp/reading-imports-2026-10-11`.
- Pending manifest: `/home/koldKat/Downloads/_audits/pending-imports-manifest.json`.
- One heavy worker at a time, nice 15; Python address-space limit 2 GiB, Node heap 1 GiB, actual RAM at most 3 to 3.5 GiB.
- Node: `/home/koldKat/.config/nvm/versions/node/v22.23.1/bin/node`.
- Current project rules and explicit user instructions override older memory. Never author em dashes; preserve original book punctuation.
