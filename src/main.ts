import * as AI from './ai';
import { aboutImage, applyFavicon, eventArt, graphicsMode, loadAssets, partySprite, presidentArt, rankArt, resourceImage, seatFace, splashImage, type PartyMood } from './assets';
import { deckMode, initDecks, originalAvailable, setDeckMode, type DeckMode } from './decks';
import { applyPaletteEarly, availableThemes, initTheme, setTheme, themeBlurb, themeDeck, themeLabel, themeName, themeNames, type ThemeName } from './theme';
import { loadScores, record, saveScores, TABLE_SIZE, type HighScores } from './highscores';
import { loadHelp, originalHelpAvailable, topics as helpTopics } from './help';
import { Game, type NewGameConfig, type SeatConfig } from './engine';
import { DEFAULT_NAMES, setNameStyle } from './names';
import * as R from './rules';
import { squareIcon } from './icons';
import { PERSONALITIES, RANKS, type GameLength, type Modal, type PersonalityChoice, type Project, type SquareKind } from './types';
import { Sound, type Cue } from './sound';
import { initTooltips, tip } from './tooltip';
import { Ui, el } from './ui';

const SAVE_KEY = 'open-game-of-work:save';

let game: Game;
let ui: Ui;
const sound = new Sound();
let scores: HighScores = loadScores();
/**
 * Nearest-neighbour vs smoothed scaling for the original art. Nearest keeps the era
 * pixels crisp when the board is scaled up; smoothing suits very large displays where the
 * blocks get distracting.
 */
/**
 * Nearest-neighbour scaling belongs to the original artwork and to nothing else.
 *
 * It was a user setting, which was the wrong shape for it: the original's tiles are 81px era
 * pixel art and blur when smoothed, while the generated illustrations are drawn at 3x and go
 * blocky when they are *not*. Neither is a preference — each set has one correct answer, so
 * this follows the artwork.
 */
function applySmoothing(): void {
  document.documentElement.classList.toggle('art-crisp', graphicsMode() === 'original');
}

/**
 * A light sweep across the screen, to cover the moment the whole look changes.
 *
 * Every colour, every tile and the music all change at once, which is abrupt enough to read as
 * a glitch. The swap happens mid-sweep, behind the bright part of the band, so what you see is
 * one transition rather than a dozen simultaneous ones. Skipped under
 * `prefers-reduced-motion`, where the swap is immediate instead.
 */
const WIPE_MS = 520;
/** How far into the sweep the swap happens: just as the bright edge crosses the middle. */
const WIPE_SWAP_MS = 190;

function themeWipe(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const layer = el('div', 'theme-wipe');
  document.body.append(layer);
  const done = () => layer.remove();
  layer.addEventListener('animationend', done, { once: true });
  // Belt and braces: an interrupted animation must not leave the layer over the board.
  window.setTimeout(done, WIPE_MS + 400);
  return true;
}

/**
 * Applies a theme completely: palette, artwork, favicon, scaling mode and music.
 *
 * Everything that switches theme goes through here. It was three call sites doing three
 * different subsets — the New Game picker changed the palette and re-rendered but left the
 * music and the crisp-rendering class on the previous theme's settings.
 *
 * `after` runs once the swap has landed, since a caller that reflects the current theme in its
 * own controls has to update after it changes, not before.
 */
function applyTheme(next: ThemeName, after?: () => void): void {
  const swap = () => {
    const applied = setTheme(next);
    // The pack that goes with the look. setDeckMode falls back on its own when the original
    // deck is not installed, and New Game can still change it afterwards.
    setDeckMode(themeDeck(applied));
    /*
     * Project names follow the look too — Casual Postcard in the office themes, Cached Cronjob
     * under cyberpunk. Names are drawn when a project is created, so this takes effect on the
     * next game rather than renaming the board underneath a game in progress.
     */
    setNameStyle(themeNames(applied));
    applyFavicon();
    applySmoothing();
    void sound.retheme();
    sound.warmScenes();
    ui.render(game);
    after?.();
  };
  if (themeWipe()) window.setTimeout(swap, WIPE_SWAP_MS);
  else swap();
}

/** Guards against re-entrant AI stepping. */
let stepping = false;
/** Set when a roll has just happened, so the die tumbles once before the token moves. */
let pendingTumble = false;
/** False until a real game exists, so Cancel knows whether there is anything to return to. */
let hasGame = false;

/** Frames and pacing for the tumble. */
const TUMBLE_FRAMES = 7;
const TUMBLE_MS = 65;

/**
 * Cycles the die through random faces before settling on the rolled one.
 *
 * The original's die is an image list indexed by the roll, and showing only the final face
 * made the roll read as instant. Faces here come from Math.random deliberately: this is
 * presentation, so it must not draw on the engine's seeded stream and disturb replays.
 */
async function tumbleDie(): Promise<void> {
  for (let i = 0; i < TUMBLE_FRAMES; i++) {
    ui.setDieFace(1 + Math.floor(Math.random() * 6));
    ui.render(game);
    await sleep(TUMBLE_MS);
  }
  ui.setDieFace(null);
  ui.render(game);
  await sleep(120);
}
/** `${turn}:${playerId}` of the last turn announced, so it fires once per turn. */
let announced = '';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Auto Click settings, mirroring the original's Options -> AutoClicking dialog: separate
 * enable flags and 0-9 second delays for human and computer players. The original defaulted
 * its spinners to 5 seconds. Both start disabled here so decisions are read at your own
 * pace; turn the computer side on to let AI turns flow without clicking.
 */
interface AutoClick {
  human: boolean;
  humanSeconds: number;
  computer: boolean;
  computerSeconds: number;
}

const autoClick: AutoClick = loadAutoClick();

function loadAutoClick(): AutoClick {
  const fallback: AutoClick = { human: false, humanSeconds: 5, computer: false, computerSeconds: 5 };
  try {
    const raw = localStorage.getItem('ogow:autoclick');
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<AutoClick>) } : fallback;
  } catch {
    return fallback;
  }
}

function saveAutoClick(): void {
  localStorage.setItem('ogow:autoclick', JSON.stringify(autoClick));
}

/** Milliseconds to auto-dismiss a dialog for this player, or 0 to wait for a click. */
function autoCloseMs(isComputer: boolean): number {
  if (isComputer) return autoClick.computer ? autoClick.computerSeconds * 1000 : 0;
  return autoClick.human ? autoClick.humanSeconds * 1000 : 0;
}

/**
 * Wires a dialog's confirm button to fire on its own after the configured delay.
 * Returns a cleanup function the caller runs once the dialog closes.
 */
function armAutoClose(button: HTMLButtonElement, isComputer: boolean, fire: () => void): () => void {
  const ms = autoCloseMs(isComputer);
  if (ms <= 0) return () => {};
  const original = button.textContent ?? 'Continue';
  let left = Math.ceil(ms / 1000);
  button.textContent = `${original} (${left})`;
  const tick = window.setInterval(() => {
    left -= 1;
    button.textContent = left > 0 ? `${original} (${left})` : original;
  }, 1000);
  const timer = window.setTimeout(() => {
    window.clearInterval(tick);
    fire();
  }, ms);
  return () => {
    window.clearInterval(tick);
    window.clearTimeout(timer);
  };
}

/** Heads a dialog with one of the original's event illustrations, when it is installed. */
function headArt(d: HTMLElement, name: string | null, alt: string): void {
  const src = name ? eventArt(name) : null;
  if (!src) return;
  const img = el('img', 'event-art');
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  d.append(img);
}

