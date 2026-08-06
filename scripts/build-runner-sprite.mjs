/**
 * Turns a generated run-cycle sheet into public/runner-sprite.webp.
 *
 * The source is one image with four frames of the same character in a row on
 * a white background — what an image model gives you when you ask for a sprite
 * sheet. This does the two things it cannot: cuts the background out without
 * eating the white sneakers, and normalises the frames so they share a canvas.
 *
 *   node scripts/build-runner-sprite.mjs <sheet.png>
 *
 * Re-run it with a new sheet to change the character; nothing else moves,
 * because the CSS reads the frame size from the file it is given.
 */
import sharp from "sharp";
import fs from "node:fs";

const SRC = process.argv[2] ?? ".sprite/b.png";
const FRAMES = 4;

const img = sharp(SRC).ensureAlpha();
const { width, height } = await img.metadata();
const { data } = await img.raw().toBuffer({ resolveWithObject: true });

// Flood fill the white background from the edges. A blanket "white is
// transparent" rule would punch holes in the sneakers; reachability from the
// border is what actually distinguishes background from a white object.
const NEAR_WHITE = 232;
const idx = (x, y) => (y * width + x) * 4;
const isWhite = (i) => data[i] > NEAR_WHITE && data[i + 1] > NEAR_WHITE && data[i + 2] > NEAR_WHITE;

const seen = new Uint8Array(width * height);
const stack = [];
for (let x = 0; x < width; x++) { stack.push([x, 0], [x, height - 1]); }
for (let y = 0; y < height; y++) { stack.push([0, y], [width - 1, y]); }

while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= width || y >= height) continue;
  const p = y * width + x;
  if (seen[p]) continue;
  const i = idx(x, y);
  if (!isWhite(i)) continue;
  seen[p] = 1;
  data[i + 3] = 0;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Vertical bounds of everything that survived, shared across all four frames
// so the run cycle keeps its natural rise and fall.
let top = height, bottom = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (data[idx(x, y) + 3] > 8) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
  }
}
const pad = 6;
top = Math.max(0, top - pad);
bottom = Math.min(height - 1, bottom + pad);
console.log(`content rows ${top}..${bottom} of ${height}`);

const cut = sharp(data, { raw: { width, height, channels: 4 } })
  .extract({ left: 0, top, width, height: bottom - top + 1 });

// One frame is a quarter of the sheet. 128px tall is two device pixels per
// CSS pixel at the size it renders, which is as much as a 64px figure can use.
const FRAME_H = 128;
const scale = FRAME_H / (bottom - top + 1);
const FRAME_W = Math.round((width / FRAMES) * scale);

await cut
  .resize({ width: FRAME_W * FRAMES, height: FRAME_H, fit: "fill" })
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile("public/runner-sprite.webp");

console.log(`frame ${FRAME_W}x${FRAME_H}, sheet ${FRAME_W * FRAMES}x${FRAME_H}`);
console.log(`${(fs.statSync("public/runner-sprite.webp").size / 1024).toFixed(1)} KB`);
