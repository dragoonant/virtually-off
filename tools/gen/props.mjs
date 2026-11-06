// Step 2: image-to-3D props via Hunyuan Studio, then post-process (post-props.mjs). Idempotent.
import fs from 'node:fs'; import path from 'node:path';
export default async function props(c) {
  const names = ['pillar', 'bunker', 'gantry', 'pylon'];
  const rawDir = path.join(c.RAW, 'props'); fs.mkdirSync(rawDir, { recursive: true });
  for (const name of names) {
    const raw = path.join(rawDir, `${name}.glb`);
    if (fs.existsSync(raw)) continue;
    const image = fs.readFileSync(path.join(c.ROOT, 'art/props', `${name}.png`)).toString('base64');
    const job = await c.post(c.HY, '/api/jobs', { mode: 'image', name, image, params: { faceCount: 12000, texRes: 1024, cutBase: false, removeBg: true } });
    console.log('hunyuan job', name, job.id);
    let j;
    for (;;) { j = await c.get(c.HY, `/api/jobs/${job.id}`); if (['completed', 'failed', 'cancelled'].includes(j.status)) break; await c.sleep(5000); }
    if (j.status !== 'completed') { console.error('prop failed', name, j.error); continue; }
    fs.writeFileSync(raw, Buffer.from(await (await c.api(c.HY, `/api/jobs/${job.id}/files/textured.glb`)).arrayBuffer()));
    console.log('prop raw', raw);
  }
}