/** Subtitle marking a dialog as an AI decision the player is watching, not making. */
function aiSubtitle(name: string, what: string): string {
  return `${name} is deciding — ${what}. You can read the choice but not change it.`;
}

/**
 * Delay per square while the token walks the board. The original animated movement — its
 * rules text says a game can be aborted "while a player is rolling or moving" — but the
 * exact cadence is not recoverable, so this is chosen to read clearly without dragging.
 */
const STEP_MS = 165;
/** Beat between the token stopping and the result appearing. */
const REVEAL_MS = 260;
/** Pause after a human's turn resolves, before play passes on. */
const END_TURN_MS = 520;

// ------------------------------------------------------------------ setup screen

async function askNewGame(): Promise<NewGameConfig | null> {
  const tmp = new Ui(document.createElement('div'), stubHandlers());
  return tmp.modal<NewGameConfig | null>((done) => {
    const m = el('div', 'modal');

    // The original puts a round red ? in the corner of this window rather than among the
    // buttons, so the heading is a row with the affordance at its end.
    const head = el('div', 'modal-head');
    const headText = el('div');
    headText.append(
      el('h3', undefined, 'New Game'),
      el(
        'div',
        'sub',
        'Work your way up the company ladder. First to President wins — unless the share price hits zero first, in which case everybody loses.',
      ),
    );
    const helpBtn = el('button', 'b help-mark', '?');
    helpBtn.type = 'button';
    tip(helpBtn, 'How to Play');
    helpBtn.onclick = () => void helpDialog();
    head.append(headText, helpBtn);
    m.append(head);

    // Length and deck are both single-line choices, so they share one row and leave the
    // seats — the only part that needs the height — the rest of the dialog.
    const topRow = el('div', 'two-up');

    const lenField = el('div', 'field');
    lenField.append(el('label', undefined, 'Game length'));
    const lenSel = el('select');
    (['short', 'medium', 'long'] as GameLength[]).forEach((v) => {
      const o = el('option', undefined, v[0].toUpperCase() + v.slice(1));
      o.value = v;
      lenSel.append(o);
    });
    // The original defaults to Long: gameLengthRadioGroup.ItemIndex is 2 over
    // ('Short', 'Medium', 'Long').
    lenSel.value = 'long';
    lenField.append(lenSel);
    const lenHint = el('div', 'hint-line');
    const describe = () => {
      const v = lenSel.value as GameLength;
      const st = R.LENGTH_START[v];
      lenHint.textContent = `Everyone starts as ${RANKS[st.rank]} with ${st.bossRating} Boss Rating.`;
    };
    lenSel.onchange = describe;
    describe();
    lenField.append(lenHint);
    topRow.append(lenField);

    // Deck picker. The original text is not distributed with this repo, so the original and
    // combined options only appear when a local extraction is installed.
    const deckField = el('div', 'field');
    deckField.append(el('label', undefined, 'Chance & Scruples deck'));
    const deckSel = el('select');
    const deckOpts: Array<[DeckMode, string]> = originalAvailable()
      ? [
          ['new', 'Newly written'],
          ['neon', 'Newly written — cyberpunk'],
          ['original', 'Original 2000 deck'],
          ['both', 'All three, shuffled'],
        ]
      : [
          ['new', 'Newly written'],
          ['neon', 'Newly written — cyberpunk'],
        ];
    for (const [v, label] of deckOpts) {
      const o = el('option', undefined, label);
      o.value = v;
      deckSel.append(o);
    }
    deckSel.value = deckMode();
    deckField.append(deckSel);
    deckField.append(
      el(
        'div',
        'hint-line',
        originalAvailable()
          ? 'Two packs are written for this port, in different voices and the same numeric ranges. The original deck brings its own wording and card art; its numeric effects were compiled into code, so this port infers them.'
          : 'Two packs are written for this port, in different voices and the same numeric ranges. Run tools/extract-assets.py against your own copy of gamework.exe to add the original deck.',
      ),
    );
    topRow.append(deckField);
    m.append(topRow);

    /*
     * Theme belongs here as well as in Options: this is the window you are looking at before
     * the board exists, and it is the one place someone starting their first game is certain
     * to see. It applies immediately rather than on Start, so the choice can be judged against
     * the dialog it is sitting in.
     */
    const themeField = el('div', 'field');
    themeField.append(el('label', undefined, 'Theme'));
    const themeBlurbLine = el('div', 'hint-line');
    const themeSeg = el('div', 'segmented theme-seg');
    themeSeg.setAttribute('role', 'radiogroup');
    themeSeg.setAttribute('aria-label', 'Theme');
    /*
     * A theme change swaps the seat artwork too, and these rows are built once when the dialog
     * opens — so each row's sync is collected here and re-run. Without it the seat art stayed
     * on the previous theme's set until the dialog was reopened.
     */
    const seatSyncs: Array<() => void> = [];
    const themeButtons = availableThemes().map((name) => {
      const b = el('button', 'segment', themeLabel(name));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      tip(b, themeBlurb(name));
      b.onclick = () => applyTheme(name, syncTheme);
      themeSeg.append(b);
      return [name, b] as const;
    });
    const syncTheme = () => {
      for (const [name, b] of themeButtons) {
        const on = themeName() === name;
        b.classList.toggle('segment-on', on);
        b.setAttribute('aria-checked', String(on));
      }
      themeBlurbLine.textContent = themeBlurb(themeName());
      // A theme brings its own pack, so the select has to show what the theme just chose.
      // Changing it afterwards still wins — until the theme changes again.
      deckSel.value = deckMode();
      for (const sync of seatSyncs) sync();
    };
    syncTheme();
    themeField.append(themeSeg, themeBlurbLine);
    m.append(themeField);

    const seatsField = el('div', 'field');
    const seatsHead = el('div', 'seats-head');
    seatsHead.append(el('label', undefined, 'Players (2–6)'));
    const seatsCount = el('span', 'seats-count');
    seatsHead.append(seatsCount);
    seatsField.append(seatsHead);

    const grid = el('div', 'setup-grid');
    const rows: Array<{ kind: HTMLSelectElement; name: HTMLInputElement; pers: HTMLSelectElement }> = [];

    const KINDS = ['human', 'computer', 'off'] as const;
    type SeatKind = (typeof KINDS)[number];
    // 'Cpu' rather than 'Computer': three segments share 132px, and the long word does not
    // fit without shrinking the type below the rest of the dialog.
    const SEG_LABEL: Record<SeatKind, string> = { human: 'Human', computer: 'Cpu', off: 'Off' };
    const WORD: Record<SeatKind, string> = { human: 'Human', computer: 'Computer', off: 'Off' };

    const updateCount = () => {
      const n = rows.filter((r) => r.kind.value !== 'off').length;
      seatsCount.textContent = `${n} of 6 filled`;
    };

    for (let i = 0; i < 6; i++) {
      const seat = el('div', 'seat');

      // The seat's identity column: its colour as a bar down the edge, then the artwork.
      const idCol = el('div', 'seat-id');
      const bar = el('div', 'seat-bar');
      bar.style.background = R.PLAYER_COLORS[i];
      const faceImg = el('img', 'seat-face');
      faceImg.draggable = false;
      // Native size. The original art is 64px and resampling it to fit a smaller row was
      // what made it illegible.
      faceImg.width = 64;
      faceImg.height = 64;
      idCol.append(bar, faceImg);

      /**
       * Seat type lives in a detached <select>, which stays the single source of truth and
       * keeps the existing change-event plumbing; the visible control is a three-state
       * segmented switch, so the current type is readable without clicking through it.
       */
      const kind = el('select');
      KINDS.forEach((k) => {
        const o = el('option', undefined, WORD[k]);
        o.value = k;
        kind.append(o);
      });
      kind.value = i === 0 ? 'human' : i < 4 ? 'computer' : 'off';

      const seg = el('div', 'segmented seat-seg');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', `Seat ${i + 1} type`);
      const segBtns = KINDS.map((k) => {
        const b = el('button', 'segment', SEG_LABEL[k]);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        tip(b, WORD[k]);
        b.onclick = () => {
          if (kind.value === k) return;
          kind.value = k;
          kind.dispatchEvent(new Event('change'));
        };
        seg.append(b);
        return b;
      });

      const name = el('input', 'seat-name-input');
      name.value = DEFAULT_NAMES[i];
      name.maxLength = 14;
      name.setAttribute('aria-label', `Seat ${i + 1} name`);

      const pers = el('select');
      pers.setAttribute('aria-label', `Seat ${i + 1} personality`);
      const choices: PersonalityChoice[] = ['random', ...PERSONALITIES];
      choices.forEach((pc) => {
        const o = el('option', undefined, pc[0].toUpperCase() + pc.slice(1));
        o.value = pc;
        pers.append(o);
      });
      // Random by default, so a fresh game is not the same four opponents every time.
      pers.value = 'random';

      const sync = () => {
        const k = kind.value as SeatKind;
        const src = seatFace(k);
        faceImg.style.display = src ? '' : 'none';
        if (src) faceImg.src = src;
        faceImg.alt = '';
        segBtns.forEach((b, j) => {
          const on = KINDS[j] === k;
          b.classList.toggle('segment-on', on);
          b.setAttribute('aria-checked', String(on));
        });
        // An empty seat dims its own row rather than the whole control: the name and
        // personality still have to be readable when you turn the seat back on.
        const off = k === 'off';
        seat.classList.toggle('seat-off', off);
        name.disabled = off;
        pers.disabled = off || k === 'human';
        bar.style.opacity = off ? '0.35' : '1';
        updateCount();
      };

      seatSyncs.push(sync);

      // One handler, so the order of side effects is explicit.
      kind.addEventListener('change', () => {
        sound.seatChanged(kind.value as SeatKind);
        sync();
      });

      seat.append(idCol, seg, name, pers);
      grid.append(seat);
      rows.push({ kind, name, pers });
      sync();
    }
    seatsField.append(grid);
    m.append(seatsField);

    const err = el('div', 'hint-line');
    err.style.color = 'var(--danger-2)';
    m.append(err);

    const foot = el('div', 'foot');

    // Escape cancels, as it would in the original's dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      window.removeEventListener('keydown', onKey);
      done(null);
    };
    window.addEventListener('keydown', onKey);

    const cancel = el('button', 'b', 'Cancel');
    cancel.onclick = () => {
      window.removeEventListener('keydown', onKey);
      done(null);
    };
    const start = el('button', 'b primary', 'Start game');
    start.onclick = () => {
      const seats: SeatConfig[] = rows.map((r) => ({
        kind: r.kind.value as SeatConfig['kind'],
        name: r.name.value.trim(),
        personality: r.pers.value as PersonalityChoice,
      }));
      const active = seats.filter((s) => s.kind !== 'off').length;
      if (active < 2) {
        err.textContent = 'At least 2 players must be Human or Computer.';
        return;
      }
      setDeckMode(deckSel.value as DeckMode);
      window.removeEventListener('keydown', onKey);
      done({ length: lenSel.value as GameLength, seats });
    };
    foot.append(cancel, start);
    m.append(foot);
    return m;
  });
}

