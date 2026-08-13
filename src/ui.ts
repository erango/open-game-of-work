import { BOARD_COLOR, CENTER, DESIGN_HEIGHT, DESIGN_WIDTH, KIND_LABEL, PROFILE_COLORS, PROJECT_TILE, SQUARES, STATS_PANEL_COLOR, tokenOffset } from './board';
import { assetsAvailable, centerImage, cursorUrl, dieFace, eventArt, playerPortrait, playerToken, squareImage } from './assets';
import { squareIcon } from './icons';
import type { Game } from './engine';
import * as R from './rules';
import { RANK_LETTERS, RANKS, type GameState, type Player, type Project } from './types';

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

export interface UiHandlers {
  onToggleSmooth(): void;
  smoothOn(): boolean;
  onToggleSound(): void;
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
  private cursorsApplied = false;
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
  }

  /** Points the board's controls at the original's own cursors, when they are installed. */
  private applyCursors(): void {
    if (!assetsAvailable() || this.cursorsApplied) return;
    this.cursorsApplied = true;
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
          { label: 'AutoClicking\u2026', run: () => this.handlers.onAutoClick() },
          { label: '', sep: true },
          {
            label: 'Snap board to whole pixels',
            check: this.snapScale,
            run: () => {
              this.toggleSnap();
              this.render(game);
            },
          },
          { label: 'Smooth artwork', check: this.handlers.smoothOn(), run: () => this.handlers.onToggleSmooth() },
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
    this.applyCursors();
    // With the original art installed, use the original's board colour so the opaque tile
    // artwork sits on the background it was drawn for rather than on the fallback felt.
    this.boardWrap.style.background = assetsAvailable() ? BOARD_COLOR : '';
    this.boardWrap.classList.toggle('board-original', assetsAvailable());
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
          // Original face fills the tile; the label is redundant since the art carries it.
          const img = el('img', 'sq-art');
          img.src = art;
          img.alt = KIND_LABEL[sq.kind].replace('\n', ' ');
          img.draggable = false;
          node.append(img);
          node.classList.add('sq-hasart');
        } else {
          const icon = el('div', 'sq-icon');
          icon.innerHTML = squareIcon(sq.kind, sq.size === 140 ? 48 : 34);
          node.append(icon, el('div', 'sq-label', KIND_LABEL[sq.kind]));
        }
      }
      this.board.append(node);
    }

    this.paintCenter(game);
    this.paintStats(game);
    this.paintTokens(s);
  }

  /**
   * A project square, as the original composes it (see PROJECT_TILE): a flat profile-coloured
   * tile, a vertical bar down the left edge in the owner's colour (black when unowned), a
   * white shape masking the part of that bar not yet earned, and the name centred clear of
   * the bar.
   *
   * The bar is drawn full and masked from the top, not filled from the bottom. Getting that
   * backwards makes an untouched project look finished, which is what it used to do.
   */
  private paintProject(node: HTMLElement, proj: Project, game: Game): void {
    const T = PROJECT_TILE;
    const owner = proj.owner === null ? null : game.player(proj.owner);
    node.style.background = PROFILE_COLORS[proj.profile];

    const bar = el('div', 'proj-bar');
    bar.style.left = `${T.bar.left}px`;
    bar.style.top = `${T.bar.top}px`;
    bar.style.width = `${T.bar.width}px`;
    bar.style.height = `${T.bar.height}px`;
    bar.style.background = owner ? owner.color : '#000';

    const ratio = Math.max(0, Math.min(1, proj.progress / proj.work));
    const remaining = this.attract
      ? T.empty.designHeight
      : Math.round(T.empty.maxHeight * (1 - ratio));
    const empty = el('div', 'proj-empty');
    empty.style.left = `${T.empty.left}px`;
    empty.style.top = `${T.empty.top}px`;
    empty.style.width = `${T.empty.width}px`;
    empty.style.height = `${remaining}px`;

    const name = el('div', 'proj-name', this.attract ? 'project Name' : proj.name);
    name.style.left = `${T.name.left}px`;
    name.style.top = `${T.name.top}px`;
    name.style.width = `${T.name.width}px`;
    name.style.height = `${T.name.height}px`;
    name.style.color = owner ? owner.color : '#000';

    node.append(bar, empty, name);

    if (proj.shoddy) {
      const dot = el('div', 'proj-shoddy-dot');
      dot.title = 'Shoddy — will rebound on whoever ships it';
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
    const F = CENTER.frames;
    const C = CENTER.captions;

    // Raised frames behind each control, as the original's bsRaised bevels.
    for (const box of [F.rollDie, F.makeTrade, F.resign]) {
      const bevel = el('div', 'bevel');
      bevel.style.left = `${box.left}px`;
      bevel.style.top = `${box.top}px`;
      bevel.style.width = `${box.width}px`;
      bevel.style.height = `${box.height}px`;
      this.board.append(bevel);
    }

    const caption = (c: { left: number; top: number; width: number; height: number; text: string }) => {
      const n = el('div', 'center-caption', c.text);
      n.style.left = `${c.left}px`;
      n.style.top = `${c.top}px`;
      n.style.width = `${c.width}px`;
      n.style.height = `${c.height}px`;
      return n;
    };

    const roll = el('button', 'center-btn');
    roll.style.left = `${CENTER.rollDie.left}px`;
    roll.style.top = `${CENTER.rollDie.top}px`;
    roll.style.width = `${CENTER.rollDie.size}px`;
    roll.style.height = `${CENTER.rollDie.size}px`;
    const face = s.die ? dieFace(s.die) : null;
    if (face) {
      // The original's die is an image list indexed by the roll, not a static picture.
      const img = el('img', 'btn-art');
      img.src = face;
      img.alt = `Rolled ${s.die}`;
      img.draggable = false;
      roll.append(img);
    } else {
      roll.append(el('div', 'die-face', s.die ? '⚀⚁⚂⚃⚄⚅'[s.die - 1] : '🎲'));
    }
    roll.disabled = busy || !game.canRoll() || !isHuman;
    roll.onclick = () => this.handlers.onRoll();
    roll.title = 'Roll the die (Space)';

    const trade = el('button', 'center-btn');
    trade.style.left = `${CENTER.makeTrade.left}px`;
    trade.style.top = `${CENTER.makeTrade.top}px`;
    trade.style.width = `${CENTER.makeTrade.size}px`;
    trade.style.height = `${CENTER.makeTrade.size}px`;
    const tradeArt = centerImage('makeTrade');
    if (tradeArt) {
      const img = el('img', 'btn-art');
      img.src = tradeArt;
      img.alt = 'Make Trade';
      img.draggable = false;
      trade.append(img);
    } else {
      trade.append(el('div', 'die-face', '🤝'));
    }
    trade.disabled = busy || s.rolled || !isHuman;
    trade.onclick = () => this.handlers.onTrade();
    trade.title = 'Trade projects before rolling (T)';

    const resign = el('button', 'center-btn');
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
      resign.append(el('div', undefined, '📦'));
    }
    resign.disabled = busy || s.rolled || !isHuman;
    resign.onclick = () => this.handlers.onResign();
    resign.title = 'Hand your seat to a computer player (R)';

    this.board.append(
      roll,
      trade,
      resign,
      caption(C.rollDie),
      caption(C.makeTrade),
      caption(C.resign),
      caption(C.ticker),
    );

    this.paintTicker(game);
  }

  /**
   * The Stock Ticker: a raised frame with an inset black readout showing the most recent
   * change to the share price. The original drew this in lime (clLime) with a default
   * caption of '+32', so positive changes are green; negative ones read red here.
   */
  private paintTicker(game: Game): void {
    const F = CENTER.frames.ticker;
    const V = CENTER.tickerValue;

    const frame = el('div', 'bevel');
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
    readout.title = `Share price ${game.state.stock} — last change ${delta >= 0 ? '+' : ''}${delta}`;

    this.board.append(frame, readout);
  }

  /**
   * Player stat rows, laid out on the original's geometry (CENTER.statRows).
   *
   * Each player gets ONE bordered track holding TWO meters stacked one above the other:
   * Boss Rating on top in the player's colour, workload (stress) beneath it in red. The
   * original used a single 136x16 shape per player, so the two meters are 8px halves inside
   * it rather than separate side-by-side bars.
   */
  private paintStats(game: Game): void {
    const G = CENTER.statRows;
    const panel = el('div', 'stats-panel');
    if (assetsAvailable()) panel.style.background = STATS_PANEL_COLOR;
    panel.style.left = `${CENTER.stats.left}px`;
    panel.style.top = `${CENTER.stats.top}px`;
    panel.style.width = `${CENTER.stats.width}px`;
    panel.style.height = `${CENTER.stats.height}px`;

    game.state.players.forEach((p, row) => {
      if (row >= G.barTops.length) return;
      const barTop = G.barTops[row];
      const active = p.id === game.state.current;

      const name = el('div', 'stat-name' + (active ? ' active' : ''), p.name);
      name.style.left = `${G.name.left}px`;
      name.style.top = `${G.nameTops[row]}px`;
      name.style.width = `${G.name.width}px`;
      name.style.height = `${G.name.height}px`;
      name.style.color = p.color;

      const portraitArt = playerPortrait(p.id);
      const portrait = el('div', 'stat-portrait');
      portrait.style.left = `${G.portrait.left}px`;
      portrait.style.top = `${barTop}px`;
      portrait.style.width = `${G.portrait.size}px`;
      portrait.style.height = `${G.portrait.size}px`;
      if (portraitArt) {
        // smallPlayerImage in the original, sourced from playerSmallImageList.
        const img = el('img', 'portrait-art');
        img.src = portraitArt;
        img.alt = p.name;
        img.draggable = false;
        portrait.append(img);
      } else {
        portrait.style.background = p.color;
        portrait.textContent = p.name.slice(0, 1).toUpperCase();
      }
      portrait.title = p.kind === 'computer' ? `${p.name} — computer (${p.personality})` : `${p.name} — human`;

      const track = el('div', 'stat-track');
      track.style.left = `${G.bar.left}px`;
      track.style.top = `${barTop}px`;
      track.style.width = `${G.bar.width}px`;
      track.style.height = `${G.bar.height}px`;

      const stress = game.stress(p.id);
      const brPct = Math.max(0, Math.min(100, (p.bossRating / R.PRESIDENT_THRESHOLD) * 100));
      const stressPct = Math.min(100, (stress / 25) * 100);

      const brFill = el('div', 'meter meter-boss');
      brFill.style.width = `${brPct}%`;
      brFill.style.background = p.color;

      const stFill = el('div', 'meter meter-stress');
      stFill.style.width = `${stressPct}%`;
      stFill.style.background = stress > R.STRESS_SHODDY_THRESHOLD ? '#e0451f' : '#c8342c';

      track.append(brFill, stFill);
      track.title =
        `${p.name}: Boss Rating ${p.bossRating}/${R.PRESIDENT_THRESHOLD} (top), ` +
        `workload ${stress} (bottom) — ${RANKS[p.rank]}, ` +
        `${game.projectsOf(p.id).length} project(s)`;

      const rank = el('div', 'stat-rankbadge', RANK_LETTERS[p.rank]);
      rank.style.left = `${G.rank.left}px`;
      rank.style.top = `${barTop - 1}px`;
      rank.style.width = `${G.rank.width}px`;
      rank.style.height = `${G.rank.height}px`;
      rank.title = RANKS[p.rank];

      panel.append(name, portrait, track, rank);
    });

    this.board.append(panel);
  }

  private paintTokens(s: GameState): void {
    if (this.attract) {
      // Parked in the 3x2 grid the original leaves them in before a game starts.
      const G = CENTER.tokens;
      s.players.forEach((p, i) => {
        const art = playerToken(p.id);
        const col = i % G.perRow;
        const row = Math.floor(i / G.perRow);
        const t = el('div', art ? 'token token-art token-parked' : 'token token-parked');
        t.style.width = `${G.size}px`;
        t.style.height = `${G.size}px`;
        t.style.left = `${G.left + col * G.gapX}px`;
        t.style.top = `${G.top + row * G.gapY}px`;
        if (art) {
          const img = el('img');
          img.src = art;
          img.alt = p.name;
          img.draggable = false;
          t.append(img);
        } else {
          t.style.background = p.color;
          t.textContent = String(p.id + 1);
        }
        t.title = p.name;
        this.board.append(t);
      });
      return;
    }
    const perSquare = new Map<number, number>();
    for (const p of s.players) {
      const slot = perSquare.get(p.square) ?? 0;
      perSquare.set(p.square, slot + 1);
      const sq = SQUARES[p.square];
      const { dx, dy } = tokenOffset(slot);
      const art = playerToken(p.id);
      // player1Image..player6Image are 32x32 TIcons: the actual moving pieces.
      const size = art ? 26 : 22;
      const t = el('div', art ? 'token token-art' : 'token');
      t.style.width = `${size}px`;
      t.style.height = `${size}px`;
      t.style.left = `${sq.left + sq.size / 2 - size / 2 + dx}px`;
      t.style.top = `${sq.top + sq.size / 2 - size / 2 + dy}px`;
      if (art) {
        const img = el('img');
        img.src = art;
        img.alt = p.name;
        img.draggable = false;
        t.append(img);
      } else {
        t.style.background = p.color;
        t.textContent = p.name.slice(0, 1).toUpperCase();
      }
      t.title = `${p.name} — ${RANKS[p.rank]}`;
      this.board.append(t);
    }
  }

  // ------------------------------------------------------------- sidebar

  private renderSide(game: Game): void {
    const s = game.state;
    this.side.textContent = '';

    // Turn card
    const turnCard = el('div', 'card');
    turnCard.append(el('h2', undefined, `Turn ${s.turn}`));
    const line = el('div', 'turn-line');
    const dot = el('span', 'dot');
    dot.style.background = game.active.color;
    line.append(dot, el('span', undefined, game.active.name));
    turnCard.append(line);
    turnCard.append(
      el('div', 'stat-rank', `${RANKS[game.active.rank]} · Boss Rating ${game.active.bossRating}`),
    );

    const row = el('div', 'btn-row');
    row.style.marginTop = '10px';
    const newBtn = el('button', 'b', 'New game');
    newBtn.onclick = () => this.handlers.onNewGame();
    row.append(newBtn);
    turnCard.append(row);


    this.side.append(turnCard);

    // Stock card
    const stockCard = el('div', 'card');
    stockCard.append(el('h2', undefined, 'Share price'));
    const num = el('div', 'stock-num', String(s.stock));
    num.style.color = s.stock >= R.STOCK_START ? '#63c47a' : '#e07a6a';
    stockCard.append(num);
    stockCard.append(this.stockChart(s));
    stockCard.append(
      el(
        'div',
        'stat-rank',
        s.stock <= 20 ? 'Danger: the company disbands at zero.' : 'Rises when projects ship.',
      ),
    );
    this.side.append(stockCard);

    // Log
    const logCard = el('div', 'card');
    logCard.append(el('h2', undefined, 'Log'));
    const log = el('div', 'log');
    for (const entry of [...s.log].reverse().slice(0, 60)) {
      const d = el('div');
      // The original illustrated these moments; show its art beside the entry rather than
      // interrupting play with another dialog.
      const art = entry.art ? eventArt(entry.art) : null;
      if (art) {
        d.classList.add('log-with-art');
        const img = el('img', 'log-art');
        img.src = art;
        img.alt = '';
        img.draggable = false;
        d.append(img);
      }
      if (entry.playerId !== null) {
        const b = el('b', undefined, `${game.player(entry.playerId).name}: `);
        b.style.color = game.player(entry.playerId).color;
        d.append(b);
      }
      d.append(document.createTextNode(entry.text));
      log.append(d);
    }
    logCard.append(log);
    this.side.append(logCard);
  }

  private stockChart(s: GameState): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'stock-chart');
    svg.setAttribute('viewBox', '0 0 200 60');
    svg.setAttribute('preserveAspectRatio', 'none');
    const pts = s.stockHistory.slice(-60);
    if (pts.length > 1) {
      const max = Math.max(...pts.map((p) => p.price), R.STOCK_START);
      const path = pts
        .map((p, i) => {
          const x = (i / (pts.length - 1)) * 200;
          const y = 58 - (p.price / max) * 56;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', path);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', s.stock >= R.STOCK_START ? '#63c47a' : '#e07a6a');
      line.setAttribute('stroke-width', '1.5');
      svg.append(line);
    }
    return svg;
  }

  // ------------------------------------------------------------- modals

  /** Shows a modal. Returns a promise resolving to the chosen value. */
  modal<T>(build: (resolve: (v: T) => void) => HTMLElement): Promise<T> {
    return new Promise<T>((resolve) => {
      const scrim = el('div', 'scrim');
      const done = (v: T) => {
        scrim.remove();
        resolve(v);
      };
      scrim.append(build(done));
      document.body.append(scrim);
      const first = scrim.querySelector<HTMLElement>('button, input, select');
      first?.focus();
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
