import { CENTER, DESIGN_HEIGHT, DESIGN_WIDTH, FONTS, PROJECT_TILE, SQUARES, tokenOffset } from './board';
import { assetsAvailable, centerImage, cursorUrl, dieFace, eventArt, playerPortrait, playerToken, squareImage } from './assets';
import { availableThemes, themeLabel, themeName, type ThemeName } from './theme';
import { RESIGN_ICON, TRADE_ICON, squareIcon } from './icons';
import { tip } from './tooltip';
import type { Game } from './engine';
import * as R from './rules';
import { RANK_LETTERS, RANKS, type GameState, type Player, type Project, type SquareKind } from './types';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Corner and special-square wording. The titles the original stored are terse and the corners
 * gain a sublabel, so the redesign keeps its own copy here rather than editing src/board.ts,
 * whose constants are geometry and must not change.
 */
const SQUARE_TITLE: Partial<Record<SquareKind, string>> = {
  home: 'Home',
  officeParty: 'Office Party',
  meeting: 'Meeting',
  businessTrip: 'Business Trip',
  chance: 'Chance',
  scruples: 'Scruples',
  powerMonger: 'Power\nMonger',
};

const SQUARE_SUB: Partial<Record<SquareKind, string>> = {
  home: 'pass for review',
  officeParty: 'everyone attends',
  meeting: 'present your load',
  businessTrip: '+2 boss rating',
};

/**
 * Player colours are the recovered values, with two rendering rules from the design: the dark
 * green is lightened for meter fills so it reads against the trough, and initials on the two
 * dark colours are opaque white rather than translucent black.
 */
const DARK_GREEN = '#2f7d3f';
const BLUE = '#4b63e4';

function meterColor(color: string): string {
  return color === DARK_GREEN ? '#57b06a' : color;
}

function initialInk(color: string): string {
  return color === DARK_GREEN || color === BLUE ? '#fff' : 'rgb(0 0 0 / .6)';
}

/** Die face as a 3x3 pip grid, for when no artwork is installed. */
const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function pipGrid(n: number): HTMLElement {
  const grid = el('div', 'die-grid');
  const on = new Set(PIPS[n] ?? []);
  for (let i = 0; i < 9; i++) grid.append(el('div', on.has(i) ? 'pip' : 'pip pip-off'));
  return grid;
}

/**
 * What the die shows before it has been rolled this turn.
 *
 * `state.die` is cleared at the end of every turn, so the control was simply empty until you
 * clicked it — in every theme, and most obviously in the illustrated ones, where every other
 * control carries art. It draws the die with every pip *unlit*, like a display before it comes
 * on: still a die, but claiming no value. A resting face is not an option, since one pip is
 * indistinguishable from having rolled a one.
 */
function dieRest(): HTMLElement {
  const grid = el('div', 'die-grid die-rest');
  for (let i = 0; i < 9; i++) grid.append(el('div', 'pip pip-unlit'));
  grid.setAttribute('aria-hidden', 'true');
  return grid;
}

export interface UiHandlers {
  onGraphicsChanged(): void;
  onPickTheme(next: ThemeName): void;
  onToggleSound(): void;
  onToggleMusic(): void;
  musicOn(): boolean;
  onAutoClick(): void;
  onHighScores(): void;
  onHelp(topic?: string): void;
  onStockChart(): void;
  onAbout(): void;
  soundOn(): boolean;
  onRoll(): void;
  onTrade(): void;
  onResign(): void;
  onNewGame(): void;
  onSave(): void;
  onLoad(): void;
}

export class Ui {
  private root: HTMLElement;
  private boardCol!: HTMLElement;
  private boardWrap!: HTMLElement;
  private board!: HTMLElement;
  private side!: HTMLElement;
  private handlers: UiHandlers;

  /**
   * Snap the board to a whole-number scale factor.
   *
   * The original art is small (81x81 tiles, 145x145 corners), so scaling up resamples it.
   * At a fractional factor with pixelated rendering some source pixels land on 2 device
   * pixels and their neighbours on 3, which makes edges look ragged. An integer factor keeps
   * every source pixel the same size, at the cost of leaving some space unused.
   */
  private snapScale = localStorage.getItem('ogow:snap') === 'on';
  /**
   * Palette and artwork are one choice — see theme.ts. Switching one without the other let you
   * assemble combinations nobody designed, like the original's light pixel tiles on the neon
   * surface.
   */
  private pickTheme(next: ThemeName): void {
    // main.ts owns what applying a theme entails — palette, artwork, favicon, music and the
    // sweep across the screen — and re-renders when the swap lands.
    this.handlers.onPickTheme(next);
  }
  /**
   * How board text grows as the board scales up.
   *
   * The board is transform-scaled, so text scales with it and stays proportionally faithful.
   * That reads heavy on a large display: the original was drawn for a 776px board on an
   * 800x600 screen, where its text was relatively much larger than it needs to be at 2.6x on
   * a 27-inch monitor. 'comfortable' grows text by scale^0.8 rather than scale, applied as a
   * `--text-k` multiplier so no re-render is needed on resize. 'proportional' is the faithful
   * behaviour, kept as an option.
   */
  private textMode: 'proportional' | 'comfortable' =
    localStorage.getItem('ogow:boardtext') === 'proportional' ? 'proportional' : 'comfortable';