/**
 * Confirms a resignation.
 *
 * This was a native `confirm()`, which is the one dialog the game did not draw: unstyled,
 * unthemed, and blocking. It also cannot be dismissed like the others, which is how it went
 * unnoticed — nothing else in the game behaves that way.
 */
async function askResign(): Promise<void> {
  const p = game.active;
  if (p.kind !== 'human' || game.state.rolled) return;
  const go = await ui.modal<boolean>((done) => {
    const d = Ui.modalShell('Resign', `${p.name} hands the seat to a computer player.`);
    d.prepend(cardHead('home', 'Resign', whoLine(p.name)));
    d.append(
      el(
        'p',
        undefined,
        'The seat keeps its projects, its Boss Rating and its rank — a computer player takes over ' +
          'from here, and the game carries on without you.',
      ),
    );
    const foot = el('div', 'foot');
    const cancel = el('button', 'b', 'Keep playing');
    cancel.onclick = () => done(false);
    const yes = el('button', 'b primary', 'Resign');
    yes.onclick = () => done(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      window.removeEventListener('keydown', onKey);
      done(false);
    };
    window.addEventListener('keydown', onKey);
    foot.append(cancel, yes);
    d.append(foot);
    return d;
  });
  if (!go) return;
  game.resign(p.id);
  void step();
}

/** Options -> Auto Click, mirroring the original's TAUTOCLICKFORM. */
async function askAutoClick(): Promise<void> {
  await ui.modal<void>((done) => {
    const d = Ui.modalShell('Auto Click Options', 'Close popup windows automatically?');
    const rows: Array<[string, 'human' | 'computer']> = [
      ['Human players', 'human'],
      ['Computer players', 'computer'],
    ];
    for (const [label, key] of rows) {
      const row = el('div', 'seat');
      row.style.gridTemplateColumns = '20px 1fr 70px';
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = autoClick[key];
      const secs = el('input');
      secs.type = 'number';
      secs.min = '0';
      secs.max = '9';
      secs.value = String(autoClick[key === 'human' ? 'humanSeconds' : 'computerSeconds']);
      cb.onchange = () => {
        autoClick[key] = cb.checked;
      };
      secs.onchange = () => {
        const v = Math.max(0, Math.min(9, Number(secs.value) || 0));
        secs.value = String(v);
        if (key === 'human') autoClick.humanSeconds = v;
        else autoClick.computerSeconds = v;
      };
      row.append(cb, el('span', undefined, `${label} — seconds`), secs);
      d.append(row);
    }
    d.append(
      el(
        'p',
        'stat-rank',
        'With a box ticked, that side\u2019s dialogs dismiss themselves after the given number of seconds. Leave both off to click through every result yourself.',
      ),
    );
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'OK');
    ok.onclick = () => {
      saveAutoClick();
      done();
    };
    foot.append(ok);
    d.append(foot);
    return d;
  });
}

