// Generate the scene sound effects through ElevenLabs' text-to-sound-effects endpoint.
//
//   ELEVENLABS_API_KEY=... npm run sfx:gen          # everything pending
//   ELEVENLABS_API_KEY=... npm run sfx:gen -- win   # one cue, or a theme, or any substring
//   FORCE=1 ELEVENLABS_API_KEY=... npm run sfx:gen  # redo existing
//
// Resumable: a job whose *raw* file exists is skipped, so a failed run costs only what it did
// not reach. Raw output is separate from the finished set, because the post step trims and
// normalises and you want the original to go back to.
//
// Next: npm run sfx:post
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { jobs as allJobs } from './sfx-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.ELEVENLABS_API_KEY;
const FORCE = process.env.FORCE === '1';
const filter = process.argv.slice(2);
// Higher than the 0.3 default: these prompts are specific, and the failure mode is the model
// inventing music or a voice-over rather than following them.
const INFLUENCE = Number(process.env.PROMPT_INFLUENCE ?? 0.6);

if (!KEY) {
  console.error(
    'Set ELEVENLABS_API_KEY. Create one at https://elevenlabs.io/app/settings/api-keys — the\n' +
      'free tier covers this set, which is 26 clips of 2.5-5 seconds.',
  );
  process.exit(1);
}

let jobs = FORCE ? allJobs.slice() : allJobs.filter((j) => !existsSync(resolve(ROOT, j.raw)));
if (filter.length) jobs = jobs.filter((j) => filter.some((f) => j.id.includes(f)));
console.log(`${jobs.length} ${FORCE ? 'job(s) (FORCE)' : 'pending job(s)'} of ${allJobs.length}.`);
if (!jobs.length) process.exit(0);

let ok = 0;
let fail = 0;

for (const [i, job] of jobs.entries()) {
  process.stdout.write(`[${i + 1}/${jobs.length}] ${job.id} … `);
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': KEY },
      body: JSON.stringify({
        text: job.prompt,
        duration_seconds: job.seconds,
        prompt_influence: INFLUENCE,
        model_id: 'eleven_text_to_sound_v2',
      }),
    });
    if (!res.ok) {
      // The body carries the actual reason (quota, validation), which the status alone does not.
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} ${detail.slice(0, 160)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error(`suspiciously small (${buf.length} bytes)`);
    const path = resolve(ROOT, job.raw);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    console.log(`ok (${(buf.length / 1024) | 0}kb, ${job.seconds}s)`);
    ok++;
  } catch (e) {
    console.log('FAIL:', e.message.split('\n')[0]);
    fail++;
  }
}

console.log(`\ndone: ${ok} ok, ${fail} failed. Raw -> art/_sfx_raw/. Next: npm run sfx:post`);
