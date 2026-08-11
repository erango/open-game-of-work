import * as AI from './ai';
import { Game, type NewGameConfig, type SeatConfig } from './engine';
import { DEFAULT_NAMES } from './names';
import * as R from './rules';
import { RANKS, type GameLength, type Modal, type Personality, type Project } from './types';
import { Ui, el } from './ui';

const PERSONALITIES: Personality[] = ['evil', 'ambitious', 'goodytwoshoes', 'average'];
const SAVE_KEY = 'open-game-of-work:save';

let game: Game;
let ui: Ui;
/** Guards against re-entrant AI stepping. */
let stepping = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ setup screen

async function askNewGame(): Promise<NewGameConfig | null> {
  const tmp = new Ui(document.createElement('div'), stubHandlers());
  return tmp.modal<NewGameConfig | null>((done) => {
    const m = Ui.modalShell(
      'New Game',
      'Work your way up the company ladder. First to President wins — unless the share price hits zero first, in which case everybody loses.',
    );

    const lenField = el('div', 'field');
    lenField.append(el('label', undefined, 'Game length'));
    const lenSel = el('select');
    (['short', 'medium', 'long'] as GameLength[]).forEach((v) => {
      const o = el('option', undefined, v[0].toUpperCase() + v.slice(1));
      o.value = v;
      lenSel.append(o);
    });
    lenSel.value = 'medium';
    lenSel.style.width = '100%';
    lenSel.className = '';
    Object.assign(lenSel.style, {
      background: 'var(--panel-2)',
      border: '1px solid var(--line)',
      color: 'var(--ink)',
      borderRadius: '5px',
      padding: '7px 9px',
      font: 'inherit',
    });
    lenField.append(lenSel);
    const lenHint = el('div', 'stat-rank');
    const describe = () => {
      const v = lenSel.value as GameLength;
      const st = R.LENGTH_START[v];
      lenHint.textContent = `Everyone starts as ${RANKS[st.rank]} with ${st.bossRating} Boss Rating.`;
    };
    lenSel.onchange = describe;
    describe();
    lenField.append(lenHint);
    m.append(lenField);

    const seatsField = el('div', 'field');
    seatsField.append(el('label', undefined, 'Players (2–6)'));
    const grid = el('div', 'setup-grid');
    const rows: Array<{ kind: HTMLSelectElement; name: HTMLInputElement; pers: HTMLSelectElement }> = [];

    for (let i = 0; i < 6; i++) {
      const seat = el('div', 'seat');
      const swatch = el('div', 'swatch');
      swatch.style.background = R.PLAYER_COLORS[i];

      const name = el('input');
      name.value = DEFAULT_NAMES[i];
      name.maxLength = 14;

      const kind = el('select');
      (['human', 'computer', 'off'] as const).forEach((k) => {
        const o = el('option', undefined, k === 'off' ? 'Off' : k === 'human' ? 'Human' : 'Computer');
        o.value = k;
        kind.append(o);
      });
      kind.value = i === 0 ? 'human' : i < 4 ? 'computer' : 'off';

      const pers = el('select');
      PERSONALITIES.forEach((p) => {
        const o = el('option', undefined, p[0].toUpperCase() + p.slice(1));
        o.value = p;
        pers.append(o);
      });
      pers.value = PERSONALITIES[i % PERSONALITIES.length];

      const sync = () => {
        const off = kind.value === 'off';
        name.disabled = off;
        pers.disabled = off || kind.value === 'human';
        seat.style.opacity = off ? '0.45' : '1';
      };
      kind.onchange = sync;
      sync();

      seat.append(swatch, name, kind, pers);
      grid.append(seat);
      rows.push({ kind, name, pers });
    }
    seatsField.append(grid);
    m.append(seatsField);

    const err = el('div', 'stat-rank');
    err.style.color = '#e07a6a';
    m.append(err);

    const foot = el('div', 'foot');
    const start = el('button', 'b primary', 'Start game');
    start.onclick = () => {
      const seats: SeatConfig[] = rows.map((r) => ({
        kind: r.kind.value as SeatConfig['kind'],
        name: r.name.value.trim(),
        personality: r.pers.value as Personality,
      }));
      const active = seats.filter((s) => s.kind !== 'off').length;
      if (active < 2) {
        err.textContent = 'At least 2 players must be Human or Computer.';
        return;
      }
      done({ length: lenSel.value as GameLength, seats });
    };
    foot.append(start);
    m.append(foot);
    return m;
  });
}