function stubHandlers() {
  return {
    onGraphicsChanged() {},
    onPickTheme() {},
    onToggleSound() {},
    onToggleMusic() {},
    musicOn() {
      return sound.musicOn;
    },
    onAutoClick() {},
    onHighScores() {},
    onHelp() {},
    onStockChart() {},
    onAbout() {},
    soundOn() {
      return false;
    },
    onRoll() {},
    onTrade() {},
    onResign() {},
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
/**
 * Head row for the dialogs that resolve a board square: the square's own icon at 20px, the
 * kicker naming it, and who it is happening to. Prepended above the title, so the dialog
 * says which square it came from before it says what happened.
 */
function cardHead(kind: SquareKind, kicker: string, who: string): HTMLElement {
  const row = el('div', 'card-head-row');
  const markup = squareIcon(kind, 20);
  if (markup) {
    const icon = el('div', 'sq-icon');
    icon.innerHTML = markup;
    row.append(icon);
  }
  row.append(el('span', 'card-kicker', kicker), el('span', 'card-meta', who));
  return row;
}

/** `<player> \u00b7 turn <n>`, the right-hand half of every card head. */
function whoLine(name: string): string {
  return `${name} \u00b7 turn ${game.state.turn}`;
}

/** A numbered answer button. The numeral is a chip, so the keyboard shortcut is visible. */
function choiceButton(n: number, label: string, extra = ''): HTMLButtonElement {
  const b = el('button', `choice${extra ? ` ${extra}` : ''}`);
  b.type = 'button';
  b.append(el('span', 'choice-num', String(n)), el('span', undefined, label));
  return b;
}

async function resolveModal(): Promise<void> {
  const m = game.state.modal;
  if (!m) return;

  switch (m.kind) {
    case 'takeProject':
      await handleTakeProject(m);
      break;
    case 'chance':
      sound.play('chance');
      await handleChance(m);
      break;
    case 'scruples':
      sound.play('scruples');
      await handleScruples(m);
      break;
    case 'meeting':
      sound.play(m.delta >= 0 ? 'meetingGood' : m.delta <= -10 ? 'meetingTerrible' : 'meetingBad');
      await handleMeeting(m);
      break;
    case 'officeParty':
      sound.play('officeParty');
      // The original shipped a .mid for the party and nothing else; playTrack prefers the
      // theme's own party recording and falls back to that .mid.
      void sound.playTrack('party');
      await handleOfficeParty(m);
      void sound.playTrack('play');
      break;
    case 'powerMonger':
      sound.play('powerMonger');
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
  const isAi = p.kind === 'computer';
  // Decide first, so the dialog can present the AI's answer as already made.
  const aiChoice = isAi ? AI.decideTakeProject(game, m.playerId, m.projectId) : null;

  const accept = await ui.modal<boolean>((done) => {
    const d = Ui.modalShell(
      'Unclaimed project',
      isAi
        ? aiSubtitle(p.name, `whether to take on ${proj.name}`)
        : `${proj.name} — profile ${proj.profile}, ${proj.work} work to ship`,
    );
    d.prepend(cardHead('project', 'Unclaimed project', whoLine(p.name)));
    d.append(
      el(
        'p',
        undefined,
        `Nobody owns ${proj.name} (profile ${proj.profile}). Taking it adds ${proj.profile} to stress and pays ${R.COMPLETION_BOSS_RATING[proj.profile]} Boss Rating when it ships.`,
      ),
    );
    d.append(
      el(
        'p',
        undefined,
        `${isAi ? p.name : 'You'} currently hold ${game.projectsOf(m.playerId).length} project(s) at stress ${game.stress(m.playerId)}. Shoddy work starts above stress ${R.STRESS_SHODDY_THRESHOLD}.`,
      ),
    );
    if (isAi) {
      d.append(
        el('p', 'ai-verdict', `${p.name} decides to ${aiChoice ? 'take it on' : 'decline'}.`),
      );
    }

    const foot = el('div', 'foot');
    const no = el('button', 'b', 'Decline');
    const yes = el('button', 'b primary', 'Take it on');
    // Only the button the AI picked stays live, so the choice can be read but not changed.
    if (isAi) {
      no.disabled = aiChoice === true;
      yes.disabled = aiChoice === false;
    }
    let cancelAuto = () => {};
    no.onclick = () => {
      cancelAuto();
      done(false);
    };
    yes.onclick = () => {
      cancelAuto();
      done(true);
    };
    foot.append(no, yes);
    d.append(foot);
    const chosen = aiChoice ? yes : no;
    if (isAi) cancelAuto = armAutoClose(chosen, true, () => done(aiChoice!));
    return d;
  });

  game.state.modal = null;
  if (accept) game.takeProject(m.projectId, m.playerId);
  else
    game.state.log.push({
      turn: game.state.turn,
      playerId: m.playerId,
      text: `${p.name} declines ${proj.name}.`,
    });
  game.finishWork({ landedOnOther: false, ownProject: accept ? m.projectId : null });
}

async function handleChance(m: Extract<Modal, { kind: 'chance' }>): Promise<void> {
  const text = game.chanceText(m.cardId, m.playerId);
  const p = game.player(m.playerId);
  const isAi = p.kind === 'computer';
  if (isAi) game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text });

  await ui.modal<void>((done) => {
    const d = Ui.modalShell('Chance', `${p.name} draws a chance card`);
    d.prepend(cardHead('chance', 'Chance card', whoLine(p.name)));
    const art = game.chanceCard(m.cardId).art;
    const artUrl = art ? resourceImage(art) : null;
    if (artUrl) {
      const img = el('img', 'card-art');
      img.src = artUrl;
      img.alt = 'Chance card';
      img.draggable = false;
      d.append(img);
    }
    d.append(el('p', undefined, text));
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'Continue');
    let cancelAuto = () => {};
    ok.onclick = () => {
      cancelAuto();
      done();
    };
    foot.append(ok);
    d.append(foot);
    cancelAuto = armAutoClose(ok, isAi, () => done());
    return d;
  });

  game.state.modal = null;
  game.applyChance(m.cardId, m.playerId);
}

async function handleScruples(m: Extract<Modal, { kind: 'scruples' }>): Promise<void> {
  const p = game.player(m.playerId);
  const card = game.scruplesCard(m.cardId);
  const situation = game.scruplesText(m.cardId, m.playerId);
  const isAi = p.kind === 'computer';
  // Resolve the AI's answer up front so it can be shown already selected.
  const aiChoice = isAi ? AI.decideScruples(game, m.playerId, m.cardId) : null;
  if (isAi) game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text: situation });

  const choice = await ui.modal<number>((done) => {
    const d = Ui.modalShell(
      'Scruples',
      isAi ? aiSubtitle(p.name, 'which answer to give') : 'Pick an answer.',
    );
    d.prepend(cardHead('scruples', 'Scruples card', whoLine(p.name)));
    const sArt = card.art ? resourceImage(card.art) : eventArt('SCRUPLESCHANCE');
    if (sArt) {
      const img = el('img', 'card-art');
      img.src = sArt;
      img.alt = 'Scruples card';
      img.draggable = false;
      d.append(img);
    }
    d.append(el('p', undefined, situation));

    card.choices.forEach((c, i) => {
      const b = choiceButton(i + 1, c.label, isAi && i === aiChoice ? 'choice-chosen' : '');
      if (isAi) {
        // Every option is shown, but none is clickable — the decision is already made.
        b.disabled = true;
        if (i === aiChoice) b.append(el('span', 'choice-tag', 'chosen'));
      } else {
        b.onclick = () => done(i);
      }
      d.append(b);
    });

    if (isAi) {
      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      let cancelAuto = () => {};
      ok.onclick = () => {
        cancelAuto();
        done(aiChoice!);
      };
      foot.append(ok);
      d.append(foot);
      cancelAuto = armAutoClose(ok, true, () => done(aiChoice!));
    } else {
      const onKey = (e: KeyboardEvent) => {
        if (e.key >= '1' && e.key <= '3') {
          window.removeEventListener('keydown', onKey);
          done(Number(e.key) - 1);
        }
      };
      window.addEventListener('keydown', onKey);
      // The number keys work, so say so rather than leaving them to be discovered.
      const foot = el('div', 'foot');
      const hint = el('div', 'hint-line', 'Click an answer, or press 1, 2 or 3.');
      hint.style.marginRight = 'auto';
      foot.append(hint);
      d.append(foot);
    }
    return d;
  });

  game.state.modal = null;
  const outcome = game.applyScruples(m.cardId, m.playerId, choice);

  await ui.modal<void>((done) => {
    const d = Ui.modalShell('Outcome', isAi ? `${p.name}'s decision` : undefined);
    d.prepend(cardHead('scruples', 'Scruples', whoLine(p.name)));
    d.append(el('p', undefined, outcome));
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'Continue');
    let cancelAuto = () => {};
    ok.onclick = () => {
      cancelAuto();
      done();
    };
    foot.append(ok);
    d.append(foot);
    cancelAuto = armAutoClose(ok, isAi, () => done());
    return d;
  });
}

