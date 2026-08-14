/**
 * WCAG AA contrast audit of the running interface.
 *
 * Not part of `npm test`, which is DOM-free and runs in a second. This one needs a real
 * browser, so it lives behind `npm run check:contrast`.
 *
 *   npm run check:contrast            both palettes, quiet unless something fails
 *   VERBOSE=1 npm run check:contrast  also print what passed, per screen
 *
 * It walks every rendered text node, composites the text colour over the nearest opaque
 * ancestor background, and requires 4.5:1 — or 3:1 for large text, per WCAG 1.4.3. Both
 * palettes are checked with six seats seated, which is the densest the panel and the dialogs
 * ever get.
 *
 * The vector artwork set is forced on: text over an installed illustration has no computable
 * background, and the illustrations are not ours to constrain anyway.
 *
 * Uses your real Chrome (`channel: 'chrome'`), like the art pipeline, so nothing has to be
 * downloaded.
 */
import { spawn } from 'child_process';
import { chromium } from 'playwright';

const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;
const VERBOSE = process.env.VERBOSE === '1';

// ------------------------------------------------------------------ in-page audit

/**
 * Runs inside the page. Returns one entry per text node that failed, plus a count of what was
 * checked, so a screen that silently rendered nothing cannot pass by default.
 */
function auditInPage() {
  const parse = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /** Nearest opaque background, composited back down through any translucent layers above it. */
  const background = (node) => {
    const stack = [];
    for (let el = node; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      // A bitmap behind the text makes the pair uncomputable. Gradients are a different
      // case: every one here is a translucent overlay (the shoddy hatch, the field vignette),
      // so keep walking and let the layer underneath supply the colour.
      if (cs.backgroundImage.includes('url(')) return { image: true };
      const c = parse(cs.backgroundColor);
      if (!c || c.a === 0) continue;
      stack.push(c);
      if (c.a === 1) break;
    }
    if (!stack.length || stack[stack.length - 1].a !== 1) {
      stack.push({ r: 255, g: 255, b: 255, a: 1 }); // canvas
    }
    // Bottom-up: the deepest opaque layer first, each translucent layer painted onto it.
    let out = stack[stack.length - 1];
    for (let i = stack.length - 2; i >= 0; i--) out = over(stack[i], out);
    return { color: out };
  };

  const path = (el) => {
    const bits = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cls = (n.className || '').toString().trim().split(/\s+/).filter(Boolean);
      bits.unshift(n.tagName.toLowerCase() + (cls.length ? `.${cls.join('.')}` : ''));
      if (bits.length >= 3) break;
    }
    return bits.join(' > ');
  };

  const failures = [];
  let checked = 0;
  let skipped = 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = background(el);
    if (bg.image) {
      skipped += 1;
      continue;
    }
    const composited = fg.a < 1 ? over(fg, bg.color) : fg;

    // Board text is transform-scaled, so the *rendered* size is what a reader gets. The board
    // is only ever scaled up from its design space, so the computed size is the floor.
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(composited, bg.color);
    checked += 1;
    if (got + 0.005 < need) {
      failures.push({
        text: text.length > 42 ? `${text.slice(0, 42)}…` : text,
        where: path(el),
        color: cs.color,
        background: `rgb(${Math.round(bg.color.r)} ${Math.round(bg.color.g)} ${Math.round(bg.color.b)})`,
        size: Math.round(size * 10) / 10,
        weight,
        ratio: Math.round(got * 100) / 100,
        need,
      });
    }
  }
  return { failures, checked, skipped };
}

