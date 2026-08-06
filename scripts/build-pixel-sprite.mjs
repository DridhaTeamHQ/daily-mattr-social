/**
 * Turns a LottieFiles "Lottie Web (SVG)" export into a sprite sheet.
 *
 *   node scripts/build-pixel-sprite.mjs "Loading 52 | Mario.svg" public/mario-sprite.png
 *
 * That export is a flipbook: every frame is a top-level <g> and a SMIL
 * <animate> flips their visibility in turn. Shipping it as-is means 540KB of
 * individual 4px squares, or a Lottie runtime to play the .lottie — for a
 * figure 38px wide. This pulls the frames out and lays them in a row instead:
 * 2.5KB, one image, and CSS steps() to advance it.
 *
 * Pixel art only ever gets nearest-neighbour resampling here, and the frames
 * share one bounding box so the run cycle keeps its bob instead of every frame
 * being snapped to the same baseline.
 */
import fs from "node:fs";
import sharp from "sharp";

const [src, out = "public/mario-sprite.png"] = process.argv.slice(2);
if (!src) {
  console.error("usage: node scripts/build-pixel-sprite.mjs <animated.svg> [out.png]");
  process.exit(1);
}

const FRAME_H = 64; // on-screen height, and the native size — see globals.css

const svg = fs.readFileSync(src, "utf8");
const head = svg.slice(0, svg.indexOf(">", svg.indexOf("<svg")) + 1);

// Walk the top level and take every direct <g> child of <svg>. Depth tracking
// rather than a regex for the whole element: these groups nest hundreds deep.
const tag = /<(\/?)(\w[\w:-]*)([^>]*?)(\/?)>/g;
const frames = [];
let depth = 0;
let start = null;
tag.lastIndex = head.length;
for (let m; (m = tag.exec(svg)); ) {
  const [, closing, name, , selfClosing] = m;
  if (selfClosing) continue;
  if (!closing) {
    if (depth === 0 && name === "g") start = m.index;
    depth += 1;
  } else {
    depth -= 1;
    if (depth === 0 && start !== null && name === "g") {
      frames.push(svg.slice(start, m.index + m[0].length));
      start = null;
    }
  }
}
console.log(`${frames.length} frames`);

// Each frame becomes a still: no SMIL, and visible rather than hidden.
const stills = await Promise.all(
  frames.map((g) =>
    sharp(
      Buffer.from(
        head + g.replace(/<animate\b[^>]*\/>/g, "").replace('visibility="hidden"', "") + "</svg>",
      ),
      { density: 220 },
    )
      .png()
      .toBuffer(),
  ),
);

// One bounding box across every frame, so the vertical travel survives.
let left = Infinity, top = Infinity, right = -1, bottom = -1;
for (const still of stills) {
  const { data, info } = await sharp(still).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
}
const width = right - left + 1;
const height = bottom - top + 1;
const FRAME_W = Math.round((width * FRAME_H) / height);

const cells = await Promise.all(
  stills.map(async (still, i) => ({
    input: await sharp(still)
      .extract({ left, top, width, height })
      .resize({ width: FRAME_W, height: FRAME_H, kernel: "nearest" })
      .png()
      .toBuffer(),
    left: i * FRAME_W,
    top: 0,
  })),
);

await sharp({
  create: {
    width: FRAME_W * stills.length,
    height: FRAME_H,
    channels: 4,
    background: "#00000000",
  },
})
  .composite(cells)
  .png({ compressionLevel: 9, palette: true })
  .toFile(out);

console.log(
  `frame ${FRAME_W}x${FRAME_H} · sheet ${FRAME_W * stills.length}x${FRAME_H} · ` +
    `${(fs.statSync(out).size / 1024).toFixed(1)}KB → ${out}`,
);
console.log(
  `globals.css: width ${FRAME_W}px, background-size ${FRAME_W * stills.length}px ${FRAME_H}px, ` +
    `steps(${stills.length}), keyframe to -${FRAME_W * stills.length}px`,
);