async function handleMeeting(m: Extract<Modal, { kind: 'meeting' }>): Promise<void> {
  const p = game.player(m.playerId);
  const isAi = p.kind === 'computer';
  if (isAi) game.state.log.push({ turn: game.state.turn, playerId: m.playerId, text: m.text });

  await ui.modal<void>((done) => {
    const d = Ui.modalShell('Meeting', `${p.name} presents`);
    d.prepend(cardHead('meeting', 'Meeting', whoLine(p.name)));
    headArt(d, m.delta >= 0 ? 'MEETINGGOOD' : 'MEETINGBAD', 'The meeting');
    d.append(el('p', undefined, m.text));
    const line = el('p');
    line.append(document.createTextNode('Boss Rating '), Ui.delta(m.delta));
    d.append(line);
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'Continue');
    let cancelAuto = () => {};
    ok.onclick = () => {
      cancelAuto();
      done();
    };
    foot.append(ok);
    d.append(foot);
    cancelAuto = armAutoClose(ok, isAi, () => done());
    return d;
  });

  game.state.modal = null;
  game.applyMeeting(m.playerId, m.delta);
}

async function handleOfficeParty(m: Extract<Modal, { kind: 'officeParty' }>): Promise<void> {
  const anyHuman = game.state.players.some((p) => p.kind === 'human');
  if (anyHuman) {
    await ui.modal<void>((done) => {
      const d = Ui.modalShell('Office Party', 'The whole office attends. The boss is watching.');
      d.prepend(cardHead('officeParty', 'Office Party', `turn ${game.state.turn}`));
      headArt(d, 'DRINK', 'The office party');

      // Each player gets their sprite from the set matching their outcome, animated by
      // alternating frames — the original drove this scene from the only TTimer it had.
      const sprites: Array<{ img: HTMLImageElement; mood: PartyMood; slot: number }> = [];
      const list = el('div', 'party-list');
      for (const entry of m.entries) {
        const p = game.player(entry.playerId);
        const row = el('div', 'party-row');

        const art = partySprite(entry.mood, p.id, 0);
        if (art) {
          const img = el('img', 'party-sprite');
          img.src = art;
          img.alt = `${p.name} at the party`;
          img.draggable = false;
          row.append(img);
          sprites.push({ img, mood: entry.mood, slot: p.id });
        }

        const body = el('div', 'party-text');
        const who = el('div', 'party-who', p.name);
        who.style.color = p.color;
        const line = el('div', undefined, entry.text);
        const delta = el('div', 'party-delta');
        delta.append(document.createTextNode('Boss Rating '), Ui.delta(entry.delta));
        body.append(who, line, delta);
        row.append(body);
        list.append(row);
      }
      d.append(list);

      // Only the drunk and over-excited sprites have a second frame to alternate to.
      let phase = 0;
      const timer = window.setInterval(() => {
        phase += 1;
        for (const s2 of sprites) {
          if (s2.mood === 'fine') continue;
          const next = partySprite(s2.mood, s2.slot, phase);
          if (next) s2.img.src = next;
        }
      }, 420);

      const foot = el('div', 'foot');
      const ok = el('button', 'b primary', 'Continue');
      let cancelAuto = () => {};
      const finish = () => {
        window.clearInterval(timer);
        cancelAuto();
        done();
      };
      ok.onclick = finish;
      foot.append(ok);
      d.append(foot);
      cancelAuto = armAutoClose(ok, !anyHuman, finish);
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
  const isAi = p.kind === 'computer';
  const up = m.to > m.from;

  await ui.modal<void>((done) => {
    const d = Ui.modalShell(up ? 'Promotion' : 'Demotion', p.name);
    d.prepend(cardHead('home', up ? 'Review passed' : 'Review failed', whoLine(p.name)));
    const art = rankArt(m.from, m.to);
    if (art) {
      const img = el('img', 'rank-art');
      img.src = art;
      img.alt = up ? 'Promotion' : 'Demotion';
      img.draggable = false;
      d.append(img);
    }
    d.append(el('p', undefined, `${p.name} moves from ${RANKS[m.from]} to ${RANKS[m.to]}.`));
    d.append(
      el('p', undefined, `Power Monger actions at this rank: ${R.POWER_MONGER_ACTIONS[m.to]}.`),
    );
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'Continue');
    let cancelAuto = () => {};
    ok.onclick = () => {
      cancelAuto();
      done();
    };
    foot.append(ok);
    d.append(foot);
    cancelAuto = armAutoClose(ok, isAi, () => done());
    return d;
  });

  game.state.modal = null;
}

async function handlePowerMonger(m: Extract<Modal, { kind: 'powerMonger' }>): Promise<void> {
  const p = game.player(m.playerId);
  let left = m.actionsLeft;

  while (left > 0) {
    if (p.kind === 'computer') {
      const action = AI.decidePowerMonger(game, m.playerId);
      // Show the AI's action in the real form, filled in and locked, then apply it.
      await powerMongerDialog(m.playerId, left, action);
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

/**
 * The Power Monger form. When `preset` is supplied the form is filled in with a computer
 * player's chosen action and every control is disabled, so the decision can be read but not
 * altered — only the confirm button stays live.
 */
function powerMongerDialog(
  playerId: number,
  left: number,
  preset?: AI.PowerMongerAction,
): Promise<PmResult> {
  return ui.modal<PmResult>((done) => {
    const p = game.player(playerId);
    const locked = preset !== undefined;
    const d = Ui.modalShell(
      'Power Monger',
      locked
        ? aiSubtitle(p.name, `how to use a Power Monger action (${left} left)`)
        : `${p.name} — ${RANKS[p.rank]} — ${left} action${left === 1 ? '' : 's'} remaining`,
    );
    d.prepend(cardHead('powerMonger', 'Power Monger', whoLine(p.name)));
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

    if (preset) {
      actSel.value = preset.kind;
      if (preset.targetId !== undefined) tgtSel.value = String(preset.targetId);
      rebuild();
      if (preset.projectId !== undefined) {
        const radio = list.querySelector<HTMLInputElement>(
          `input[value="${preset.projectId}"]`,
        );
        if (radio) {
          radio.checked = true;
          selected = preset.projectId;
          radio.closest('label')?.classList.add('choice-chosen');
        }
      }
      // Lock every control: the AI's choice is on display, not up for editing.
      for (const node of d.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input, select',
      )) {
        node.disabled = true;
      }
      const verdict =
        preset.kind === 'nothing'
          ? `${p.name} does nothing.`
          : preset.kind === 'cancel'
            ? `${p.name} cancels ${game.state.projects[preset.projectId!]?.name ?? 'a project'}.`
            : `${p.name} assigns ${game.state.projects[preset.projectId!]?.name ?? 'a project'} to ${game.player(preset.targetId ?? playerId).name}.`;
      projField.after(el('p', 'ai-verdict', verdict));
    }

    const err = el('div', 'hint-line');
    err.style.color = 'var(--danger-2)';
    d.append(err);

    const foot = el('div', 'foot');
    const skip = el('button', 'b', 'Stop using actions');
    skip.onclick = () => done('stop');
    const go = el('button', 'b primary', locked ? 'Continue' : 'Do it');
    let cancelAuto = () => {};
    if (locked) {
      go.onclick = () => {
        cancelAuto();
        done('acted');
      };
      cancelAuto = armAutoClose(go, true, () => done('acted'));
      foot.append(go);
      d.append(foot);
      return d;
    }
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
    d.prepend(cardHead('project', 'Make a trade', whoLine(game.player(fromId).name)));

    const targetField = el('div', 'field');
    targetField.append(el('label', undefined, 'Trade with'));
    const tgt = el('select');
    for (const q of game.state.players) {
      if (q.id === fromId) continue;
      const o = el('option', undefined, q.name);
      o.value = String(q.id);
      tgt.append(o);
    }
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

    const err = el('div', 'hint-line');
    err.style.color = 'var(--danger-2)';
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

async function askAccept(
  fromId: number,
  toId: number,
  give: number[],
  want: number[],
): Promise<boolean> {
  const to = game.player(toId);
  const from = game.player(fromId);
  const names = (ids: number[]) =>
    ids.map((i) => game.state.projects[i].name).join(', ') || 'nothing';
  const isAi = to.kind === 'computer';
  const aiChoice = isAi ? AI.decideAcceptTrade(game, toId, fromId, give, want) : null;

  return ui.modal<boolean>((done) => {
    const d = Ui.modalShell(
      'Trade offer',
      isAi
        ? aiSubtitle(to.name, `whether to accept ${from.name}'s offer`)
        : `${from.name} offers ${to.name} a trade`,
    );
    d.append(el('p', undefined, `${to.name} would receive: ${names(give)}`));
    d.append(el('p', undefined, `${to.name} would give up: ${names(want)}`));
    if (isAi) {
      d.append(el('p', 'ai-verdict', `${to.name} decides to ${aiChoice ? 'accept' : 'decline'}.`));
    }

    const foot = el('div', 'foot');
    const no = el('button', 'b', 'Decline');
    const yes = el('button', 'b primary', 'Accept');
    if (isAi) {
      no.disabled = aiChoice === true;
      yes.disabled = aiChoice === false;
    }
    let cancelAuto = () => {};
    no.onclick = () => {
      cancelAuto();
      done(false);
    };
    yes.onclick = () => {
      cancelAuto();
      done(true);
    };
    foot.append(no, yes);
    d.append(foot);
    if (isAi) cancelAuto = armAutoClose(aiChoice ? yes : no, true, () => done(aiChoice!));
    return d;
  });
}

/**
 * The How to Play window, mirroring THELPFORM: twelve topics down the left edge, each
 * swapping the text in a scrolling panel, under the heading the original used for the group.
 */
function helpDialog(startKey = 'getStarted') {
  return ui.modal<void>((done) => {
    const d = Ui.modalShell('How to Play', 'Integrated Information System');
    d.classList.add('modal-help');
    let useOriginal = originalHelpAvailable();

    const layout = el('div', 'help-layout');
    const list = el('div', 'help-topics');
    const body = el('div', 'help-body');
    layout.append(list, body);

    let current = startKey;
    const paint = () => {
      const all = helpTopics(useOriginal);
      list.textContent = '';
      for (const t of all) {
        const b = el('button', 'help-topic' + (t.key === current ? ' help-topic-on' : ''), t.title);
        b.onclick = () => {
          current = t.key;
          paint();
        };
        list.append(b);
      }
      const topic = all.find((t) => t.key === current) ?? all[0];
      body.textContent = topic ? topic.body : '';
      body.scrollTop = 0;
    };
    paint();
    if (originalHelpAvailable()) {
      // Two named sources rather than an on/off state, so a segmented switch reads clearer
      // than a button whose label keeps changing.
      const row = el('div', 'help-source');
      row.append(el('span', 'help-source-label', 'Text'));
      const seg = el('div', 'segmented');
      const options: Array<[boolean, string, string]> = [
        [true, 'Original', "The original game's own help text"],
        [false, 'Port summary', "This port's own description of the same mechanics"],
      ];
      const buttons: HTMLButtonElement[] = [];
      options.forEach(([value, label, hint]) => {
        const b = el('button', 'segment');
        b.textContent = label;
        tip(b, hint);
        b.setAttribute('role', 'radio');
        b.onclick = () => {
          if (useOriginal === value) return;
          useOriginal = value;
          buttons.forEach((btn, i) => {
            const on = options[i][0] === useOriginal;
            btn.classList.toggle('segment-on', on);
            btn.setAttribute('aria-checked', String(on));
          });
          paint();
        };
        const on = value === useOriginal;
        b.classList.add(...(on ? ['segment-on'] : []));
        b.setAttribute('aria-checked', String(on));
        buttons.push(b);
        seg.append(b);
      });
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Help text source');
      row.append(seg);
      d.append(row);
    }
    d.append(layout);

    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'OK');
    ok.onclick = () => done();
    foot.append(ok);
    d.append(foot);
    return d;
  });
}

/** The Stock Chart window, which the original opened from its Game menu. */
function stockChartDialog() {
  return ui.modal<void>((done) => {
    const s2 = game.state;
    const d = Ui.modalShell('Stock Chart', `Now ${s2.stock} · peak ${s2.stockPeak}`);
    const pts = s2.stockHistory;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 560 220');
    svg.setAttribute('class', 'chart-big');
    const max = Math.max(R.STOCK_MAX / 2, ...pts.map((p) => p.price));
    const x = (i: number) => (pts.length < 2 ? 0 : (i / (pts.length - 1)) * 550 + 5);
    const y = (v: number) => 210 - (v / max) * 200;
    // Starting price, for reference against the current line.
    for (const [v, cls] of [[R.STOCK_START, 'chart-base'], [0, 'chart-zero']] as const) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '5');
      line.setAttribute('x2', '555');
      line.setAttribute('y1', String(y(v)));
      line.setAttribute('y2', String(y(v)));
      line.setAttribute('class', cls);
      svg.append(line);
    }
    if (pts.length > 1) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' '));
      path.setAttribute('class', s2.stock >= R.STOCK_START ? 'chart-up' : 'chart-down');
      svg.append(path);
    }
    d.append(svg);
    d.append(
      el('p', 'stat-rank', 'Shipping a project lifts the price; running the company costs a little every round. At zero the company is disbanded and everyone loses.'),
    );
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'OK');
    ok.onclick = () => done();
    foot.append(ok);
    d.append(foot);
    return d;
  });
}

