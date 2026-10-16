# Simulator Structure

Every simulator uses the same book boundary:

```text
battlesimNNN.js             Compatibility exports only
books/NNN/definition.js     Identity, defaults and declarative options
books/NNN/panel.js          DOM, lifecycle and application wiring
books/NNN/state.js          Saved-state access and compatibility
books/NNN/combat.js         Combat resolution and checks
books/NNN/effects.js        Book-specific spells, items and recovery
engines/<family>/           Reusable family rules and panels
```

- `definition.js` and `panel.js` are mandatory. Omit other files when the book delegates that responsibility to a shared engine; do not create empty placeholders.
- Every entry exports `definition`, `init`, `render` and `setVisible`. Preserve the legacy named exports used by desktop/mobile loaders.
- Keep DOM access and HTML builders in panels. Extracted state/combat/effects factories receive application dependencies through `getContext`; read live dependencies when an action runs, not when the module loads.
- Keep all setup and combat controls in the left column; reserve the right column for results/logs/history. Both loaders apply the shared layout boundary. Use the shared button, input and checkbox styles, not native unstyled controls or per-book visual variants.
- Use the shared `--bsim-text-size` scale and compact row/button spacing in `battlesim.css`. Do not add per-book font-size or density overrides; verify both legacy and new panels through the architecture browser fixture.
- Ordinary fights must work without choosing a roster entry. Use `opponents.js` for autocomplete-backed editable opponent names/stats; keep book encounters as optional presets. Lock setup during combat and preserve existing fights when adding custom setup. Preset-specific group size stays fixed; custom fights may add opponents.
- After releasing a simulator, run `node scripts/check-battlesim-registration.js` against the installed catalog. Module files alone do not set `books.has_battle_sim`; fix missing registration instead of overriding the stats count.
- Bulgarian-source books use Bulgarian simulator tables, independent of the app language. Register them in `i18n/battlesim.js`; verify the real loader without injecting test-only translations.
- Keep delayed UI confirmations that read live application bindings in panels; do not replace those bindings with captured context snapshots.
- Put shared rules in the family engine, not in copied book implementations. Keep distinct printed rules and encounter exceptions explicit; do not switch silently on book IDs inside shared combat algorithms.
- Preserve existing state keys, field names, fight rule versions, outcome history, translation keys, element IDs and shortcuts during refactors. Never migrate or reset saved fights as a side effect of rendering.
- New book rules need direct tests; verify actual desktop/mobile lazy entry as well. Existing isolated VM tests use `test/client/battlesim/simulator-source.mjs` to read extracted declarations.
- Run the architecture test when adding a simulator. Update `docs/technical.md` for architectural changes and regenerate its HTML; do not add book-audit findings to technical documentation.