  private toggleTextMode(): void {
    this.textMode = this.textMode === 'comfortable' ? 'proportional' : 'comfortable';
    localStorage.setItem('ogow:boardtext', this.textMode);
    this.scaleBoard();
  }
  private cursorStyle: HTMLStyleElement | null = null;
  private menubar!: HTMLElement;
  private openMenu: string | null = null;
  private lastGame: Game | null = null;
  /**
   * Pre-game board, shown behind the New Game window.
   *
   * The original sat on this state at launch, waiting for you to pick New. Its design-time
   * captions are exactly what it showed: every project reads 'project Name', the ticker
   * reads '+32', each rank badge reads 'E', and the six avatars are parked in the 3x2 grid
   * above the ticker rather than standing on Home.
   */
  private attract = false;
  /**
   * Transient face shown while the die tumbles, overriding the rolled value. UI-only, so it
   * may use Math.random without touching the engine's seeded stream.
   */
  private dieOverride: number | null = null;

  setDieFace(n: number | null): void {
    this.dieOverride = n;
  }

  setAttract(on: boolean): void {
    this.attract = on;
  }

  constructor(root: HTMLElement, handlers: UiHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.buildShell();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.scaleBoard()).observe(this.boardCol);
    }
    window.addEventListener('resize', () => this.scaleBoard());
    document.addEventListener('click', () => this.closeMenus());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenus();
    });
  }

  private buildShell(): void {
    this.root.textContent = '';
    this.boardCol = el('div', 'board-col');
    this.menubar = el('div', 'menubar');
    this.boardWrap = el('div', 'board-wrap');
    this.board = el('div', 'board');
    this.boardWrap.append(this.board);
    this.boardCol.append(this.boardWrap);
    this.side = el('div', 'side');
    const left = el('div', 'left-col');
    left.append(this.menubar, this.boardCol);
    this.root.append(left, this.side);
    this.scaleBoard();
  }

  get snapping(): boolean {
    return this.snapScale;
  }

  toggleSnap(): boolean {
    this.snapScale = !this.snapScale;
    localStorage.setItem('ogow:snap', this.snapScale ? 'on' : 'off');
    this.scaleBoard();
    return this.snapScale;
  }

  /**
   * The board is authored in the original's 776x535 space and scaled to the largest size
   * that fits the available area, constrained by height as well as width.
   */
  private scaleBoard(): void {
    const availW = this.boardCol.clientWidth;
    const availH = this.boardCol.clientHeight;
    if (!availW || !availH) return;

    let scale = Math.min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT);
    if (this.snapScale && scale >= 1) scale = Math.floor(scale);
    scale = Math.max(0.35, scale);

    this.board.style.transform = `scale(${scale})`;
    this.boardWrap.style.width = `${Math.round(DESIGN_WIDTH * scale)}px`;
    this.boardWrap.style.height = `${Math.round(DESIGN_HEIGHT * scale)}px`;

    /*
     * Counter-scale text so it grows by scale^0.8 overall. The exponent was 0.6, which put
     * board text ~12% under the sizes the design specifies at any ordinary window size — the
     * design's numbers are for 1x, and the point of this multiplier is only to stop type
     * ballooning on a very large display. Floored so a name never stops fitting the label it
     * was measured against.
     */
    const k =
      this.textMode === 'proportional' || scale <= 1
        ? 1
        : Math.max(0.7, Math.pow(scale, -0.2));
    this.board.style.setProperty('--text-k', k.toFixed(3));
  }

  /**
   * Points the board's controls at the original's own cursors while its artwork is in use.
   * Reversible, since the artwork can be switched at any time.
   */
  private syncCursors(): void {
    const want = assetsAvailable();
    if (!want) {
      this.cursorStyle?.remove();
      this.cursorStyle = null;
      return;
    }
    if (this.cursorStyle) return;
    const rules: Array<[string, ReturnType<typeof cursorUrl>]> = [
      ['.board .center-btn[title*="Roll"]', cursorUrl('Dice')],
      ['.board .center-btn[title*="Trade"]', cursorUrl('Trade')],
      ['.board .sq-project', cursorUrl('Stock')],
      ['.board .token', cursorUrl('Hand')],
    ];
    const css = rules
      .filter(([, u]) => u)
      .map(([sel, u]) => `${sel} { cursor: url("${u}"), pointer; }`)
      .join('\n');
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    this.cursorStyle = style;
  }

  /**
   * The menu bar, mirroring TMAINFORM's TMainMenu: Game, Options, How to Play, About.
   * Two extra Options entries carry this port's own display settings. Register is omitted
   * deliberately (it drove a nag screen) and so is Exit, which means nothing in a browser tab.
   */
  private renderMenu(game: Game): void {
    type Item = { label: string; run?: () => void; check?: boolean; sep?: boolean };
    const menus: Array<{ name: string; items: Item[] }> = [
      {
        name: 'Game',
        items: [
          { label: 'New\u2026', run: () => this.handlers.onNewGame() },
          { label: 'Save\u2026', run: () => this.handlers.onSave() },
          { label: 'Load\u2026', run: () => this.handlers.onLoad() },
          { label: '', sep: true },
          { label: 'Stock Chart\u2026', run: () => this.handlers.onStockChart() },
          { label: '', sep: true },
          { label: 'High Scores\u2026', run: () => this.handlers.onHighScores() },
        ],
      },
      {
        name: 'Options',
        items: [
          { label: 'Sound', check: this.handlers.soundOn(), run: () => this.handlers.onToggleSound() },
          { label: 'Music', check: this.handlers.musicOn(), run: () => this.handlers.onToggleMusic() },
          { label: 'AutoClicking\u2026', run: () => this.handlers.onAutoClick() },
          { label: '', sep: true },
          // Palette and artwork together, radio-style. Original only appears with an
          // extraction installed; the other two always work.
          ...availableThemes().map((name) => ({
            label: `${themeLabel(name)} theme`,
            check: themeName() === name,
            run: () => this.pickTheme(name),
          })),
          { label: '', sep: true },
          {
            label: 'Snap board to whole pixels',
            check: this.snapScale,
            run: () => {
              this.toggleSnap();
              this.render(game);
            },
          },
          { label: '', sep: true },
          {
            label: 'Proportional board text',
            check: this.textMode === 'proportional',
            run: () => {
              this.toggleTextMode();
              this.render(game);
            },
          },
        ],
      },
      {
        name: 'How to Play',
        items: [
          { label: 'Getting Started', run: () => this.handlers.onHelp('getStarted') },
          { label: 'Rules of the Game', run: () => this.handlers.onHelp('rules') },
          { label: '', sep: true },
          { label: 'All topics\u2026', run: () => this.handlers.onHelp() },
        ],
      },
      { name: 'About', items: [{ label: 'About Game of Work', run: () => this.handlers.onAbout() }] },
    ];

    this.menubar.textContent = '';
    for (const m of menus) {
      const wrap = el('div', 'menu');
      const top = el('button', 'menu-top' + (this.openMenu === m.name ? ' menu-open' : ''), m.name);
      top.onclick = (e) => {
        e.stopPropagation();
        this.openMenu = this.openMenu === m.name ? null : m.name;
        this.renderMenu(game);
      };
      // Windows menubar behaviour: once one menu is open, moving across its siblings opens
      // them in turn without a further click. Hovering while nothing is open does nothing.
      // The name guard also stops a loop, since re-rendering replaces the element under the
      // cursor and the browser fires mouseenter again on the replacement.
      top.onmouseenter = () => {
        if (this.openMenu === null || this.openMenu === m.name) return;
        this.openMenu = m.name;
        this.renderMenu(game);
      };
      wrap.append(top);
      if (this.openMenu === m.name) {
        const drop = el('div', 'menu-drop');
        for (const it of m.items) {
          if (it.sep) {
            drop.append(el('div', 'menu-sep'));
            continue;
          }
          const b = el('button', 'menu-item');
          b.append(el('span', 'menu-check', it.check === undefined ? '' : it.check ? '\u2713' : ''));
          b.append(el('span', undefined, it.label));
          b.onclick = (e) => {
            e.stopPropagation();
            this.openMenu = null;
            this.renderMenu(game);
            it.run?.();
          };
          drop.append(b);
        }
        wrap.append(drop);
      }
      this.menubar.append(wrap);
    }

    const right = el('div', 'menubar-right');
    // One control, since a theme is the palette and the artwork together.
    right.append(
      this.segmentedGroup(
        'Theme',
        availableThemes().map(
          (name) =>
            [
              name,
              themeLabel(name),
              themeName() === name,
              () => this.pickTheme(name),
            ] as [string, string, boolean, () => void],
        ),
      ),
    );
    this.menubar.append(right);
  }

  /** A labelled segmented control for the menu bar. */
  private segmentedGroup(
    label: string,
    options: Array<[string, string, boolean, () => void]>,
  ): HTMLElement {
    const group = el('div', 'menubar-group');
    group.append(el('span', 'menubar-label', label));
    const seg = el('div', 'segmented');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', label);
    for (const [, text, on, run] of options) {
      const b = el('button', 'segment' + (on ? ' segment-on' : ''), text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      b.onclick = (e) => { e.stopPropagation(); run(); };
      seg.append(b);
    }
    group.append(seg);
    return group;
  }

  /** Closes any open menu. */
  private closeMenus(): void {
    if (this.openMenu === null) return;
    this.openMenu = null;
    if (this.lastGame) this.renderMenu(this.lastGame);
  }

  render(game: Game): void {
    this.lastGame = game;
    this.renderMenu(game);
    this.syncCursors();
    // The field surface is constant now: installed tile artwork is opaque, so the old
    // light-board override only fought the redesign's own background.
    this.renderBoard(game);
    this.renderSide(game);
    this.scaleBoard();
  }

  // ------------------------------------------------------------- board

  private renderBoard(game: Game): void {
    const s = game.state;
    this.board.textContent = '';

    for (const sq of SQUARES) {
      const node = el('div', `sq sq-${sq.kind}`);
      node.style.left = `${sq.left}px`;
      node.style.top = `${sq.top}px`;
      node.style.width = `${sq.size}px`;
      node.style.height = `${sq.size}px`;
      if (sq.size === 140) node.classList.add('sq-corner');

      if (sq.kind === 'project') {
        this.paintProject(node, s.projects[sq.project!], game);
      } else {
        const art = squareImage(sq.index);
        if (art) {
          // Installed artwork fills the tile and carries the label itself.
          const img = el('img', 'sq-art');
          img.src = art;
          img.alt = SQUARE_TITLE[sq.kind] ?? sq.kind;
          img.draggable = false;
          node.append(img);
          node.classList.add('sq-hasart');
        } else {
          const corner = sq.size === 140;
          const icon = el('div', 'sq-icon');
          icon.innerHTML = squareIcon(sq.kind, corner ? 44 : 32);
          node.append(icon);
          if (corner) {
            node.append(
              el('div', 'sq-title', SQUARE_TITLE[sq.kind] ?? ''),
              el('div', 'sq-sub', SQUARE_SUB[sq.kind] ?? ''),
            );
          } else {
            node.append(el('div', 'sq-label', SQUARE_TITLE[sq.kind] ?? ''));
          }
        }
      }
      this.board.append(node);
    }

    this.paintCenter(game);
    this.paintStats(game);
    this.paintTokens(s);
  }

  /**
   * A project square: a flat profile-coloured tile, a bar filling upward out of a dark trough,
   * the name over two lines, and the profile numeral.
   *
   * Owned names are dark ink rather than the owner's colour: the pale player colours measure
   * 2-3:1 against a pastel tile, so the bar carries ownership instead. Two lines because
   * names.ts pools words up to 9 characters, which will not fit one legible line in a 73px box.
   */
  private paintProject(node: HTMLElement, proj: Project, game: Game): void {
    const T = PROJECT_TILE;
    const owner = proj.owner === null ? null : game.player(proj.owner);
    node.style.background = `var(--tile-${proj.profile})`;
    if (owner) node.classList.add('proj-owned');
    // An empty layer the palette can decorate — scanlines and an inner glow under the neon
    // palette, nothing at all under the original one. First child, so the bar, the name and
    // the numeral all sit above it.
    node.append(el('div', 'proj-fx'));

    const track = el('div', 'proj-track');
    track.style.left = `${T.bar.left}px`;
    track.style.top = `${T.bar.top}px`;
    track.style.width = `${T.bar.width}px`;
    track.style.height = `${T.bar.height}px`;

    // The pre-game board keeps the part-filled bars the original's idle screen showed, which
    // its design-time mask records as a fraction of the bar rather than a progress value.
    const ratio = this.attract
      ? 1 - T.empty.designHeight / T.empty.maxHeight
      : Math.max(0, Math.min(1, proj.progress / proj.work));
    const fill = el('div', 'proj-fill');
    fill.style.left = `${T.bar.left}px`;
    fill.style.width = `${T.bar.width}px`;
    fill.style.height = `${Math.round(T.bar.height * ratio)}px`;
    fill.style.bottom = '0';
    fill.style.background = owner ? meterColor(owner.color) : 'var(--tile-ink-dim)';
    // `color` carries the same value so a palette can bloom the bar with currentColor without
    // the stylesheet needing to know whose it is.
    fill.style.color = owner ? meterColor(owner.color) : 'var(--tile-ink-dim)';

    const label = this.attract ? 'project Name' : proj.name;
    const [adjective, ...rest] = label.split(' ');
    const noun = rest.join(' ') || adjective;
    const name = el('div', 'proj-name');
    name.style.left = `${T.name.left}px`;
    name.style.top = `${T.name.top}px`;
    name.style.width = `${T.name.width}px`;
    name.style.height = `${T.name.height}px`;
    if (rest.length) name.append(el('div', 'proj-adj', adjective));
    name.append(el('div', 'proj-noun', noun));

    node.append(track, fill, name, el('div', 'proj-num', String(proj.profile)));

    if (proj.shoddy) {
      node.append(el('div', 'proj-shoddy-overlay'));
      const dot = el('div', 'proj-shoddy-dot');
      tip(dot, 'Shoddy — will rebound on whoever ships it');
      node.append(dot);
    }

    node.title =
      `${proj.name} — profile ${proj.profile}, ${proj.progress}/${proj.work} work` +
      (owner ? `, owned by ${owner.name}` : ', unowned') +
      (proj.shoddy ? ', SHODDY' : '');
  }

  private paintCenter(game: Game): void {
    const s = game.state;
    const busy = !!s.modal || s.phase === 'gameOver';
    const p = game.active;
    const isHuman = p.kind === 'human';
    const C = CENTER.captions;

    const caption = (
      c: { left: number; top: number; width: number; height: number },
      text: string,
      variant: string,
    ) => {
      const n = el('div', `center-caption ${variant}`, text);
      n.style.left = `${c.left}px`;
      n.style.top = `${c.top}px`;
      n.style.width = `${c.width}px`;
      n.style.height = `${c.height}px`;
      return n;
    };

    // The only filled control on the board.
    const roll = el('button', 'center-btn center-roll');
    roll.style.left = `${CENTER.rollDie.left}px`;
    roll.style.top = `${CENTER.rollDie.top}px`;
    roll.style.width = `${CENTER.rollDie.size}px`;
    roll.style.height = `${CENTER.rollDie.size}px`;
    const shown = this.dieOverride ?? s.die;
    const face = shown ? dieFace(shown) : null;
    if (face) {
      const img = el('img', 'btn-art');
      img.src = face;
      img.alt = this.dieOverride ? 'Rolling' : `Rolled ${shown}`;
      img.draggable = false;
      roll.append(img);
    } else {
      roll.append(shown ? pipGrid(shown) : dieRest());
    }
    roll.disabled = busy || !game.canRoll() || !isHuman;
    roll.onclick = () => this.handlers.onRoll();
    tip(roll, 'Roll the die (Space)');

    const trade = el('button', 'center-btn center-ctl');
    trade.style.left = `${CENTER.makeTrade.left}px`;
    trade.style.top = `${CENTER.makeTrade.top}px`;
    trade.style.width = `${CENTER.makeTrade.size}px`;
    trade.style.height = `${CENTER.makeTrade.size}px`;
    const tradeArt = centerImage('makeTrade');
    if (tradeArt) {
      const img = el('img', 'btn-art');
      img.src = tradeArt;
      img.alt = 'Trade';
      img.draggable = false;
      trade.append(img);
    } else {
      const icon = el('div', 'sq-icon');
      icon.innerHTML = TRADE_ICON;
      trade.append(icon);
    }
    trade.disabled = busy || s.rolled || !isHuman;
    trade.onclick = () => this.handlers.onTrade();
    tip(trade, 'Trade projects before rolling (T)');

    const resign = el('button', 'center-btn center-ctl');
    resign.style.left = `${CENTER.resign.left}px`;
    resign.style.top = `${CENTER.resign.top}px`;
    resign.style.width = `${CENTER.resign.size}px`;
    resign.style.height = `${CENTER.resign.size}px`;
    const resignArt = centerImage('resign');
    if (resignArt) {
      const img = el('img', 'btn-art');
      img.src = resignArt;
      img.alt = 'Resign';
      img.draggable = false;
      resign.append(img);
    } else {
      const icon = el('div', 'sq-icon');
      icon.innerHTML = RESIGN_ICON;
      resign.append(icon);
    }
    resign.disabled = busy || s.rolled || !isHuman;
    resign.onclick = () => this.handlers.onResign();
    tip(resign, 'Hand your seat to a computer player (R)');

    this.board.append(
      roll,
      trade,
      resign,
      caption(C.rollDie, 'Roll', 'cap-roll'),
      caption(C.makeTrade, 'Trade', 'cap-trade'),
      caption(C.resign, 'Resign', 'cap-resign'),
      caption(C.ticker, 'Stock Ticker', 'cap-ticker'),
    );

    this.paintTicker(game);
  }

  /** The Stock Ticker: an inset readout showing the most recent change to the share price. */
  private paintTicker(game: Game): void {
    const F = CENTER.frames.ticker;
    const V = CENTER.tickerValue;

    const frame = el('div', 'ticker-frame');
    frame.style.left = `${F.left}px`;
    frame.style.top = `${F.top}px`;
    frame.style.width = `${F.width}px`;
    frame.style.height = `${F.height}px`;

    const delta = this.attract ? 32 : game.state.lastStockDelta;
    const readout = el('div', 'ticker');
    readout.style.left = `${V.left}px`;
    readout.style.top = `${V.top}px`;
    readout.style.width = `${V.width}px`;
    readout.style.height = `${V.height}px`;
    readout.classList.add(delta > 0 ? 'ticker-up' : delta < 0 ? 'ticker-down' : 'ticker-flat');
    readout.textContent = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`;
    tip(readout, `Share price ${game.state.stock} — last change ${delta >= 0 ? '+' : ''}${delta}`);

    this.board.append(frame, readout);
  }

  /**
   * Player rows on the transcribed geometry (CENTER.statRows). Nothing else may occupy this
   * panel: a six-seat game uses every row.
   */
  private paintStats(game: Game): void {
    const G = CENTER.statRows;
    const panel = el('div', 'stats-panel');
    panel.style.left = `${CENTER.stats.left}px`;
    panel.style.top = `${CENTER.stats.top}px`;
    panel.style.width = `${CENTER.stats.width}px`;
    panel.style.height = `${CENTER.stats.height}px`;

    game.state.players.forEach((p, row) => {
      if (row >= G.barTops.length) return;
      const barTop = G.barTops[row];
      const active = p.id === game.state.current;

      /*
       * A band rather than a marker glyph, so the whole row reads as current. It has to cover
       * the row's *content*, which runs from the name down through the meter track — a fixed
       * height clipped the meter off. Rows are only 32px apart while their content is 34px
       * tall, so consecutive bands would overlap; that is harmless, since exactly one row is
       * ever active. Snapped to the panel edge when it lands within a few pixels of it, or the
       * first and last rows read as inset.
       */
      if (active) {
        const band = el('div', 'stat-band');
        /*
         * The transcribed rows overlap: a bar runs to barTop+16, which is 2px past the next
         * row's nameTop. So the band stops 2px short of its own bar rather than covering the
         * next name — board.ts is the recovered geometry and does not move to suit a highlight.
         */
        const top = G.nameTops[row] - 4;
        const bottom = barTop + G.bar.height - 2;
        const snapTop = top <= 6 ? 0 : top;
        const snapBottom = bottom >= CENTER.stats.height - 8 ? CENTER.stats.height : bottom;
        band.style.top = `${snapTop}px`;
        band.style.height = `${snapBottom - snapTop}px`;
        panel.append(band);
      }

      const name = el(
        'div',
        'stat-name' + (active ? ' active' : '') + (p.resigned ? ' resigned' : ''),
        p.name,
      );
      name.style.left = `${G.name.left}px`;
      name.style.top = `${G.nameTops[row]}px`;
      name.style.width = `${G.name.width}px`;
      name.style.height = `${G.name.height}px`;
      name.style.fontSize = `calc(${FONTS.playerName}px * var(--text-k, 1))`;

      const portraitArt = playerPortrait(p.id);
      const portrait = el('div', 'stat-portrait');
      portrait.style.left = `${G.portrait.left}px`;
      portrait.style.top = `${barTop}px`;
      portrait.style.width = `${G.portrait.size}px`;
      portrait.style.height = `${G.portrait.size}px`;
      if (portraitArt) {
        const img = el('img', 'portrait-art');
        img.src = portraitArt;
        img.alt = p.name;
        img.draggable = false;
        portrait.append(img);
      } else {
        portrait.style.background = p.color;
        portrait.style.color = initialInk(p.color);
        portrait.textContent = p.name.slice(0, 1).toUpperCase();
      }
      tip(portrait, p.kind === 'computer' ? `${p.name} — computer (${p.personality})` : `${p.name} — human`);

      const track = el('div', 'stat-track');
      track.style.left = `${G.bar.left}px`;
      track.style.top = `${barTop}px`;
      track.style.width = `${G.bar.width}px`;
      track.style.height = `${G.bar.height}px`;

      const stress = game.stress(p.id);
      const brPct = Math.max(0, Math.min(100, (p.bossRating / R.PRESIDENT_THRESHOLD) * 100));
      const stressPct = Math.min(100, (stress / R.STRESS_BAR_MAX) * 100);

      const boss = el('div', 'meter meter-boss');
      boss.style.width = `${brPct}%`;
      boss.style.background = meterColor(p.color);
      const load = el('div', 'meter meter-load');
      load.style.width = `${stressPct}%`;
      track.append(boss, load);
      track.title =
        `${p.name}: Boss Rating ${p.bossRating}/${R.PRESIDENT_THRESHOLD} (top), ` +
        `workload ${stress}/${R.STRESS_BAR_MAX} (bottom) — ${RANKS[p.rank]}, ` +
        `${game.projectsOf(p.id).length} project(s)`;

      const rank = el(
        'div',
        'stat-rankbadge' + (active ? ' active' : '') + (p.resigned ? ' resigned' : ''),
        RANK_LETTERS[p.rank],
      );
      rank.style.left = `${G.rank.left}px`;
      rank.style.top = `${barTop}px`;
      rank.style.width = `${G.portrait.size}px`;
      rank.style.height = `${G.rank.height}px`;
      rank.style.fontSize = `calc(${FONTS.rankBadge}px * var(--text-k, 1))`;
      tip(rank, RANKS[p.rank]);

      panel.append(name, portrait, track, rank);
    });

    this.board.append(panel);
  }

  private paintTokens(s: GameState): void {
    const place = (p: (typeof s.players)[number], left: number, top: number, parked: boolean) => {
      const art = playerToken(p.id);
      const size = art ? 26 : 22;
      const cls = ['token'];
      if (art) cls.push('token-art');
      if (parked) cls.push('token-parked');
      const t = el('div', cls.join(' '));
      t.style.width = `${size}px`;
      t.style.height = `${size}px`;
      t.style.left = `${left - size / 2}px`;
      t.style.top = `${top - size / 2}px`;
      if (art) {
        const img = el('img');
        img.src = art;
        img.alt = p.name;
        img.draggable = false;
        t.append(img);
      } else {
        t.style.background = p.color;
        t.style.color = initialInk(p.color);
        t.textContent = p.name.slice(0, 1).toUpperCase();
      }
      tip(t, `${p.name} — ${RANKS[p.rank]}`);
      this.board.append(t);
    };

    if (this.attract) {
      // Parked in the 3x2 grid the original leaves them in before a game starts.
      const G = CENTER.tokens;
      s.players.forEach((p, i) => {
        const col = i % G.perRow;
        const row = Math.floor(i / G.perRow);
        place(p, G.left + col * G.gapX + G.size / 2, G.top + row * G.gapY + G.size / 2, true);
      });
      return;
    }

    const perSquare = new Map<number, number>();
    for (const p of s.players) {
      const slot = perSquare.get(p.square) ?? 0;
      perSquare.set(p.square, slot + 1);
      const sq = SQUARES[p.square];
      const { dx, dy } = tokenOffset(slot);
      place(p, sq.left + sq.size / 2 + dx, sq.top + sq.size / 2 + dy, false);
    }
  }


  private renderSide(game: Game): void {
    const s = game.state;
    this.side.textContent = '';
    const p = game.active;

    // -------- turn card
    const turnCard = el('div', 'card');
    const head = el('div', 'card-head');
    head.append(el('h2', undefined, `Turn ${s.turn}`));
    if (p.kind === 'human' && s.phase !== 'gameOver') head.append(el('div', 'turn-now', 'Your move'));
    turnCard.append(head);

    const line = el('div', 'turn-line');
    const dot = el('span', 'dot');
    dot.style.background = p.color;
    line.append(dot, el('span', 'turn-name', p.name));
    turnCard.append(line, el('div', 'turn-rank', `${RANKS[p.rank]}${p.kind === 'computer' ? ` · ${p.personality}` : ''}`));

    const meter = (label: string, value: number, max: number, colour: string) => {
      const row = el('div', 'metric-row');
      row.append(el('span', 'metric-label', label), el('span', 'metric-value', `${value} / ${max}`));
      const track = el('div', 'metric-track');
      const fill = el('i');
      fill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
      fill.style.background = colour;
      track.append(fill);
      return [row, track] as const;
    };
    const stress = game.stress(p.id);
    turnCard.append(
      ...meter('Boss rating', p.bossRating, R.PRESIDENT_THRESHOLD, meterColor(p.color)),
      ...meter('Workload', stress, R.STRESS_BAR_MAX, 'var(--danger)'),
    );

    const row = el('div', 'btn-row');
    const rollBtn = el('button', 'b primary', 'Roll');
    rollBtn.style.flex = '1';
    rollBtn.disabled = !game.canRoll() || p.kind !== 'human' || !!s.modal;
    rollBtn.onclick = () => this.handlers.onRoll();
    const tradeBtn = el('button', 'b', 'Trade');
    tradeBtn.disabled = s.rolled || p.kind !== 'human' || !!s.modal || s.phase === 'gameOver';
    tradeBtn.onclick = () => this.handlers.onTrade();
    row.append(rollBtn, tradeBtn);
    turnCard.append(row);
    this.side.append(turnCard);

    // -------- share price card
    const stockCard = el('div', 'card');
    stockCard.append(el('h2', undefined, 'Share price'));
    const priceRow = el('div', 'turn-line');
    priceRow.append(el('span', 'stock-num', String(s.stock)));
    const delta = s.lastStockDelta;
    if (delta !== 0) {
      priceRow.append(
        el('span', `stock-delta ${delta > 0 ? 'up' : 'down'}`, `${delta > 0 ? '+' : ''}${delta}`),
      );
    }
    priceRow.append(el('span', 'stock-peak', `peak ${s.stockPeak}`));
    stockCard.append(priceRow, this.stockChart(s));
    stockCard.append(
      el(
        'div',
        'hint',
        s.stock <= 20 ? 'Danger: the company disbands at zero.' : 'Rises when projects ship.',
      ),
    );
    this.side.append(stockCard);

    // -------- log
    const logCard = el('div', 'card');
    logCard.append(el('h2', undefined, 'Log'));
    const log = el('div', 'log');
    for (const entry of [...s.log].reverse().slice(0, 60)) {
      const d = el('div', 'log-entry');
      const art = entry.art ? eventArt(entry.art) : null;
      if (art) {
        d.classList.add('log-with-art');
        const img = el('img', 'log-art');
        img.src = art;
        img.alt = '';
        img.draggable = false;
        d.append(img);
      }
      // Name and message share one wrapper: separate grid items would push a bare text node
      // into the 40px art column.
      const body = el('div', 'log-text');
      if (entry.playerId !== null) {
        /*
         * The colour goes on the entry's edge, not on the name. The recovered player colours
         * are text-hostile on a dark panel — blue measures 3.75:1 and dark green 3.68:1
         * against the card — the same reason owned project names on the board are dark ink
         * rather than the owner's colour. A rule is a graphic, so 4.5:1 does not apply to it.
         */
        d.classList.add('log-owned');
        d.style.borderLeftColor = game.player(entry.playerId).color;
        const who = el('b', 'log-who', `${game.player(entry.playerId).name}: `);
        body.append(who);
      } else {
        d.classList.add('log-system');
      }
      body.append(document.createTextNode(entry.text));
      d.append(body);
      log.append(d);
    }
    logCard.append(log);
    this.side.append(logCard);
  }

  private stockChart(s: GameState): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'stock-chart');
    svg.setAttribute('viewBox', '0 0 200 56');
    svg.setAttribute('preserveAspectRatio', 'none');
    const pts = s.stockHistory.slice(-60);
    const max = Math.max(...pts.map((q) => q.price), R.STOCK_START);
    const y = (v: number) => 54 - (v / max) * 52;

    // Dashed baseline at the starting price, so a slide below it is legible at a glance.
    const base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    base.setAttribute('x1', '0');
    base.setAttribute('x2', '200');
    base.setAttribute('y1', String(y(R.STOCK_START)));
    base.setAttribute('y2', String(y(R.STOCK_START)));
    base.setAttribute('class', 'spark-base');
    svg.append(base);

    if (pts.length > 1) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        pts
          .map((q, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * 200).toFixed(1)},${y(q.price).toFixed(1)}`)
          .join(' '),
      );
      path.setAttribute('class', `spark-line ${s.stock >= R.STOCK_START ? 'spark-up' : 'spark-down'}`);
      svg.append(path);
    }
    return svg;
  }

  // ------------------------------------------------------------- modals

  /** Shows a modal. Returns a promise resolving to the chosen value. */
  /**
   * Shows a dialog and resolves with whatever it decides.
   *
   * The keyboard contract is derived from the dialog's own markup rather than wired up dialog by
   * dialog, so every one of them behaves the same way and a new one needs no extra code:
   *
   * - **Enter** takes the selected answer if there is one, else the primary button — 'Take it
   *   on', 'Start game', 'Continue'.
   * - **Escape** takes the secondary button: 'Decline', 'Cancel', 'Keep playing'. On a notice
   *   with a single button it dismisses, since dismissing is the only thing it can mean.
   * - **1-9** select an answer where the dialog offers a numbered list; Enter then commits it.
   *   Escape does nothing there — a dilemma has no safe default, and offering one would be
   *   answering it.
   *
   * Digits are ignored while a text field has focus, or naming a player 'Player 1' would pick
   * an answer.
   */
  modal<T>(build: (resolve: (v: T) => void) => HTMLElement): Promise<T> {
    return new Promise<T>((resolve) => {
      const scrim = el('div', 'scrim');
      const done = (v: T) => {
        window.removeEventListener('keydown', onKey, true);
        scrim.remove();
        resolve(v);
      };

      const enabled = (sel: string) => [...scrim.querySelectorAll<HTMLButtonElement>(sel)].filter((b) => !b.disabled);
      const select = (button: HTMLButtonElement) => {
        for (const c of scrim.querySelectorAll('.choice-selected')) c.classList.remove('choice-selected');
        button.classList.add('choice-selected');
        button.setAttribute('aria-checked', 'true');
        button.scrollIntoView({ block: 'nearest' });
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        const typing = !!target && /^(input|textarea)$/i.test(target.tagName) && target.getAttribute('type') !== 'checkbox';
        const choices = enabled('.choice');

        if (/^[1-9]$/.test(e.key) && choices.length && !typing) {
          const pick = choices[Number(e.key) - 1];
          if (pick) {
            select(pick);
            e.preventDefault();
          }
          return;
        }

        if (e.key === 'Enter') {
          const chosen = scrim.querySelector<HTMLButtonElement>('.choice-selected');
          const primary = enabled('.foot .b.primary')[0];
          const only = enabled('.foot .b');
          const act = chosen ?? primary ?? (only.length === 1 ? only[0] : undefined);
          if (act) {
            e.preventDefault();
            act.click();
          }
          return;
        }

        if (e.key === 'Escape') {
          const buttons = enabled('.foot .b');
          // The secondary button is the one that declines. A lone button is a notice, where
          // Escape can only mean dismiss.
          const back = buttons.find((b) => !b.classList.contains('primary') && !b.classList.contains('help-mark'));
          const act = back ?? (buttons.length === 1 ? buttons[0] : undefined);
          if (act) {
            e.preventDefault();
            act.click();
          }
        }
      };

      scrim.append(build(done));
      document.body.append(scrim);
      window.addEventListener('keydown', onKey, true);
      /*
       * Where the focus ring lands has to agree with what Enter does, or the dialog lies about
       * itself: a confirm whose ring sits on 'Decline' reads as though Enter will decline.
       *
       *   1. `[autofocus]`, where a dialog names its own target.
       *   2. Nothing, when the dialog offers a numbered list — a ring on the first answer would
       *      imply it is selected, and Enter would then have to honour that.
       *   3. The primary button, when the dialog is a plain confirm. This is the case that was
       *      wrong: the first control in the markup is the secondary one, because 'Decline'
       *      reads before 'Take it on'.
       *   4. Otherwise the first enabled control that has not opted out with data-skip-focus,
       *      so a form starts where you would start filling it in rather than on its buttons.
       */
      const controls = [...scrim.querySelectorAll<HTMLElement>('button, input, select')].filter(
        (n) => n.dataset.skipFocus === undefined && !n.hasAttribute('disabled'),
      );
      const named = scrim.querySelector<HTMLElement>('[autofocus]');
      const hasChoices = scrim.querySelector('.choice');
      const fields = scrim.querySelector('input, select, .plist');
      const primary = scrim.querySelector<HTMLButtonElement>('.foot .b.primary:not(:disabled)');
      const focus = named ?? (hasChoices ? null : !fields && primary ? primary : controls[0]);
      focus?.focus();
    });
  }

  static modalShell(title: string, sub?: string): HTMLElement {
    const m = el('div', 'modal');
    m.append(el('h3', undefined, title));
    if (sub) m.append(el('div', 'sub', sub));
    return m;
  }

  static delta(n: number): HTMLElement {
    const s = el('span', n >= 0 ? 'delta-pos' : 'delta-neg', `${n >= 0 ? '+' : ''}${n}`);
    return s;
  }

  static playerLabel(p: Player): HTMLElement {
    const s = el('span', undefined, p.name);
    s.style.color = p.color;
    s.style.fontWeight = '700';
    return s;
  }
}

export { el };
