import { CENTER, DESIGN_WIDTH, KIND_LABEL, PROFILE_COLORS, SQUARES, tokenOffset } from './board';
import type { Game } from './engine';
import * as R from './rules';
import { RANKS, type GameState, type Player, type Project } from './types';

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
  onRoll(): void;
  onTrade(): void;
  onResign(): void;
  onEndTurn(): void;
  onNewGame(): void;
  onSave(): void;
  onLoad(): void;
}

export class Ui {
  private root: HTMLElement;
  private boardWrap!: HTMLElement;
  private board!: HTMLElement;
  private side!: HTMLElement;
  private handlers: UiHandlers;

  constructor(root: HTMLElement, handlers: UiHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.buildShell();
    window.addEventListener('resize', () => this.scaleBoard());
  }

  private buildShell(): void {
    this.root.textContent = '';
    this.boardWrap = el('div', 'board-wrap');
    this.board = el('div', 'board');
    this.boardWrap.append(this.board);
    this.side = el('div', 'side');
    this.root.append(this.boardWrap, this.side);
    this.scaleBoard();
  }

  /** The board is authored at 776x535 and scaled to fit its container. */
  private scaleBoard(): void {
    const w = this.boardWrap.clientWidth;
    if (!w) return;
    this.board.style.transform = `scale(${w / DESIGN_WIDTH})`;
  }