function stubHandlers() {
  return {
    onRoll() {},
    onTrade() {},
    onResign() {},
    onEndTurn() {},
    onNewGame() {},
    onSave() {},
    onLoad() {},
  };
}

// ------------------------------------------------------------------ modal resolution

/**
 * Resolves whatever modal the engine has raised. Human players get a dialog;
 * computer players are decided by ai.ts and shown a brief notice.
 */
async function resolveModal(): Promise<void> {
  const m = game.state.modal;
  if (!m) return;

  switch (m.kind) {
    case 'takeProject':
      await handleTakeProject(m);
      break;
    case 'chance':
      await handleChance(m);
      break;
    case 'scruples':
      await handleScruples(m);
      break;
    case 'meeting':
      await handleMeeting(m);
      break;
    case 'officeParty':
      await handleOfficeParty(m);
      break;
    case 'powerMonger':
      await handlePowerMonger(m);
      break;
    case 'rankChange':
      await handleRankChange(m);
      break;
    case 'trade':
      await handleTrade(m);
      break;
    case 'gameOver':
      await handleGameOver(m);
      return;
    default:
      game.state.modal = null;
  }

  if (game.state.modal === m) game.state.modal = null;
  ui.render(game);
}

async function handleTakeProject(m: Extract<Modal, { kind: 'takeProject' }>): Promise<void> {
  const p = game.player(m.playerId);
  const proj = game.state.projects[m.projectId];
  let accept: boolean;

  if (p.kind === 'computer') {
    accept = AI.decideTakeProject(game, m.playerId, m.projectId);
    await sleep(450);
  } else {
    accept = await ui.modal<boolean>((done) => {
      const d = Ui.modalShell(
        'Unclaimed project',
        `${proj.name} — profile ${proj.profile}, ${proj.work} work to ship`,
      );
      d.append(
        el(
          'p',
          undefined,
          `Nobody owns ${proj.name}. Taking it adds ${proj.profile} to your stress and ${R.COMPLETION_BOSS_RATING[proj.profile]} Boss Rating when it ships.`,
        ),
      );
      d.append(
        el(
          'p',
          undefined,
          `You currently hold ${game.projectsOf(m.playerId).length} project(s) at stress ${game.stress(m.playerId)}. Shoddy work starts above stress ${R.STRESS_SHODDY_THRESHOLD}.`,
        ),
      );
      const foot = el('div', 'foot');
      const no = el('button', 'b', 'Decline');
      no.onclick = () => done(false);
      const yes = el('button', 'b primary', 'Take it on');
      yes.onclick = () => done(true);
      foot.append(no, yes);
      d.append(foot);
      return d;
    });
  }

  game.state.modal = null;
  if (accept) game.takeProject(m.projectId, m.playerId);
  else game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text: `${p.name} declines ${proj.name}.` });
  game.finishWork({ landedOnOther: false, ownProject: accept ? m.projectId : null });
}

async function handleChance(m: Extract<Modal, { kind: 'chance' }>): Promise<void> {
  const text = game.chanceText(m.cardId, m.playerId);
  const p = game.player(m.playerId);

  if (p.kind === 'human') {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell('Chance', `${p.name} draws a chance card`);
      d.append(el('p', undefined, text));
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      ok.onclick = () => done();
      foot.append(ok);
      d.append(foot);
      return d;
    });
  } else {
    game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text });
    await sleep(700);
  }
  game.state.modal = null;
  game.applyChance(m.cardId, m.playerId);
}