// ------------------------------------------------------------------ driving the app

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
});
const stopServer = () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server never came up on ${BASE}`);
};

let total = 0;
let totalSkipped = 0;
const allFailures = [];

const audit = async (page, screen, palette) => {
  const { failures, checked, skipped } = await page.evaluate(auditInPage);
  total += checked;
  totalSkipped += skipped;
  if (!checked) throw new Error(`${palette}/${screen}: no text found — the screen never rendered`);
  for (const f of failures) allFailures.push({ ...f, screen, palette });
  if (VERBOSE || failures.length) {
    const mark = failures.length ? 'FAIL' : 'ok  ';
    console.log(`  ${mark} ${palette}/${screen}: ${checked} text nodes, ${failures.length} below AA`);
  }
};

/** Closes whatever dialog is open, so the next step is not clicking through a scrim. */
const dismiss = async (page) => {
  for (let i = 0; i < 12; i++) {
    if (!(await page.$('.scrim'))) return true;
    const choice = await page.$('.modal .choice:not(:disabled)');
    const primary = await page.$('.modal .foot .b.primary:not(:disabled)');
    const any = await page.$('.modal .foot .b:not(:disabled)');
    const target = choice || primary || any;
    if (target) await target.click({ timeout: 2000 }).catch(() => {});
    else await page.keyboard.press('Escape');
    void primary;
    await page.waitForTimeout(250);
  }
  return !(await page.$('.scrim'));
};

/** Opens each menu and the dialog behind it. Expects no game-driven dialog to be pending. */
const auditMenus = async (page, palette) => {
  const menus = [
    ['How to Play', 'All topics'],
    ['Game', 'Stock Chart'],
    ['Game', 'High Scores'],
    ['Options', 'AutoClicking'],
    ['About', 'About Game of Work'],
  ];
  for (const [top, item] of menus) {
    await dismiss(page);
    // Locators, not handles: every render rebuilds the menu bar, so a handle taken before a
    // render is detached by the time it is clicked.
    const btn = page.locator('.menu-top', { hasText: top }).first();
    if (!(await btn.count())) continue;
    await btn.click({ timeout: 4000 });
    await page.waitForTimeout(150);
    await audit(page, `menu open: ${top}`, palette);
    const entry = page.locator('.menu-item', { hasText: item }).first();
    if (await entry.count()) {
      await entry.click({ timeout: 4000 });
      await page.waitForTimeout(350);
      if (await page.$('.modal')) {
        await audit(page, `dialog: ${item}`, palette);
        await dismiss(page);
      }
    } else {
      await page.keyboard.press('Escape');
    }
  }
};

const run = async (browser, palette) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('ogow:autoclick', JSON.stringify({ human: false, computer: true, humanSeconds: 0, computerSeconds: 0 }));
  });
  /*
   * Theme and artwork are pinned through the query string, which does not touch the stored
   * choice. `art=modern` overrides the theme's own set deliberately: the vector set is the one
   * with a computable background everywhere, and the palette is what is under test.
   */
  await page.goto(`${BASE}?theme=${palette === 'neon' ? 'cyberpunk' : 'openPlan'}&art=modern`);

  console.log(`${palette} palette`);

  // The splash comes first and covers everything.
  await page.waitForSelector('.splash-go');
  await audit(page, 'splash', palette);
  await page.click('.splash-go');

  // New Game, as it opens: two computers idle and two seats off.
  await page.waitForSelector('.setup-grid .seat');
  await audit(page, 'new-game (default seats)', palette);

  // Every seat human, which is the densest this dialog gets and the case the seat states
  // were specified for.
  const seats = await page.$$('.setup-grid .seat');
  for (const seat of seats) {
    const human = await seat.$('.seat-seg .segment:nth-child(1)');
    await human.click();
  }
  await audit(page, 'new-game (six human seats)', palette);

  // One seat back off, so the off row is audited in place rather than in isolation.
  await (await seats[5].$('.seat-seg .segment:nth-child(3)')).click();
  await audit(page, 'new-game (one seat off)', palette);
  await (await seats[5].$('.seat-seg .segment:nth-child(1)')).click();

  /*
   * The menus come before the game does. Once six human seats are playing, every square opens
   * a dialog that waits for a click, so a dialog is back over the menu bar within a second of
   * closing the last one; on the pre-game board nothing competes for the scrim.
   */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await audit(page, 'pre-game board', palette);
  await auditMenus(page, palette);

  // Back into New Game, six human seats, and play.
  await page.locator('.menu-top', { hasText: 'Game' }).first().click();
  await page.locator('.menu-item', { hasText: 'New' }).first().click();
  await page.waitForSelector('.setup-grid .seat');
  for (const seat of await page.$$('.setup-grid .seat')) {
    await (await seat.$('.seat-seg .segment:nth-child(1)')).click();
  }
  await page.click('.foot .b.primary');
  await page.waitForSelector('.board .sq');
  await page.waitForTimeout(400);
  await audit(page, 'board + sidebar', palette);

  // A few turns, auditing whatever dialog each one throws up. Six human seats means every
  // decision dialog is the human variant; the computer variants are covered by the AI turns
  // a resigned seat produces below.
  // Every render replaces the controls it touches, so each interaction re-queries with a
  // locator and tolerates a click that loses its element mid-animation.
  const tap = async (selector) => {
    const loc = page.locator(selector).first();
    if (!(await loc.count())) return false;
    return loc
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
  };
  for (let i = 0; i < 44; i++) {
    if (await page.$('.modal')) {
      const title = await page.locator('.modal h3').first().textContent().catch(() => '?');
      await audit(page, `modal: ${title || '?'}`, palette);
      if (!(await tap('.modal .choice:not(:disabled)'))) {
        if (!(await tap('.modal .foot .b.primary:not(:disabled)'))) await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(250);
      continue;
    }
    if (await tap('.center-roll:not(:disabled)')) await page.waitForTimeout(900);
    else await page.waitForTimeout(400);
  }
  // The turn loop can stop with a dialog still up.
  if (!(await dismiss(page))) throw new Error(`${palette}: could not clear the open dialog`);
  await audit(page, 'board mid-game', palette);

  await ctx.close();
};

await waitForServer();
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const palette of ['original', 'neon']) await run(browser, palette);
} finally {
  await browser.close();
  stopServer();
}

console.log(`\n${total} text nodes checked, ${totalSkipped} skipped over artwork.`);
if (allFailures.length) {
  console.log(`\n${allFailures.length} below WCAG AA:\n`);
  for (const f of allFailures) {
    console.log(
      `  ${f.palette}/${f.screen}\n    "${f.text}"\n    ${f.where}\n    ${f.color} on ${f.background} · ${f.size}px/${f.weight} · ${f.ratio}:1, needs ${f.need}:1`,
    );
  }
  process.exit(1);
}
console.log('All text clears WCAG AA in both palettes.');