  render(game: Game): void {
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
        node.textContent = KIND_LABEL[sq.kind];
      }
      this.board.append(node);
    }

    this.paintCenter(game);
    this.paintStats(game);
    this.paintTokens(s);
  }

  private paintProject(node: HTMLElement, proj: Project, game: Game): void {
    const owner = proj.owner === null ? null : game.player(proj.owner);
    const color = owner ? owner.color : '#000';

    const tile = el('div', 'proj-tile');
    tile.style.background = PROFILE_COLORS[proj.profile];

    const name = el('div', 'proj-name', proj.name);
    name.style.color = owner ? owner.color : '#c8ccd2';

    const bar = el('div', 'proj-bar');
    const fill = el('i');
    fill.style.width = `${Math.min(100, (proj.progress / proj.work) * 100)}%`;
    fill.style.background = color === '#000' ? '#666' : color;
    bar.append(fill);

    const meta = el('div', 'proj-meta', `P${proj.profile} · ${proj.progress}/${proj.work}`);

    node.append(tile, name, bar, meta);
    if (proj.shoddy) node.append(el('div', 'proj-shoddy', 'SHODDY'));
  }

  private paintCenter(game: Game): void {
    const s = game.state;
    const busy = !!s.modal || s.phase === 'gameOver';
    const p = game.active;
    const isHuman = p.kind === 'human';

    const roll = el('button', 'center-btn');
    roll.style.left = `${CENTER.rollDie.left}px`;
    roll.style.top = `${CENTER.rollDie.top}px`;
    roll.style.width = `${CENTER.rollDie.size}px`;
    roll.style.height = `${CENTER.rollDie.size}px`;
    const face = el('div', 'die-face', s.die ? '⚀⚁⚂⚃⚄⚅'[s.die - 1] : '🎲');
    roll.append(face, el('div', undefined, game.canRoll() ? 'ROLL' : s.rolled ? 'ROLLED' : 'WAIT'));
    roll.disabled = busy || !game.canRoll() || !isHuman;
    roll.onclick = () => this.handlers.onRoll();
    roll.title = 'Roll the die (Space)';

    const trade = el('button', 'center-btn');
    trade.style.left = `${CENTER.makeTrade.left}px`;
    trade.style.top = `${CENTER.makeTrade.top}px`;
    trade.style.width = `${CENTER.makeTrade.size}px`;
    trade.style.height = `${CENTER.makeTrade.size}px`;
    trade.append(el('div', 'die-face', '🤝'), el('div', undefined, 'TRADE'));
    trade.disabled = busy || s.rolled || !isHuman;
    trade.onclick = () => this.handlers.onTrade();
    trade.title = 'Trade projects before rolling (T)';

    const resign = el('button', 'center-btn');
    resign.style.left = `${CENTER.resign.left}px`;
    resign.style.top = `${CENTER.resign.top}px`;
    resign.style.width = `${CENTER.resign.size}px`;
    resign.style.height = `${CENTER.resign.size}px`;
    resign.textContent = 'RESIGN';
    resign.style.fontSize = '9px';
    resign.disabled = busy || s.rolled || !isHuman;
    resign.onclick = () => this.handlers.onResign();
    resign.title = 'Hand your seat to a computer player (R)';

    this.board.append(roll, trade, resign);
  }

  private paintStats(game: Game): void {
    const panel = el('div', 'stats-panel');
    panel.style.left = `${CENTER.stats.left}px`;
    panel.style.top = `${CENTER.stats.top}px`;
    panel.style.width = `${CENTER.stats.width}px`;
    panel.style.height = `${CENTER.stats.height}px`;

    for (const p of game.state.players) {
      const row = el('div', 'stat-row' + (p.id === game.state.current ? ' active' : ''));
      const head = el('div', 'stat-name');
      const left = el('span', undefined, p.name);
      left.style.color = p.color;
      const right = el('span', undefined, `${p.bossRating}`);
      head.append(left, right);

      const rank = el('div', 'stat-rank', `${RANKS[p.rank]}${p.kind === 'computer' ? ` · ${p.personality}` : ''}`);

      const bars = el('div', 'stat-bars');
      // Boss Rating bar, tinted the player's colour, as in the original stat box.
      const br = el('div', 'stat-bar');
      const brFill = el('i');
      brFill.style.width = `${Math.max(0, Math.min(100, (p.bossRating / R.PRESIDENT_THRESHOLD) * 100))}%`;
      brFill.style.background = p.color;
      br.append(brFill);
      // Stress bar.
      const st = el('div', 'stat-bar');
      const stFill = el('i');
      const stress = game.stress(p.id);
      stFill.style.width = `${Math.min(100, (stress / 25) * 100)}%`;
      stFill.style.background = stress > R.STRESS_SHODDY_THRESHOLD ? '#e0723c' : '#6a7f8f';
      st.append(stFill);
      bars.append(br, st);
      br.title = `Boss Rating ${p.bossRating} / ${R.PRESIDENT_THRESHOLD}`;
      st.title = `Stress ${stress}`;

      const n = game.projectsOf(p.id).length;
      const meta = el('div', 'stat-rank', `${n} project${n === 1 ? '' : 's'} · stress ${stress}`);

      row.append(head, rank, bars, meta);
      panel.append(row);
    }
    this.board.append(panel);
  }

  private paintTokens(s: GameState): void {
    const perSquare = new Map<number, number>();
    for (const p of s.players) {
      const slot = perSquare.get(p.square) ?? 0;
      perSquare.set(p.square, slot + 1);
      const sq = SQUARES[p.square];
      const { dx, dy } = tokenOffset(slot);
      const size = 22;
      const t = el('div', 'token');
      t.style.width = `${size}px`;
      t.style.height = `${size}px`;
      t.style.left = `${sq.left + sq.size / 2 - size / 2 + dx}px`;
      t.style.top = `${sq.top + sq.size / 2 - size / 2 + dy}px`;
      t.style.background = p.color;
      t.textContent = p.name.slice(0, 1).toUpperCase();
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
    const endBtn = el('button', 'b primary', 'End turn');
    endBtn.disabled = !game.turnComplete() || s.phase === 'gameOver';
    endBtn.onclick = () => this.handlers.onEndTurn();
    const newBtn = el('button', 'b', 'New game');
    newBtn.onclick = () => this.handlers.onNewGame();
    row.append(endBtn, newBtn);
    turnCard.append(row);

    const row2 = el('div', 'btn-row');
    row2.style.marginTop = '6px';
    const saveBtn = el('button', 'b', 'Save');
    saveBtn.onclick = () => this.handlers.onSave();
    const loadBtn = el('button', 'b', 'Load');
    loadBtn.onclick = () => this.handlers.onLoad();
    row2.append(saveBtn, loadBtn);
    turnCard.append(row2);
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