/** About, using the original's own about-box illustration when it is installed. */
function aboutDialog() {
  return ui.modal<void>((done) => {
    const d = Ui.modalShell('About', 'Open Game of Work');
    const art = aboutImage();
    if (art) {
      const img = el('img', 'event-art');
      img.src = art;
      img.alt = 'Game of Work';
      img.draggable = false;
      d.append(img);
    }
    d.append(
      el('p', undefined, 'Game of Work was published by Hotpot Software around 2000 for 32-bit Windows, and is no longer available anywhere.'),
      el('p', undefined, 'This is an independent, clean-room reimplementation. Its mechanics, board geometry and colours were recovered by analysing the original program; its artwork, audio and text are loaded from your own copy when present and are never distributed with this port.'),
      el('p', undefined, 'Not affiliated with or endorsed by the original authors.'),
    );
    const credit = el('p', 'about-credit');
    credit.append(document.createTextNode('Ported with love by '));
    const gh = el('a');
    gh.href = 'https://github.com/erango';
    gh.textContent = '@erango';
    gh.target = '_blank';
    gh.rel = 'noopener noreferrer';
    credit.append(gh, document.createTextNode(' \u00b7 '));
    const kofi = el('a');
    kofi.href = 'https://ko-fi.com/erango';
    kofi.textContent = '\u2615 Ko-fi';
    kofi.target = '_blank';
    kofi.rel = 'noopener noreferrer';
    credit.append(kofi);
    d.append(credit);
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'OK');
    ok.onclick = () => done();
    foot.append(ok);
    d.append(foot);
    return d;
  });
}

