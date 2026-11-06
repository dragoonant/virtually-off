// Step 3: music / sfx / voice via Audio Studio, then ffmpeg post. Idempotent: skips finals that exist.
// Raw candidates in art/raw/audio/<kind>/. Selection is by measurement only (not verified by ear).
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export default async function audio(c) {
  const R = path.join(c.RAW, 'audio'); const OUT = path.join(c.ROOT, 'public/assets/audio');
  for (const d of ['music', 'sfx', 'voice']) { fs.mkdirSync(path.join(R, d), { recursive: true }); fs.mkdirSync(path.join(OUT, d), { recursive: true }); }
  const only = process.argv[3]; // optional: music|sfx|voice
  const stats = (file, filt = '') => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `${filt}${filt ? ',' : ''}astats=metadata=0:reset=0,ebur128=peak=true`, '-f', 'null', '-'], { encoding: 'utf8' });
    const t = r.stderr; const num = (re) => { const m = [...t.matchAll(re)].pop(); return m ? parseFloat(m[1]) : NaN; };
    return { peak: num(/Peak level dB:\s*(-?[\d.inf]+)/g), rms: num(/RMS level dB:\s*(-?[\d.inf]+)/g), lufs: num(/I:\s+(-?[\d.]+) LUFS/g), tp: num(/Peak:\s+(-?[\d.]+) dBFS/g), lra: num(/LRA:\s+([\d.]+) LU/g) };
  };
  const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
  const run = async (params, n) => {
    const { id } = await c.post(c.AUDIO, '/api/jobs', params);
    const j = await c.waitJob(c.AUDIO, id);
    if (j.status !== 'done' || !j.audios?.length) throw new Error(`audio job ${j.status}: ${j.error}`);
    return { id, names: j.audios };
  };
  const report = JSON.parse(fs.existsSync(path.join(R, 'selection.json')) ? fs.readFileSync(path.join(R, 'selection.json'), 'utf8') : '{}');
  const save = () => fs.writeFileSync(path.join(R, 'selection.json'), JSON.stringify(report, null, 1));

  // ---- music
  if (!only || only === 'music') for (const t of c.M.music) {
    const out = path.join(OUT, 'music', `${t.id}.mp3`); if (fs.existsSync(out)) continue;
    const cands = [];
    for (let k = 0; k < t.cand; k++) {
      const raw = path.join(R, 'music', `${t.id}_c${k}.flac`);
      if (!fs.existsSync(raw)) {
        const { id, names } = await run({ mode: 'music', prompt: t.prompt, lyrics: '[Instrumental]', duration: t.duration, bpm: t.bpm, key: t.key, timesig: '4', steps: 8, batch: 1, seed: t.seed + k });
        await c.download(c.AUDIO, id, names[0], raw);
      }
      const s = stats(raw); cands.push({ raw, ...s, crest: s.peak - s.rms, score: (s.peak - s.rms) - (s.tp > -0.1 ? 10 : 0) });
      console.log('music cand', t.id, k, JSON.stringify(s));
    }
    cands.sort((a, b) => b.score - a.score); const best = cands[0];
    const af = ['loudnorm=I=-16:TP=-1.5:LRA=11']; const args = ['-i', best.raw];
    if (t.loop) { const T = dur(best.raw); args.push('-filter_complex', `[0]atrim=start=${T - 1}[b];[0]atrim=end=${T - 1}[a];[b]asetpts=PTS-STARTPTS[b2];[a]asetpts=PTS-STARTPTS[a2];[b2][a2]acrossfade=d=1:c1=tri:c2=tri,${af[0]}`); }
    else args.push('-af', af.join(','));
    c.ff([...args, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', out]);
    report[`music/${t.id}`] = { picked: path.basename(best.raw), candidates: cands.map((x) => ({ f: path.basename(x.raw), peak: x.peak, rms: x.rms, tp: x.tp, lra: x.lra, crest: +x.crest.toFixed(1) })) }; save();
  }

  // ---- sfx
  if (!only || only === 'sfx') for (const t of c.M.sfx) {
    const out = path.join(OUT, 'sfx', `${t.id}.mp3`); if (fs.existsSync(out)) continue;
    const dir = path.join(R, 'sfx'); const first = path.join(dir, `${t.id}_c0.flac`);
    if (!fs.existsSync(first)) {
      const { id, names } = await run({ mode: 'sfx', prompt: t.prompt, negative: c.M.sfxNegative, seconds: Math.max(1, Math.ceil(t.target)), steps: 50, guidance: 5, batch: 2, seed: 7000 + c.M.sfx.indexOf(t) });
      for (const [i, n] of names.entries()) await c.download(c.AUDIO, id, n, path.join(dir, `${t.id}_c${i}.flac`));
    }
    const trim = `silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.01`;
    const cands = [];
    for (let i = 0; i < 2; i++) {
      const raw = path.join(dir, `${t.id}_c${i}.flac`); if (!fs.existsSync(raw)) continue;
      const tmp = path.join(dir, `${t.id}_c${i}_trim.wav`);
      c.ff(['-i', raw, '-af', `${trim},atrim=0:${t.target},afade=t=out:st=${Math.max(0, t.target - 0.05)}:d=0.05`, tmp]);
      const s = stats(tmp); cands.push({ raw, tmp, ...s, crest: s.peak - s.rms });
    }
    cands.sort((a, b) => b.crest - a.crest); const best = cands[0];
    let af = `volume=${(-1 - best.peak).toFixed(2)}dB`;
    const args = ['-i', best.tmp];
    if (t.id === 'thruster_loop') {
      const rawFull = best.raw; const T = dur(rawFull);
      args.splice(0, 2, '-i', rawFull);
      const cf = 0.4;
      args.push('-filter_complex', `[0]atrim=start=${T - cf},asetpts=PTS-STARTPTS[b];[0]atrim=end=${T - cf},asetpts=PTS-STARTPTS[a];[b][a]acrossfade=d=${cf}:c1=tri:c2=tri,${af}`);
    } else args.push('-af', af);
    c.ff([...args, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
    report[`sfx/${t.id}`] = { picked: path.basename(best.raw), candidates: cands.map((x) => ({ f: path.basename(x.raw), peak: x.peak, rms: x.rms, crest: +x.crest.toFixed(1) })) }; save();
    console.log('sfx', t.id, 'crest', best.crest.toFixed(1));
  }

  // ---- voice
  if (!only || only === 'voice') for (const [id, text] of Object.entries(c.M.voice.lines)) {
    const out = path.join(OUT, 'voice', `${id}.mp3`); if (fs.existsSync(out)) continue;
    const raw = path.join(R, 'voice', `${id}.wav`);
    if (!fs.existsSync(raw)) {
      const { id: jid, names } = await run({ mode: 'voice', model: 'qwen-design', text, instruct: c.M.voice.instruct, language: 'English', seed: c.M.voice.seed });
      await c.download(c.AUDIO, jid, names[0], raw);
    }
    const sr = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
    c.ff(['-i', raw, '-af', `${sr},areverse,${sr},areverse,loudnorm=I=-18:TP=-1.5:LRA=7`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
    console.log('voice', id, dur(out).toFixed(2), 's');
  }

  // ---- manifest
  const man = { music: {}, sfx: {}, voice: {}, durations: { music: {}, sfx: {}, voice: {} } };
  for (const k of ['music', 'sfx', 'voice']) for (const f of fs.readdirSync(path.join(OUT, k)).filter((x) => x.endsWith('.mp3')).sort()) {
    const id = f.replace('.mp3', ''); man[k][id] = `${k}/${f}`; man.durations[k][id] = +dur(path.join(OUT, k, f)).toFixed(2);
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(man, null, 1));
}
