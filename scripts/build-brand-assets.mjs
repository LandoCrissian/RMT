import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The master is the selected RMT redesign. Resizing never changes its artwork.
const master = fileURLToPath(new URL('../public/brand/rmt-icon-master-v5.png', import.meta.url));
const icons = fileURLToPath(new URL('../public/icons/', import.meta.url));
await mkdir(icons, { recursive: true });
const sizes = [
  ['rmt-mark-v5.png', 192],
  ['rmt-512-v5.png', 512],
  ['rmt-180-v5.png', 180],
  ['rmt-32-v5.png', 32],
];
for (const [name, size] of sizes) {
  await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toFile(`${icons}/${name}`);
}
console.log(`Prepared ${sizes.length} RMT icon sizes.`);