/** The High Scores window: two tables of ten, as THIGHSCORESFORM lays them out. */
function highScoresDialog(highlight?: { fastest: number | null; richest: number | null }) {
  return ui.modal<void>((done) => {
    const d = Ui.modalShell('High Scores');
    const wrap = el('div', 'hs-wrap');

    const table = (
      title: string,
      nameHead: string,
      valueHead: string,
      rows: Array<{ name: string; value: string; note: string }>,
      mark: number | null | undefined,
    ) => {
      const box = el('div', 'hs-table');
      box.append(el('h4', undefined, title));
      const grid = el('div', 'hs-grid');
      grid.append(
        el('b', 'hs-h', 'Rank'),
        el('b', 'hs-h', nameHead),
        el('b', 'hs-h hs-num', valueHead),
      );
      for (let i = 0; i < TABLE_SIZE; i++) {
        const r = rows[i];
        const isNew = mark === i + 1;
        grid.append(
          el('span', 'hs-c' + (isNew ? ' hs-new' : ''), String(i + 1)),
          el('span', 'hs-c' + (isNew ? ' hs-new' : ''), r ? r.name : '—'),
          el('span', 'hs-c hs-num' + (isNew ? ' hs-new' : ''), r ? r.value : ''),
        );
        if (r && r.note) {
          const n = el('span', 'hs-note');
          n.textContent = r.note;
          grid.append(el('span'), n, el('span'));
        }
      }
      box.append(grid);
      return box;
    };

    wrap.append(
      table(
        'Shortest time to President',
        'Name of President',
        '# of turns',
        scores.fastest.map((s2) => ({
          name: s2.name,
          value: String(s2.scaled),
          // Long games are the baseline, so only scaled entries need the raw figure shown.
          note: s2.length === 'long' ? '' : `${s2.turns} actual, ${s2.length}`,
        })),
        highlight?.fastest,
      ),
      table(
        'Highest Stock',
        'Name of Eventual President',
        'Stock Price',
        scores.richest.map((s2) => ({ name: s2.name, value: String(s2.price), note: '' })),
        highlight?.richest,
      ),
    );
    d.append(wrap);
    d.append(
      el(
        'p',
        'stat-rank',
        'Short and Medium games have their turn counts scaled so they compare against Long games, as the original did.',
      ),
    );
    const foot = el('div', 'foot');
    const ok = el('button', 'b primary', 'OK');
    ok.onclick = () => done();
    foot.append(ok);
    d.append(foot);
    return d;
  });
}