async function handleScruples(m: Extract<Modal, { kind: 'scruples' }>): Promise<void> {
  const p = game.player(m.playerId);
  const card = game.scruplesCard(m.cardId);
  const situation = game.scruplesText(m.cardId, m.playerId);
  let choice: number;

  if (p.kind === 'computer') {
    choice = AI.decideScruples(game, m.playerId, m.cardId);
    game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text: situation });
    await sleep(800);
  } else {
    choice = await ui.modal<number>((done) => {
      const d = Ui.modalShell('Scruples', 'Pick an answer — 1, 2 or 3');
      d.append(el('p', undefined, situation));
      card.choices.forEach((c, i) => {
        const b = el('button', 'choice');
        b.append(el('b', undefined, `${i + 1}.`), document.createTextNode(c.label));
        b.onclick = () => done(i);
        d.append(b);
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key >= '1' && e.key <= '3') {
          window.removeEventListener('keydown', onKey);
          done(Number(e.key) - 1);
        }
      };
      window.addEventListener('keydown', onKey);
      return d;
    });
  }

  game.state.modal = null;
  const outcome = game.applyScruples(m.cardId, m.playerId, choice);

  if (p.kind === 'human') {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell('Outcome');
      d.append(el('p', undefined, outcome));
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      ok.onclick = () => done();
      foot.append(ok);
      d.append(foot);
      return d;
    });
  }
}

async function handleMeeting(m: Extract<Modal, { kind: 'meeting' }>): Promise<void> {
  const p = game.player(m.playerId);
  if (p.kind === 'human') {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell('Meeting', 'Time to present');
      d.append(el('p', undefined, m.text));
      const line = el('p');
      line.append(document.createTextNode('Boss Rating '), Ui.delta(m.delta));
      d.append(line);
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      ok.onclick = () => done();
      foot.append(ok);
      d.append(foot);
      return d;
    });
  } else {
    game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text: m.text });
    await sleep(700);
  }
  game.state.modal = null;
  game.applyMeeting(m.playerId, m.delta);
}

async function handleOfficeParty(m: Extract<Modal, { kind: 'officeParty' }>): Promise<void> {
  const anyHuman = game.state.players.some((p) => p.kind === 'human');
  if (anyHuman) {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell('Office Party', 'The whole office attends. The boss is watching.');
      const ul = el('ul');
      for (const line of m.lines) ul.append(el('li', undefined, line));
      d.append(ul);
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      ok.onclick = () => done();
      foot.append(ok);
      d.append(foot);
      return d;
    });
  } else {
    await sleep(600);
  }
  game.state.modal = null;
  game.finishWork({ landedOnOther: false, ownProject: null });
}

async function handleRankChange(m: Extract<Modal, { kind: 'rankChange' }>): Promise<void> {
  const p = game.player(m.playerId);
  const up = m.to > m.from;
  if (p.kind === 'human') {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell(up ? 'Promotion' : 'Demotion');
      d.append(
        el('p', undefined, `${p.name} moves from ${RANKS[m.from]} to ${RANKS[m.to]}.`),
      );
      d.append(
        el(
          'p',
          undefined,
          `Power Monger actions available at this rank: ${R.POWER_MONGER_ACTIONS[m.to]}.`,
        ),
      );
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      ok.onclick = () => done();
      foot.append(ok);
      d.append(foot);
      return d;
    });
  } else {
    await sleep(500);
  }
  game.state.modal = null;
  // The square that triggered this still needs resolving; the engine handles that when
  // the caller continues. Rank changes never terminate a turn on their own.
}

async function handlePowerMonger(m: Extract<Modal, { kind: 'powerMonger' }>): Promise<void> {
  const p = game.player(m.playerId);
  let left = m.actionsLeft;

  while (left > 0) {
    if (p.kind === 'computer') {
      const action = AI.decidePowerMonger(game, m.playerId);
      await sleep(550);
      if (action.kind === 'cancel' && action.projectId !== undefined) {
        game.cancelProject(action.projectId, m.playerId);
      } else if (action.kind === 'assign' && action.projectId !== undefined) {
        game.assignProject(action.projectId, action.targetId ?? m.playerId, m.playerId);
      } else {
        game.state.log.push({
          turn: game.state.turn,
          playerId: m.playerId,
          text: `${p.name} surveys the board from Power Monger and does nothing.`,
        });
      }
      left -= 1;
      ui.render(game);
      continue;
    }

    const done = await powerMongerDialog(m.playerId, left);
    if (done === 'stop') break;
    left -= 1;
    ui.render(game);
  }

  game.state.modal = null;
  game.finishWork({ landedOnOther: false, ownProject: null });
}

