/**
 * Tooltips, drawn by the game rather than left to the browser.
 *
 * `title` tooltips are drawn by the OS: they cannot be styled, they arrive after about a
 * second, they use the system font at the system size, and they look identical whichever theme
 * is running. Everything else on screen is themed; these were the one exception.
 *
 * Anything with `data-tip` gets one. `tip()` sets that attribute, and also mirrors the text
 * into `aria-label` when the element has no accessible name of its own — the previous `title`
 * was doing that job as well, and losing it would take the label away from screen readers.
 *
 * The tooltip layer is `position: fixed` and outside the board, so it is not affected by the
 * board's transform: tooltip text stays the same size whatever the board is scaled to.
 */

const SHOW_DELAY = 160;
const GAP = 9;
const EDGE = 8;

let layer: HTMLElement | null = null;
let showTimer = 0;
let current: HTMLElement | null = null;
let installed = false;
/**
 * The element whose tooltip must not come back until the pointer leaves it.
 *
 * Clicking a control hides its tooltip, but the click usually re-renders that control — and a
 * fresh element under a stationary cursor makes the browser fire `pointerover` again, so the
 * tooltip reappeared immediately. It then had no way out: the dialog the click opened covers
 * the control, so no `pointerout` ever arrives.
 */
let suppressed: HTMLElement | null = null;

/** Marks an element as having a tooltip, and keeps it labelled for assistive tech. */
export function tip(node: HTMLElement, text: string): void {
  node.dataset.tip = text;
  const named =
    node.getAttribute('aria-label') !== null ||
    node.getAttribute('aria-labelledby') !== null ||
    (node.textContent ?? '').trim().length > 0;
  if (!named) node.setAttribute('aria-label', text);
}

function ensureLayer(): HTMLElement {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'tip';
  layer.setAttribute('role', 'tooltip');
  layer.hidden = true;
  document.body.append(layer);
  return layer;
}

function hide(): void {
  window.clearTimeout(showTimer);
  current = null;
  if (layer) layer.textContent = '';
  if (layer) {
    layer.hidden = true;
    layer.classList.remove('tip-on', 'tip-below');
  }
}

function place(target: HTMLElement, text: string): void {
  const el = ensureLayer();
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('tip-below');
  // Measure after the text is in, since the size depends on it.
  const box = target.getBoundingClientRect();
  const own = el.getBoundingClientRect();

  let top = box.top - own.height - GAP;
  let below = false;
  if (top < EDGE) {
    top = box.bottom + GAP;
    below = true;
  }
  const centred = box.left + box.width / 2 - own.width / 2;
  const left = Math.max(EDGE, Math.min(centred, window.innerWidth - own.width - EDGE));

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  // The arrow follows the target, not the box, so it still points at a clamped tooltip.
  const arrow = box.left + box.width / 2 - left;
  el.style.setProperty('--tip-arrow', `${Math.round(Math.max(12, Math.min(arrow, own.width - 12)))}px`);
  el.classList.toggle('tip-below', below);
  el.classList.add('tip-on');
}

/** Installs the delegated listeners. Safe to call more than once. */
export function initTooltips(): void {
  if (installed) return;
  installed = true;
  const find = (from: EventTarget | null): HTMLElement | null => {
    if (!(from instanceof Element)) return null;
    const node = from.closest<HTMLElement>('[data-tip]');
    return node && node.dataset.tip ? node : null;
  };

  const open = (e: Event, instant = false) => {
    const node = find(e.target);
    if (!node || node === current) return;
    // A dialog is up: its own controls carry tooltips, but anything behind the scrim is not
    // being pointed at, it is merely underneath the pointer.
    if (document.querySelector('.scrim') && !node.closest('.scrim')) return;
    if (node === suppressed || (suppressed && node.dataset.tip === suppressed.dataset.tip)) return;
    window.clearTimeout(showTimer);
    current = node;
    const text = node.dataset.tip!;
    // A disabled control still explains itself — that is often exactly when you want to know.
    if (instant) place(node, text);
    else showTimer = window.setTimeout(() => current === node && place(node, text), SHOW_DELAY);
  };

  document.addEventListener('pointerover', (e) => open(e));
  document.addEventListener('focusin', (e) => open(e, true));
  document.addEventListener(
    'pointerout',
    (e) => {
      if (find(e.target) === current) hide();
    },
    true,
  );
  document.addEventListener('focusout', hide, true);
  // Any interaction dismisses it: a tooltip left over a control that has just been clicked
  // obscures whatever the click produced.
  document.addEventListener(
    'pointerdown',
    (e) => {
      suppressed = find(e.target);
      hide();
    },
    true,
  );
  // The pointer moving anywhere that is not the clicked control ends the suppression, which
  // covers the case where the control vanished and no pointerout was ever delivered.
  document.addEventListener('pointermove', (e) => {
    if (suppressed && find(e.target) !== suppressed) suppressed = null;
  });
  /*
   * A tooltip can outlive what it describes: the control is re-rendered or covered by a dialog
   * while the pointer sits still, so neither pointerout nor pointerdown arrives. Watching the
   * DOM is the only signal in that case.
   */
  new MutationObserver(() => {
    if (!current) return;
    if (!current.isConnected || (document.querySelector('.scrim') && !current.closest('.scrim'))) {
      hide();
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
}
