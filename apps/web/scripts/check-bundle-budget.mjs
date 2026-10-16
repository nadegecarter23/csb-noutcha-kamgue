import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const assetsDirectory = resolve('dist/assets');
const files = await readdir(assetsDirectory);
const javascript = await Promise.all(
  files
    .filter((file) => file.endsWith('.js'))
    .map(async (file) => ({
      file,
      bytes: (await stat(resolve(assetsDirectory, file))).size,
    })),
);
const maximumChunkBytes = 500 * 1024;
const maximumTotalBytes = 950 * 1024;
const totalBytes = javascript.reduce((sum, item) => sum + item.bytes, 0);
const oversized = javascript.filter((item) => item.bytes > maximumChunkBytes);

if (oversized.length || totalBytes > maximumTotalBytes) {
  const details = oversized.map((item) => `${item.file}=${item.bytes}`).join(', ');
  throw new Error(
    `Budget JavaScript dépassé : total=${totalBytes}/${maximumTotalBytes}` +
      (details ? ` ; chunks=${details}` : ''),
  );
}

process.stdout.write(
  `Budget JavaScript respecté : ${javascript.length} chunks, ${totalBytes} octets au total.\n`,
);
