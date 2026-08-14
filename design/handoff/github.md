repo: erango/open-game-of-work
branch: master

## Last sync

date: 2026-08-14T10:10:00Z

### Updated in this project

- Recreated the current game screen (board at 1×, menu bar, sidebar) from src/ui.ts and src/style.css.
- Recreated the New Game and Scruples dialogs from src/main.ts.
- Board geometry, profile colours, player colours and fonts taken from src/board.ts and src/rules.ts.

## Screen map

| Screen | Repo files |
|---|---|
| Current UI.dc.html — app shell (menu bar, board, sidebar) | src/ui.ts, src/style.css, src/board.ts, src/icons.ts, src/rules.ts, index.html |
| Current UI.dc.html — New Game dialog | src/main.ts (askNewGame), src/rules.ts (PLAYER_COLORS, SEAT_ROW_COLORS), src/names.ts (DEFAULT_NAMES) |
| Current UI.dc.html — Scruples dialog | src/main.ts (handleScruples), src/style.css (.choice) |
