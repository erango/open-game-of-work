// Drive the perchance generator to produce raw art for every manifest job whose final output
// is missing. Adapted from the pipeline in dungeon-vengeance, which worked out the awkward
// parts; the notes below are all load-bearing.
//
// Perchance/Cloudflare fingerprints Playwright's bundled Chromium as a bot, so this drives
// REAL Chrome. Two ways:
//
//   1) Your own Chrome over CDP (best, trusted profile). Quit Chrome, then launch it with a
//      DEDICATED profile dir (Chrome 136+ refuses debugging on the default one), clear
//      Cloudflare once in that window, and connect:
//        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//          --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ogow-chrome"
//        CDP=1 npm run art:gen
//   2) Let the script launch real Chrome (channel:chrome) with a persistent profile under
//      .cache/chrome-perchance/, and solve Cloudflare once in the window:
//        npm run art:gen
//
// Runs headed by necessity. Resumable: only jobs whose output is missing run, so Ctrl-C and
// re-run freely. Filter by id or kind:
//   node scripts/perchance-gen.mjs board        # just the board faces
//   node scripts/perchance-gen.mjs party        # just the party sprites
//   FORCE=1 node scripts/perchance-gen.mjs home # redo one that exists
//
// SEED is fixed by default so the set stays coherent between runs.
import { chromium } from "playwright";
import { jobs as allJobs } from "./art-manifest.mjs";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GEN_URL = process.env.GEN_URL || "https://perchance.org/ai-text-to-image-generator";
const PROFILE = resolve(ROOT, ".cache/chrome-perchance");
const RAW_DIR = resolve(ROOT, "art/_raw");
const CDP = process.env.CDP_URL || (process.env.CDP ? "http://127.0.0.1:9222" : null);
const SEED = process.env.SEED || "770770"; // fixed → coherent set; numeric
const FORCE = process.env.FORCE === "1"; // regenerate even if output exists
const PER_JOB_MS = 110000;
const MIN_BYTES = 6000;
const filter = process.argv.slice(2);

mkdirSync(RAW_DIR, { recursive: true });

let jobs = FORCE ? allJobs.slice() : allJobs.filter((j) => !existsSync(resolve(ROOT, j.out)));
if (filter.length) jobs = jobs.filter((j) => filter.some((f) => j.id.includes(f) || j.kind === f));
console.log(`${jobs.length} ${FORCE ? "job(s) (FORCE — redoing existing)" : "pending job(s)"} of ${allJobs.length}. seed=${SEED}`);
if (!jobs.length) process.exit(0);

// --- connect to / launch real Chrome ---
let ctx, page, closer;
if (CDP) {
  const browser = await chromium.connectOverCDP(CDP);
  ctx = browser.contexts()[0] || (await browser.newContext());
  page = ctx.pages().find((p) => p.url().includes("perchance.org")) || ctx.pages().find((p) => /^https?:/.test(p.url())) || (await ctx.newPage());
  closer = () => browser.close();
  console.log("connected to your Chrome over CDP.");
} else {
  ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, channel: "chrome", viewport: null,
    args: ["--disable-blink-features=AutomationControlled"],
  }).catch((e) => { console.error("Could not launch real Chrome (channel:chrome). Install Google Chrome or use CDP mode.\n", e.message); process.exit(1); });
  page = ctx.pages()[0] || (await ctx.newPage());
  closer = () => ctx.close();
  console.log("launched real Chrome with a persistent profile.");
}
await ctx.addInitScript("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});").catch(() => {});
if (!page.url().includes("perchance")) await page.goto(GEN_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("goto warn:", e.message));

// The prompt box that actually drives generation is the description textarea
// (its oninput feeds the plugin) — NOT #positivePromptInput (a decoy tag box).
const POS = 'textarea.paragraph-input[data-name="description"]';
const NEG = 'textarea.paragraph-input[placeholder*="dont want" i]';

async function genFrame() {
  for (let i = 0; i < 60; i++) {
    for (const f of page.frames()) if (await f.$(POS).catch(() => null)) return f;
    await page.waitForTimeout(1000);
  }
  throw new Error("generator frame not found (Cloudflare not passed? solve it in the window)");
}
const frame = await genFrame();
console.log("generator ready.\n");

const killDialogs = () => frame.evaluate(() => document.querySelectorAll("dialog,.dialogs,.callout-content,#popupAnnoucement").forEach((d) => d.remove())).catch(() => {});

