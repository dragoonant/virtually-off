// Idempotent generation runner. Usage: node run.mjs flux | picks | props | audio
// Reads manifest.json; skips any output that already exists. Raw outputs go to art/raw/.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RAW = path.join(ROOT, 'art/raw'); fs.mkdirSync(RAW, { recursive: true });
const M = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (base, p, opts) => { const r = await fetch(base + p, opts); if (!r.ok) throw new Error(`${p} ${r.status}`); return r; };
const post = (base, p, body) => api(base, p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (base, p) => api(base, p).then((r) => r.json());
const FLUX = 'http://127.0.0.1:7880', AUDIO = 'http://127.0.0.1:7890', HY = 'http://127.0.0.1:7860';
const DONE = ['done', 'complete', 'completed', 'succeeded', 'error', 'failed', 'cancelled'];
async function waitJob(base, id) {
  for (;;) { const j = await get(base, `/api/jobs/${id}`); if (DONE.includes(j.status)) return j; await sleep(2000); }
}
async function download(base, id, name, dest) { const r = await api(base, `/files/${id}/${name}`); fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); }
function ff(args) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); }

async function flux() {
  await post(FLUX, '/api/settings', { freeAfter: false });
  for (const it of M.flux) for (const seed of it.seeds) {
    const dest = path.join(RAW, `${it.id}_s${seed}.png`); if (fs.existsSync(dest)) continue;
    const { id } = await post(FLUX, '/api/jobs', { model: it.model || 'klein', prompt: it.prompt, aspect: it.aspect, megapixels: it.mp, batch: 1, seed });
    const j = await waitJob(FLUX, id);
    if (!j.images || !j.images.length) { console.error('flux fail', it.id, seed, j.status); continue; }
    await download(FLUX, id, j.images[0], dest); console.log('flux', dest);
  }
  await post(FLUX, '/api/backend/free', {}).catch(() => {});
}
// picks: manifest "picks" maps final output (repo-relative) -> {from: raw file, kind}. Converts with ffmpeg.
function picks() {
  for (const [out, p] of Object.entries(M.picks || {})) {
    const dest = path.join(ROOT, out); if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const src = path.join(RAW, p.from);
    if (p.kind === 'pano') execFileSync('python', ['-I', path.join(HERE, 'pano.py'), src, dest], { stdio: 'inherit' });
    else if (p.kind === 'square') ff(['-i', src, '-vf', 'scale=1024:1024:flags=lanczos', '-c:v', 'libwebp', '-quality', '85', dest]);
    else if (p.kind === 'png') fs.copyFileSync(src, dest);
    console.log('pick', out);
  }
}
const ctx = { M, RAW, ROOT, HERE, api, post, get, waitJob, download, ff, HY, AUDIO, sleep };
const cmd = process.argv[2];
if (cmd === 'flux') await flux();
else if (cmd === 'picks') picks();
else if (cmd === 'props') await (await import('./props.mjs')).default(ctx);
else if (cmd === 'audio') await (await import('./audio.mjs')).default(ctx);
else console.log('usage: node run.mjs flux|picks|props|audio');