type PmResult = 'acted' | 'stop';

function powerMongerDialog(playerId: number, left: number): Promise<PmResult> {
  return ui.modal<PmResult>((done) => {
    const p = game.player(playerId);
    const d = Ui.modalShell(
      'Power Monger',
      `${p.name} — ${RANKS[p.rank]} — ${left} action${left === 1 ? '' : 's'} remaining`,
    );
    d.append(
      el(
        'p',
        undefined,
        'Cancel a project to destroy it outright, or assign a project to move it to any player including yourself.',
      ),
    );

    const actionField = el('div', 'field');
    actionField.append(el('label', undefined, 'Action'));
    const actSel = el('select');
    ['nothing', 'cancel', 'assign'].forEach((k) => {
      const o = el(
        'option',
        undefined,
        k === 'nothing' ? 'Do nothing' : k === 'cancel' ? 'Cancel a project' : 'Assign a project',
      );
      o.value = k;
      actSel.append(o);
    });
    styleControl(actSel);
    actionField.append(actSel);
    d.append(actionField);

    const targetField = el('div', 'field');
    targetField.append(el('label', undefined, 'Assign to'));
    const tgtSel = el('select');
    for (const q of game.state.players) {
      const o = el('option', undefined, q.id === playerId ? `${q.name} (you)` : q.name);
      o.value = String(q.id);
      tgtSel.append(o);
    }
    tgtSel.value = String(playerId);
    styleControl(tgtSel);
    targetField.append(tgtSel);
    d.append(targetField);

    const projField = el('div', 'field');
    projField.append(el('label', undefined, 'Project'));
    const list = el('div', 'plist');
    projField.append(list);
    d.append(projField);

    let selected: number | null = null;

    const rebuild = () => {
      const mode = actSel.value;
      targetField.style.display = mode === 'assign' ? '' : 'none';
      projField.style.display = mode === 'nothing' ? 'none' : '';
      list.textContent = '';
      selected = null;

      const pool: Project[] =
        mode === 'cancel'
          ? game.state.projects.filter((q) => q.owner !== null)
          : game.state.projects.filter((q) => q.owner !== Number(tgtSel.value));

      if (!pool.length) {
        list.append(el('div', 'empty', 'No eligible projects.'));
        return;
      }
      for (const proj of pool) {
        const label = el('label');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'pm-proj';
        radio.value = String(proj.id);
        radio.onchange = () => {
          selected = proj.id;
        };
        const owner = proj.owner === null ? 'unowned' : game.player(proj.owner).name;
        label.append(
          radio,
          document.createTextNode(
            `${proj.name} · P${proj.profile} · ${proj.progress}/${proj.work} · ${owner}`,
          ),
        );
        list.append(label);
      }
    };
    actSel.onchange = rebuild;
    tgtSel.onchange = rebuild;
    rebuild();

    const err = el('div', 'stat-rank');
    err.style.color = '#e07a6a';
    d.append(err);

    const foot = el('div', 'foot');
    const skip = el('button', 'b', 'Stop using actions');
    skip.onclick = () => done('stop');
    const go = el('button', 'b primary', 'Do it');
    go.onclick = () => {
      const mode = actSel.value;
      if (mode === 'nothing') {
        game.state.log.push({
          turn: game.state.turn,
          playerId,
          text: `${p.name} declines to use a Power Monger action.`,
        });
        done('acted');
        return;
      }
      if (selected === null) {
        err.textContent = 'Pick a project first.';
        return;
      }
      if (mode === 'cancel') game.cancelProject(selected, playerId);
      else game.assignProject(selected, Number(tgtSel.value), playerId);
      done('acted');
    };
    foot.append(skip, go);
    d.append(foot);
    return d;
  });
}

function styleControl(n: HTMLElement): void {
  Object.assign(n.style, {
    background: 'var(--panel-2)',
    border: '1px solid var(--line)',
    color: 'var(--ink)',
    borderRadius: '5px',
    padding: '7px 9px',
    font: 'inherit',
    width: '100%',
  });
}