// Pick an <option> by identifying its select (identifyRe on any option) then
// selecting the wanted option. NFKC-normalized so bold-unicode labels match.
const chooseOption = (identifyRe, wantRe) => frame.evaluate(({ identifyRe, wantRe }) => {
  const norm = (s) => (s || "").normalize("NFKC");
  const idRe = new RegExp(identifyRe, "i"), wRe = new RegExp(wantRe, "i");
  const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => idRe.test(norm(o.text))));
  if (!sel) return "no-select";
  const opt = [...sel.options].find((o) => wRe.test(norm(o.text)));
  if (!opt) return "no-option";
  if (sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); }
  return "ok";
}, { identifyRe, wantRe });

const setSeed = (seed) => frame.evaluate((s) => {
  const set = (el) => { if (!el) return; el.value = s; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  set(document.querySelector("#imageSeed"));
  set([...document.querySelectorAll("input.text-input")].find((i) => /random seed/i.test(i.placeholder || "")));
}, String(seed));

async function typeInto(sel, text) {
  const box = frame.locator(sel);
  await box.click();
  await box.fill("");
  await box.pressSequentially(text, { delay: 0 });
  // Force any input/change/keyup handlers + commit, then blur.
  await frame.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return;
    for (const t of ["input", "change", "keyup"]) el.dispatchEvent(new Event(t, { bubbles: true }));
    el.blur();
  }, sel);
}

// Read the prompt the plugin actually received (embed frame's URL hash JSON).
function embedPrompt() {
  const emb = page.frames().find((f) => f.url().includes("image-generation.perchance.org/embed"));
  if (!emb) return null;
  try { return JSON.parse(decodeURIComponent(emb.url().split("#")[1] || "")).prompt || ""; } catch { return null; }
}

// Capture the finished image from #resultImgEl in the image-generation embed
// frame (data:base64 jpeg, or an http proxy url). `prev` is its src before we
// generated, so we wait for a NEW one.
async function captureResult(prev) {
  const deadline = Date.now() + PER_JOB_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2500);
    const emb = page.frames().find((f) => f.url().includes("image-generation.perchance.org/embed"));
    if (!emb) continue;
    const src = await emb.evaluate((p) => {
      const el = document.querySelector("#resultImgEl");
      if (!el || !el.src || el.src === p || el.naturalWidth < 128) return null;
      return el.src;
    }, prev).catch(() => null);
    if (!src) continue;
    if (src.startsWith("data:")) { const b = Buffer.from(src.split(",")[1], "base64"); if (b.length >= MIN_BYTES) return b; }
    else if (/^https?:/.test(src)) { const rr = await ctx.request.get(src); const b = Buffer.from(await rr.body()); if (b.length >= MIN_BYTES) return b; }
  }
  return null;
}

let ok = 0, fail = 0, aborted = false;
// One-time settings that persist across generations (style stays put).
await killDialogs();
const styleRes = await chooseOption("painted anime", "no style");
console.log("style → No style:", styleRes);

for (const [i, job] of jobs.entries()) {
  process.stdout.write(`[${i + 1}/${jobs.length}] ${job.id} … `);
  try {
    await killDialogs();
    await chooseOption("painted anime", "no style"); // keep it pinned
    await chooseOption("512x512px|portrait\\(512|landscape", job.shape === "landscape" ? "landscape" : "square");
    await setSeed(SEED);
    await typeInto(POS, job.prompt);
    if (job.negative) await typeInto(NEG, job.negative).catch(() => {});
    const set = (await frame.locator(POS).inputValue()).trim();
    if (set !== job.prompt.trim()) process.stdout.write(`(box ${set.length}/${job.prompt.length}) `);
    await page.waitForTimeout(900); // let the plugin commit the prompt

    const emb0 = page.frames().find((f) => f.url().includes("image-generation.perchance.org/embed"));
    const prev = emb0 ? await emb0.evaluate(() => document.querySelector("#resultImgEl")?.src || "").catch(() => "") : "";

    await killDialogs();
    await frame.click("#generateButtonEl", { timeout: 8000 }).catch(() => frame.evaluate(() => document.querySelector("#generateButtonEl")?.click()));

    await page.waitForTimeout(1500);
    const sent = embedPrompt();
    if (sent != null) process.stdout.write(`[sent: "${sent.slice(0, 45)}…"] `);

    const buf = await captureResult(prev);
    if (!buf) throw new Error("no image (timeout / Cloudflare?)");
    writeFileSync(resolve(ROOT, job.raw), buf);
    console.log(`ok (${(buf.length / 1024) | 0}kb)`);
    ok++;
  } catch (e) {
    const m = e.message.split("\n")[0];
    if (/closed|crash|Target/i.test(m)) { console.log("browser closed — stopping."); aborted = true; break; }
    console.log("FAIL:", m);
    fail++;
  }
  await page.waitForTimeout(800);
}
console.log(`\n${aborted ? "aborted early. " : ""}done: ${ok} ok, ${fail} failed. Raw → art/_raw/. Next: npm run art:cutout`);
if (!CDP) await closer().catch(() => {});