async function handleGameOver(m: Extract<Modal, { kind: 'gameOver' }>): Promise<void> {
  // Only a game with a president places: both tables name one.
  let placed: ReturnType<typeof record> | null = null;
  if (game.state.winner !== null) {
    placed = record(scores, {
      name: game.player(game.state.winner).name,
      turns: game.state.turn,
      peakStock: game.state.stockPeak,
      length: game.state.length,
      when: game.state.log.length,
    });
    scores = placed.scores;
    saveScores(scores);
    if (placed.fastestPlace) sound.play('win');
    if (placed.richestPlace) sound.play('stockHigh');
  }
  await ui.modal<void>((done) => {
    const d = Ui.modalShell(game.state.winner !== null ? 'President' : 'Company disbanded');
    if (game.state.winner !== null) {
      const win = presidentArt(game.state.winner);
      if (win) {
        const img = el('img', 'event-art');
        img.src = win;
        img.alt = 'President';
        img.draggable = false;
        d.append(img);
      }
    } else {
      headArt(d, 'COMPANYDISBANDED1', 'The company folds');
    }
    d.append(el('p', undefined, m.text));
    const ul = el('ul');
    const ranked = [...game.state.players].sort((a, b) => b.bossRating - a.bossRating);
    for (const p of ranked) {
      ul.append(
        el('li', undefined, `${p.name} — ${RANKS[p.rank]}, Boss Rating ${p.bossRating}`),
      );
    }
    d.append(el('div', 'sub', `Finished on turn ${game.state.turn}.`), ul);
    if (placed) {
      const line: string[] = [];
      if (placed.fastestPlace) line.push(`#${placed.fastestPlace} shortest time to President`);
      if (placed.richestPlace) line.push(`#${placed.richestPlace} highest stock`);
      if (line.length) d.append(el('p', 'ai-verdict', `New high score: ${line.join(' · ')}.`));
    }
    const foot = el('div', 'foot');
    const table = el('button', 'b', 'High Scores');
    table.onclick = () => {
      done();
      void highScoresDialog(
        placed ? { fastest: placed.fastestPlace, richest: placed.richestPlace } : undefined,
      ).then(() => newGame());
    };
    const again = el('button', 'b primary', 'New game');
    again.onclick = () => {
      done();
      void newGame();
    };
    foot.append(table, again);
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
      for (const c of game.drainCues()) sound.play(c as Cue);

      if (game.state.phase === 'gameOver') {
        if (game.state.modal?.kind === 'gameOver') await resolveModal();
        return;
      }

      if (game.state.modal) {
        await resolveModal();
        continue;
      }

      if (pendingTumble) {
        pendingTumble = false;
        await tumbleDie();
        continue;
      }

      // Walk the token one square at a time, then reveal the result — never both at once.
      if (game.moving) {
        game.stepMove();
        ui.render(game);
        for (const c of game.drainCues()) sound.play(c as Cue);
        await sleep(STEP_MS);
        continue;
      }
      if (game.state.phase === 'moving') {
        // Token has stopped. Show anything that happened en route (promotions), then the
        // landing square's own result.
        for (const notice of game.drainNotices()) {
          if (notice.kind === 'rankChange') await handleRankChange(notice);
        }
        await sleep(REVEAL_MS);
        game.resolveLanding();
        continue;
      }

      const p = game.active;

      // Announce whose turn it is before anything happens, not after. The original's
      // human.wav / computer.wav are seat-type announcements and the per-name clips say who
      // is up, so they belong here rather than in the middle of resolving a square.
      const key = `${game.state.turn}:${p.id}`;
      if (!game.state.rolled && !game.state.modal && announced !== key) {
        announced = key;
        await sound.announceTurn(p.name, p.id);
        /*
         * Re-enter the loop rather than falling through. The clip runs 1.1-1.9s, and a click
         * on the die during it sets `moving` while this await is parked; the loop then reached
         * the human branch below and returned, so the roll was swallowed and the turn hung
         * with the die disabled. `announced` keeps this from re-announcing.
         */
        continue;
      }

      // The turn ends itself. Every human decision happens before or during the roll —
      // trading precedes it, and square effects resolve as modals — so once the result is
      // dismissed there is nothing left to choose. The original had no end-turn control:
      // TMAINFORM contains no TButton at all, only the three clickable images and the menus.
      if (game.turnComplete()) {
        await sleep(p.kind === 'computer' ? 400 : END_TURN_MS);
        game.endTurn();
        continue;
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
        pendingTumble = true;
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
    onPickTheme(next: ThemeName) {
      applyTheme(next);
    },
    onGraphicsChanged() {
      /*
       * The Ui has already called setTheme; this finishes the job. Artwork, favicon, scaling
       * mode and music all follow the theme — the card and help text do not, since those are
       * chosen separately in New Game and How to Play.
       */
      applyFavicon();
      applySmoothing();
      void sound.retheme();
      ui.render(game);
    },
    onToggleSound() {
      sound.toggle();
      ui.render(game);
    },
    onToggleMusic() {
      sound.toggleMusic();
      ui.render(game);
    },
    musicOn() {
      return sound.musicOn;
    },
    onAutoClick() {
      void askAutoClick();
    },
    onHighScores() {
      void highScoresDialog();
    },
    onHelp(topic?: string) {
      void helpDialog(topic ?? 'getStarted');
    },
    onStockChart() {
      void stockChartDialog();
    },
    onAbout() {
      void aboutDialog();
    },
    soundOn() {
      return sound.on;
    },
    onRoll() {
      if (!game.canRoll()) return;
      game.roll();
      pendingTumble = true;
      void step();
    },
    onTrade() {
      if (game.state.rolled || game.state.modal) return;
      game.state.modal = { kind: 'trade', from: game.state.current };
      void step();
    },
    onResign() {
      void askResign();
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

/**
 * A throwaway game used only to paint the board behind the New Game window: six seats so
 * all six avatars show, at the Long starting rank, which is what puts 'E' on every badge.
 */
function attractGame(): Game {
  return new Game({
    length: 'long',
    seed: 0,
    /*
     * The seats carry the game's own default names rather than 'Player 1'..'Player 6'.
     * The DFM's design-time captions are what the original's idle board showed, and those
     * placeholders are what it had — but they read as unfinished next to the six portraits,
     * and these are the names the game actually assigns the moment a game starts.
     */
    seats: DEFAULT_NAMES.map((name) => ({
      kind: 'computer' as const,
      name,
      personality: 'average' as const,
    })),
  });
}

async function newGame(): Promise<void> {
  // Hold on to a game in progress: Cancel has to return to it, so it must not be replaced by
  // the pre-game board before the dialog is answered.
  const previous = hasGame ? game : null;
  // The New Game window belongs to the theme track, not to the game's own loop.
  void sound.playTrack('theme', false);
  announced = '';
  if (!previous) {
    // Nothing to go back to, so paint the pre-game board behind the dialog.
    game = attractGame();
    ui.setAttract(true);
    ui.render(game);
  }
  const config = await askNewGame();
  if (!config) {
    // Back to the game that was running, or to the pre-game board if there wasn't one.
    if (previous) game = previous;
    ui.setAttract(!previous);
    ui.render(game);
    if (previous) {
      void sound.playTrack('play');
      void step();
    }
    return;
  }
  ui.setAttract(false);
  game = new Game(config);
  hasGame = true;
  void sound.playTrack('play');
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
    }
  });
}

/**
 * Startup splash, mirroring the original's borderless TSPLASHFORM (a single full-bleed
 * TImage), with this port's credit beneath it.
 *
 * Shown whether or not an extraction is installed: without the original image it falls back
 * to a plain title card, so the credit is always reachable. Dismissed only by a click, never
 * on a timer — the credit and its links should not vanish while they are being read.
 */
async function showSplash(): Promise<void> {
  const src = splashImage();
  await new Promise<void>((resolve) => {
    const layer = el('div', 'splash');
    const inner = el('div', 'splash-inner');

    if (src) {
      /*
       * The generated splash is a tower with a deliberately blank upper area, and the company
       * sign is drawn here rather than generated: asked for lettering, the model produced
       * "GoW GopaCorp". Only the generated set gets it — the original's splash is its own
       * finished artwork and is not ours to write on.
       */
      const frame = el('div', 'splash-frame');
      const img = el('img');
      img.src = src;
      img.alt = 'Game of Work';
      img.draggable = false;
      frame.append(img);
      if (graphicsMode() === 'generated') {
        const sign = el('div', 'splash-sign');
        sign.append(el('span', 'splash-sign-word', 'GoW'), el('span', 'splash-sign-corp', 'Corp.'));
        frame.append(sign);
      }
      inner.append(frame);
    } else {
      const card = el('div', 'splash-card');
      card.append(
        el('div', 'splash-title', 'Game of Work'),
        el('div', 'splash-sub', 'an open reimplementation'),
      );
      inner.append(card);
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      layer.remove();
      resolve();
    };

    const credit = el('div', 'splash-credit');
    credit.append(document.createTextNode('Ported with love by '));
    const gh = el('a');
    gh.href = 'https://github.com/erango';
    gh.textContent = '@erango';
    gh.target = '_blank';
    gh.rel = 'noopener noreferrer';
    credit.append(gh);

    const kofi = el('a', 'splash-kofi');
    kofi.href = 'https://ko-fi.com/erango';
    kofi.textContent = '\u2615 Support on Ko-fi';
    kofi.target = '_blank';
    kofi.rel = 'noopener noreferrer';

    // A click on either link must not also dismiss the splash.
    for (const a of [gh, kofi]) {
      a.onclick = (e) => e.stopPropagation();
    }

    const go = el('button', 'b primary splash-go', 'Continue');
    go.onclick = finish;
    inner.append(credit, kofi, go, el('div', 'splash-hint', 'or click anywhere'));
    layer.append(inner);
    layer.onclick = finish;
    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        finish();
      }
    });
    document.body.append(layer);
  });
}

async function boot(): Promise<void> {
  // Palette first, before anything paints; the artwork half of the theme has to wait for the
  // manifest, since assets.ts cannot resolve a set it has not read yet.
  applyPaletteEarly();
  const root = document.getElementById('app')!;
  // Resolve original-artwork availability before the first render so the board does not
  // flash the SVG fallback and then swap.
  await loadAssets();
  // Original decks live alongside the artwork and are equally optional.
  await initDecks();
  await loadHelp();
  initTheme();
  sound.warmScenes();
  // The deck follows the theme at launch too, not just on a switch — otherwise starting up in
  // the Original theme came with this port's own pack, which a theme change would then replace.
  setDeckMode(themeDeck(themeName()));
  setNameStyle(themeNames(themeName()));
  applyFavicon();
  applySmoothing();
  // The original showed a borderless splash (TSPLASHFORM: one full-bleed TImage) at launch,
  // so the intro clip belongs to app startup, once, not to every new game. Queued as speech
  // so the first turn announcement waits for it instead of talking over it.
  void sound.speak('gameStart');
  await showSplash();
  // The splash click is the gesture that unblocks audio, so the theme track starts here rather
  // than at load, where play() would simply be rejected.
  void sound.playTrack('theme', false);
  ui = new Ui(root, handlers());
  initTooltips();
  bindKeys();
  void newGame();
}

void boot();