// ------------------------------------------------------------------ trading

async function handleTrade(m: Extract<Modal, { kind: 'trade' }>): Promise<void> {
  const offer = await tradeDialog(m.from);
  game.state.modal = null;
  if (!offer) return;

  const accepted = await askAccept(m.from, offer.toId, offer.give, offer.want);
  if (accepted) game.executeTrade(m.from, offer.toId, offer.give, offer.want);
  else game.declineTrade(m.from, offer.toId);
}

interface Offer {
  toId: number;
  give: number[];
  want: number[];
}

function tradeDialog(fromId: number): Promise<Offer | null> {
  return ui.modal<Offer | null>((done) => {
    const d = Ui.modalShell(
      'Trade projects',
      'Offer projects you own for projects held by another player.',
    );

    const targetField = el('div', 'field');
    targetField.append(el('label', undefined, 'Trade with'));
    const tgt = el('select');
    for (const q of game.state.players) {
      if (q.id === fromId) continue;
      const o = el('option', undefined, q.name);
      o.value = String(q.id);
      tgt.append(o);
    }
    styleControl(tgt);
    targetField.append(tgt);
    d.append(targetField);

    const cols = el('div', 'trade-cols');
    const giveCol = el('div');
    giveCol.append(el('label', undefined, 'You give'));
    const giveList = el('div', 'plist');
    giveCol.append(giveList);
    const wantCol = el('div');
    wantCol.append(el('label', undefined, 'You want'));
    const wantList = el('div', 'plist');
    wantCol.append(wantList);
    cols.append(giveCol, wantCol);
    d.append(cols);

    const fill = (list: HTMLElement, projects: Project[]) => {
      list.textContent = '';
      if (!projects.length) {
        list.append(el('div', 'empty', 'Nothing available.'));
        return;
      }
      for (const proj of projects) {
        const label = el('label');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.value = String(proj.id);
        label.append(
          cb,
          document.createTextNode(`${proj.name} · P${proj.profile} · ${proj.progress}/${proj.work}`),
        );
        list.append(label);
      }
    };

    const rebuild = () => {
      fill(giveList, game.projectsOf(fromId));
      fill(wantList, game.projectsOf(Number(tgt.value)));
    };
    tgt.onchange = rebuild;
    rebuild();

    const err = el('div', 'stat-rank');
    err.style.color = '#e07a6a';
    d.append(err);

    const collect = (list: HTMLElement) =>
      [...list.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => Number(i.value));

    const foot = el('div', 'foot');
    const cancel = el('button', 'b', 'Cancel');
    cancel.onclick = () => done(null);
    const send = el('button', 'b primary', 'Offer trade');
    send.onclick = () => {
      const give = collect(giveList);
      const want = collect(wantList);
      if (!give.length && !want.length) {
        err.textContent = 'Select at least one project on either side.';
        return;
      }
      done({ toId: Number(tgt.value), give, want });
    };
    foot.append(cancel, send);
    d.append(foot);
    return d;
  });
}

async function askAccept(fromId: number, toId: number, give: number[], want: number[]): Promise<boolean> {
  const to = game.player(toId);
  const from = game.player(fromId);
  const names = (ids: number[]) =>
    ids.map((i) => game.state.projects[i].name).join(', ') || 'nothing';

  if (to.kind === 'computer') {
    await sleep(600);
    return AI.decideAcceptTrade(game, toId, fromId, give, want);
  }

  return ui.modal<boolean>((done) => {
    const d = Ui.modalShell('Trade offer', `${from.name} offers ${to.name} a trade`);
    d.append(el('p', undefined, `${to.name} would receive: ${names(give)}`));
    d.append(el('p', undefined, `${to.name} would give up: ${names(want)}`));
    const foot = el('div', 'foot');
    const no = el('button', 'b', 'Decline');
    no.onclick = () => done(false);
    const yes = el('button', 'b primary', 'Accept');
    yes.onclick = () => done(true);
    foot.append(no, yes);
    d.append(foot);
    return d;
  });
}

