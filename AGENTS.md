# Standing book import rules

These are the user's standing instructions for book imports and audits. Apply them across sessions, alongside `CLAUDE.md` and the current book checkpoint.

For recovery, read [BOOK_IMPORTS.md](BOOK_IMPORTS.md), then `memory/book_import_handoff.json` and the checkpoint it names. These small files come before historical memory.

- **Manual review comes first.** Personally inspect the original source and the actual rendered reader. Make prose, paragraph, typography and artwork-boundary decisions directly from what you see.
- Use scripts for substantial batch work: one-time extraction/OCR, bulk asset encoding, saving already reviewed edits and meaningful integrity checks. Reuse working tools. Do not build or repeatedly tweak helpers for small tasks or marginal gains. When helper work stalls actual book progress, switch to direct inspection and manual correction.
- Do not repeat successful extraction, OCR, source reviews, writes or checks. Recheck only the affected material when a concrete discrepancy needs resolving. Poll an existing live worker rather than starting another.
- Preserve original print errors and quirks. They are not import blockers. Correct OCR errors only against the original; do not invent repairs.
- Keep all required fidelity checks. Review the full source and full reader before the final simulator assessment. Simulators are optional combat tools, never story automation; follow `public/js/battlesim/AGENTS.md` when applicable.
- Preserve native artwork, labels, borders and disconnected details. Protected PNGs must retain native pixels and dimensions and stay within 256 KiB per file. Do not use expensive browser image-decode checks.
- Work sequentially in ascending book ID. Root agent only, no sub-agents. Scratch files belong only in `/media/koldKat/MediaDrive/.tmp`. Use one heavy worker at a time, nice 15, within the saved memory limits.
- Preserve player state, unrelated database content and nonmissing metadata. Tick book checkboxes only after the corresponding work actually passes. Delete successful import audit logs after verified completion. Mark genuinely blocked audits `_error.md` and continue the batch.
- Start from the latest small checkpoint and current handoff. Do not load enormous historical memory files wholesale. Keep the standing rules visible at the top of memory and save concise, accurate completed/pending work so the next session can resume without repeating it.

The current import goal remains active until the whole requested batch is complete. A checkpoint or one completed book does not complete the batch.
