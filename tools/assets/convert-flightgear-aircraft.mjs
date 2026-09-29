import assimpjs from 'assimpjs';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { dedup, flatten, join, prune, weld } from '@gltf-transform/functions';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const aircraftRoot = path.join(repositoryRoot, 'public/assets/aircraft');
const io = new NodeIO();

const sourceModels = [
  {
    name: 'Su-27 Flanker',
    directory: path.join(aircraftRoot, 'su27'),
    input: [
      {
        path: 'Su-27.ac',
        source: 'source/Su-27.ac',
        transform: source => source.replaceAll('RussianKnights.png', 'RusAF871FR.png'),
      },
      { path: 'RusAF871FR.png', source: 'source/RusAF871FR.png' },
      { path: 'fabric.png', source: 'source/fabric.png' },
    ],
    output: 'su27.glb',
  },
  {
    name: 'MiG-29 Fulcrum',
    directory: path.join(aircraftRoot, 'mig29'),
    input: [
      { path: 'MiG-29.ac', source: 'source/MiG-29.ac' },
      { path: 'MiG-29_1.png', source: 'source/MiG-29_1.png' },
      { path: 'MiG-29_2.png', source: 'source/MiG-29_2.png' },
      { path: 'BortNum1Blue.png', source: 'source/BortNum1Blue.png' },
    ],
    output: 'mig29.glb',
  },
];

const assimp = await assimpjs();

for (const model of sourceModels) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'ilmatila-aircraft-'));
  try {
    const sourceFiles = await Promise.all(model.input.map(async file => {
      let content = await readFile(path.join(model.directory, file.source));
      if (file.transform) content = Buffer.from(file.transform(content.toString('utf8')));
      return { name: file.path, content };
    }));

    const fileList = new assimp.FileList();
    for (const file of sourceFiles) {
      fileList.AddFile(file.name, file.content);
      await writeFile(path.join(temporaryDirectory, file.name), file.content);
    }

    const converted = assimp.ConvertFileList(fileList, 'glb2');
    if (!converted.IsSuccess() || converted.FileCount() === 0) {
      throw new Error(`${model.name} conversion failed: ${converted.GetErrorCode()}`);
    }

    for (let index = 0; index < converted.FileCount(); index++) {
      const file = converted.GetFile(index);
      await writeFile(path.join(temporaryDirectory, file.GetPath()), Buffer.from(file.GetContent()));
    }

    const intermediatePath = path.join(temporaryDirectory, 'result.glb');
    const document = await io.read(intermediatePath);
    await document.transform(
      dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.MESH] }),
      flatten(),
      join({ keepNamed: false }),
      weld({}),
      prune(),
    );
    const outputPath = path.join(model.directory, model.output);
    await io.write(outputPath, document);
    const output = await stat(outputPath);
    console.log(`${model.name}: ${document.getRoot().listMeshes().length} batches, ${(output.size / 1024).toFixed(0)} KiB`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
