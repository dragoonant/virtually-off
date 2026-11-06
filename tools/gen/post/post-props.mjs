// Post-process raw Hunyuan GLBs: flatten, bake transforms, centre x/z, bottom at y=0, tallest side = 1.0,
// dedup/weld/prune, textures resized to <=1024 as WebP. No meshopt/draco. Usage: node post-props.mjs <rawDir> <outDir>
import fs from 'node:fs'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, prune, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import { mat4 } from 'gl-matrix';

const [rawDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions([EXTTextureWebP]);
const report = {};
for (const f of fs.readdirSync(rawDir).filter((x) => x.endsWith('.glb'))) {
  const doc = await io.read(path.join(rawDir, f));
  const root = doc.getRoot(); const scene = root.listScenes()[0];
  await doc.transform(flatten(), dedup(), weld());
  // bake world matrices into meshes, drop node transforms
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    transformMesh(mesh, node.getWorldMatrix());
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  const b = getBounds(scene);
  const size = b.max.map((v, i) => v - b.min[i]);
  const s = 1 / Math.max(...size);
  const m = mat4.create();
  mat4.scale(m, m, [s, s, s]);
  mat4.translate(m, m, [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  const done = new Set();
  for (const node of root.listNodes()) { const mesh = node.getMesh(); if (mesh && !done.has(mesh)) { transformMesh(mesh, m); done.add(mesh); } }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }),
    prune(),
  );
  const out = path.join(outDir, f);
  await io.write(out, doc);
  const b2 = getBounds(doc.getRoot().listScenes()[0]);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  report[f] = { bytes: fs.statSync(out).size, tris, min: b2.min.map((v) => +v.toFixed(3)), max: b2.max.map((v) => +v.toFixed(3)) };
}
console.log(JSON.stringify(report, null, 1));