async function handleGameOver(m: Extract<Modal, { kind: 'gameOver' }>): Promise<void> {
  await ui.modal<void>((done) => {
    const d = Ui.modalShell(game.state.winner !== null ? 'President' : 'Company disbanded');
    d.append(el('p', undefined, m.text));
    const ul = el('ul');
    const ranked = [...game.state.players].sort((a, b) => b.bossRating - a.bossRating);
    for (const p of ranked) {
      ul.append(
        el('li', undefined, `${p.name} — ${RANKS[p.rank]}, Boss Rating ${p.bossRating}`),
      );
    }
    d.append(el('div', 'sub', `Finished on turn ${game.state.turn}.`), ul);
    const foot = el('div', 'foot');
    const again = el('button', 'b primary', 'New game');
    again.onclick = () => {
      done();
      void newGame();
    };
    foot.append(again);
    d.append(foot);
    return d;
  });
}

// ------------------------------------------------------------------ loop

/** Drives the game forward: resolves modals, then plays AI turns automatically. */
async function step(): Promise<void> {
  if (stepping) return;
  stepping = true;
  try {
    // Keep resolving until we are waiting on a human.
    for (let guard = 0; guard < 500; guard++) {
      ui.render(game);

      if (game.state.phase === 'gameOver') {
        if (game.state.modal?.kind === 'gameOver') await resolveModal();
        return;
      }

      if (game.state.modal) {
        await resolveModal();
        continue;
      }

      const p = game.active;

      if (game.turnComplete()) {
        if (p.kind === 'computer') {
          await sleep(400);
          game.endTurn();
          continue;
        }
        return; // human presses End turn
      }

      if (p.kind === 'computer') {
        // AI may propose a trade before rolling.
        const offer = AI.decideProposeTrade(game, p.id);
        if (offer) {
          const ok = await askAccept(p.id, offer.toId, offer.give, offer.want);
          if (ok) game.executeTrade(p.id, offer.toId, offer.give, offer.want);
          else game.declineTrade(p.id, offer.toId);
          ui.render(game);
        }
        await sleep(500);
        game.roll();
        continue;
      }

      return; // human's move
    }
  } finally {
    stepping = false;
    ui.render(game);
  }
}

// ------------------------------------------------------------------ wiring

function handlers() {
  return {
    onRoll() {
      if (!game.canRoll()) return;
      game.roll();
      void step();
    },
    onTrade() {
      if (game.state.rolled || game.state.modal) return;
      game.state.modal = { kind: 'trade', from: game.state.current };
      void step();
    },
    onResign() {
      const p = game.active;
      if (p.kind !== 'human' || game.state.rolled) return;
      if (!confirm(`${p.name} resigns and hands the seat to a computer player. Continue?`)) return;
      game.resign(p.id);
      void step();
    },
    onEndTurn() {
      game.endTurn();
      void step();
    },
    onNewGame() {
      void newGame();
    },
    onSave() {
      localStorage.setItem(SAVE_KEY, game.serialize());
      alert('Game saved to this browser.');
    },
    onLoad() {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) {
        alert('No saved game found.');
        return;
      }
      game = Game.deserialize(json);
      void step();
    },
  };
}

async function newGame(): Promise<void> {
  const config = await askNewGame();
  if (!config) return;
  game = new Game(config);
  game.state.log.push({
    turn: 1,
    playerId: null,
    text: `A ${config.length} game begins with ${game.state.players.length} players. First to President wins.`,
  });
  void step();
}

function bindKeys(): void {
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.scrim')) return; // a modal owns the keyboard
    const p = game?.active;
    if (!p || p.kind !== 'human') return;
    if (e.key === ' ') {
      e.preventDefault();
      handlers().onRoll();
    } else if (e.key === 't' || e.key === 'T') {
      handlers().onTrade();
    } else if (e.key === 'r' || e.key === 'R') {
      handlers().onResign();
    } else if (e.key === 'Enter' && game.turnComplete()) {
      handlers().onEndTurn();
    }
  });
}

function boot(): void {
  const root = document.getElementById('app')!;
  ui = new Ui(root, handlers());
  bindKeys();
  void newGame();
}

boot();
