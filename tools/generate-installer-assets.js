/**
 * Generates installer assets (icon.ico, sidebar BMP, header BMP)
 * for LauncherChef with the dark + green neon (#00FF41) theme.
 * No external dependencies - pure Node.js buffer manipulation.
 */
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

// Colors (BGR for BMP format)
const BG = { r: 13, g: 13, b: 13 };         // #0D0D0D
const GREEN = { r: 0, g: 255, b: 65 };       // #00FF41
const DARK_GREEN = { r: 0, g: 180, b: 30 };  // #00B41E
const DIM_GREEN = { r: 0, g: 80, b: 20 };    // #005014
const WHITE = { r: 255, g: 255, b: 255 };

// ============================================================
//  BMP GENERATION (24-bit uncompressed)
// ============================================================
function createBMP(width, height, pixelCallback) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4 bytes
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize, 0);

  // BMP Header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset

  // DIB Header (40 bytes - BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26);  // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30);  // no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeUInt32LE(2835, 38); // h resolution (72 DPI)
  buf.writeUInt32LE(2835, 42); // v resolution

  // Pixel data (bottom-up)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = pixelCallback(x, height - 1 - y); // flip Y for bottom-up
      const offset = 54 + y * rowSize + x * 3;
      buf[offset] = color.b;     // Blue
      buf[offset + 1] = color.g; // Green
      buf[offset + 2] = color.r; // Red
    }
  }

  return buf;
}

// ============================================================
//  SIMPLE PIXEL FONT (5x7 uppercase + digits)
// ============================================================
const FONT = {
  'L': [0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  'A': [0x0E,0x11,0x11,0x1F,0x11,0x11,0x11],
  'U': [0x11,0x11,0x11,0x11,0x11,0x11,0x0E],
  'N': [0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  'C': [0x0E,0x11,0x10,0x10,0x10,0x11,0x0E],
  'H': [0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  'E': [0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F],
  'R': [0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  'F': [0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  'V': [0x11,0x11,0x11,0x11,0x0A,0x0A,0x04],
  '2': [0x0E,0x11,0x01,0x02,0x04,0x08,0x1F],
  '.': [0x00,0x00,0x00,0x00,0x00,0x00,0x04],
  '0': [0x0E,0x11,0x13,0x15,0x19,0x11,0x0E],
};

function drawText(pixelCallback, text, startX, startY, color, scale) {
  const s = scale || 1;
  let cx = startX;
  for (const ch of text) {
    const glyph = FONT[ch.toUpperCase()] || FONT[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row] & (0x10 >> col)) {
          for (let sy = 0; sy < s; sy++) {
            for (let sx = 0; sx < s; sx++) {
              pixelCallback(cx + col * s + sx, startY + row * s + sy, color);
            }
          }
        }
      }
    }
    cx += (5 + 1) * s;
  }
}

// ============================================================
//  CHEF HAT ICON (pixel art on 32x32, 48x48, 256x256)
// ============================================================
// Simple chef hat design for pixel art
function drawChefHatIcon(size) {
  const pixels = [];
  for (let i = 0; i < size * size; i++) pixels.push({ ...BG });

  const s = size / 32; // scale factor relative to 32px base

  function setPixel(x, y, color) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px >= 0 && px < size && py >= 0 && py < size) {
      pixels[py * size + px] = { ...color };
    }
  }

  function fillRect(x1, y1, x2, y2, color) {
    for (let y = Math.round(y1); y <= Math.round(y2); y++) {
      for (let x = Math.round(x1); x <= Math.round(x2); x++) {
        setPixel(x, y, color);
      }
    }
  }

  function fillCircle(cx, cy, r, color) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          setPixel(Math.round(cx + x), Math.round(cy + y), color);
        }
      }
    }
  }

  // Chef hat - top puff (3 circles)
  const hatCY = 10 * s;
  fillCircle(16 * s, hatCY, 6 * s, GREEN);
  fillCircle(10 * s, (hatCY + 2 * s), 5 * s, GREEN);
  fillCircle(22 * s, (hatCY + 2 * s), 5 * s, GREEN);

  // Hat band
  fillRect(8 * s, 16 * s, 24 * s, 18 * s, DARK_GREEN);

  // Hat body
  fillRect(9 * s, 14 * s, 23 * s, 16 * s, GREEN);

  // Inner detail - dark line
  fillRect(10 * s, 15 * s, 22 * s, 15 * s, DIM_GREEN);

  // Bottom rim
  fillRect(7 * s, 18 * s, 25 * s, 20 * s, GREEN);

  // Small "C" below hat for "Chef"
  const letterY = 23 * s;
  const letterX = 12 * s;
  const ls = Math.max(1, Math.round(s * 0.8));
  // Draw a small C
  fillRect(letterX, letterY, letterX + 4 * ls, letterY + ls - 1, GREEN);
  fillRect(letterX, letterY, letterX + ls - 1, letterY + 5 * ls, GREEN);
  fillRect(letterX, letterY + 5 * ls, letterX + 4 * ls, letterY + 6 * ls - 1, GREEN);

  return pixels;
}

// ============================================================
//  ICO FILE GENERATION
// ============================================================
function createICO(sizes) {
  const images = sizes.map(size => {
    const pixels = drawChefHatIcon(size);
    // Create 32-bit BGRA bitmap data (no file header, no DIB header for ICO)
    const data = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // ICO stores bottom-up
        const srcIdx = y * size + x;
        const dstIdx = ((size - 1 - y) * size + x) * 4;
        const p = pixels[srcIdx];
        data[dstIdx] = p.b;
        data[dstIdx + 1] = p.g;
        data[dstIdx + 2] = p.r;
        // Alpha: transparent for background, opaque for content
        data[dstIdx + 3] = (p.r === BG.r && p.g === BG.g && p.b === BG.b) ? 0 : 255;
      }
    }

    // DIB header (BITMAPINFOHEADER) for ICO entry
    const dibHeader = Buffer.alloc(40);
    dibHeader.writeUInt32LE(40, 0);
    dibHeader.writeInt32LE(size, 4);
    dibHeader.writeInt32LE(size * 2, 8); // double height (XOR + AND)
    dibHeader.writeUInt16LE(1, 12);
    dibHeader.writeUInt16LE(32, 14); // 32 bits per pixel
    dibHeader.writeUInt32LE(0, 16);
    dibHeader.writeUInt32LE(data.length, 20);

    // AND mask (1-bit, rows padded to 4 bytes)
    const andRowSize = Math.ceil(size / 32) * 4;
    const andMask = Buffer.alloc(andRowSize * size, 0); // all opaque in alpha, but AND mask 0 = opaque

    return { size, dibHeader, data, andMask };
  });

  // ICO file structure
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * images.length;
  let dataOffset = headerSize + dirSize;

  // Calculate total size
  let totalSize = dataOffset;
  for (const img of images) {
    totalSize += img.dibHeader.length + img.data.length + img.andMask.length;
  }

  const ico = Buffer.alloc(totalSize);

  // ICO header
  ico.writeUInt16LE(0, 0);     // reserved
  ico.writeUInt16LE(1, 2);     // type: 1 = ICO
  ico.writeUInt16LE(images.length, 4);

  // Directory entries
  let currentOffset = dataOffset;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const entryOffset = 6 + i * 16;
    const imgDataSize = img.dibHeader.length + img.data.length + img.andMask.length;

    ico[entryOffset] = img.size >= 256 ? 0 : img.size;     // width
    ico[entryOffset + 1] = img.size >= 256 ? 0 : img.size; // height
    ico[entryOffset + 2] = 0;   // color palette
    ico[entryOffset + 3] = 0;   // reserved
    ico.writeUInt16LE(1, entryOffset + 4);  // planes
    ico.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    ico.writeUInt32LE(imgDataSize, entryOffset + 8);
    ico.writeUInt32LE(currentOffset, entryOffset + 12);

    // Write image data
    img.dibHeader.copy(ico, currentOffset);
    img.data.copy(ico, currentOffset + img.dibHeader.length);
    img.andMask.copy(ico, currentOffset + img.dibHeader.length + img.data.length);

    currentOffset += imgDataSize;
  }

  return ico;
}

// ============================================================
//  SIDEBAR BMP (164 x 314) - Dark background with green accents
// ============================================================
function generateSidebar() {
  const W = 164, H = 314;
  const canvas = [];
  for (let i = 0; i < W * H; i++) canvas.push({ ...BG });

  function setP(x, y, color) {
    if (x >= 0 && x < W && y >= 0 && y < H) canvas[y * W + x] = { ...color };
  }

  // Gradient stripe on the right edge
  for (let y = 0; y < H; y++) {
    const intensity = Math.sin((y / H) * Math.PI);
    const g = Math.round(255 * 0.1 + 145 * intensity);
    const r = 0;
    const b = Math.round(g * 0.25);
    for (let x = W - 3; x < W; x++) {
      setP(x, y, { r, g, b });
    }
  }

  // Accent line at top
  for (let x = 10; x < W - 10; x++) {
    setP(x, 20, GREEN);
    setP(x, 21, DARK_GREEN);
  }

  // Draw chef hat icon (small, centered)
  const hatSize = 48;
  const hatPixels = drawChefHatIcon(hatSize);
  const hatX = Math.floor((W - hatSize) / 2);
  const hatY = 40;
  for (let y = 0; y < hatSize; y++) {
    for (let x = 0; x < hatSize; x++) {
      const p = hatPixels[y * hatSize + x];
      if (!(p.r === BG.r && p.g === BG.g && p.b === BG.b)) {
        setP(hatX + x, hatY + y, p);
      }
    }
  }

  // Text "LAUNCHER" below hat
  const textCanvas = [];
  function textSetP(x, y, color) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      setP(x, y, color);
    }
  }
  drawText(textSetP, 'LAUNCHER', 20, 100, GREEN, 2);
  drawText(textSetP, 'CHEF', 44, 120, DARK_GREEN, 2);

  // Version text
  drawText(textSetP, 'V2.0.0', 46, 150, DIM_GREEN, 1);

  // Decorative dots pattern
  for (let y = 180; y < 290; y += 12) {
    for (let x = 20; x < W - 20; x += 12) {
      const dist = Math.sqrt(Math.pow(x - W / 2, 2) + Math.pow(y - 235, 2));
      if (dist < 60) {
        setP(x, y, DIM_GREEN);
      }
    }
  }

  // Bottom accent line
  for (let x = 10; x < W - 10; x++) {
    setP(x, 294, DARK_GREEN);
    setP(x, 295, GREEN);
  }

  return createBMP(W, H, (x, y) => canvas[y * W + x]);
}

// ============================================================
//  HEADER BMP (150 x 57) - Compact dark header with green accent
// ============================================================
function generateHeader() {
  const W = 150, H = 57;
  const canvas = [];
  for (let i = 0; i < W * H; i++) canvas.push({ ...BG });

  function setP(x, y, color) {
    if (x >= 0 && x < W && y >= 0 && y < H) canvas[y * W + x] = { ...color };
  }

  // Green accent top border
  for (let x = 0; x < W; x++) {
    setP(x, 0, GREEN);
    setP(x, 1, DARK_GREEN);
  }

  // Small chef hat
  const hatSize = 32;
  const hatPixels = drawChefHatIcon(hatSize);
  const hatX = W - hatSize - 8;
  const hatY = Math.floor((H - hatSize) / 2) + 2;
  for (let y = 0; y < hatSize; y++) {
    for (let x = 0; x < hatSize; x++) {
      const p = hatPixels[y * hatSize + x];
      if (!(p.r === BG.r && p.g === BG.g && p.b === BG.b)) {
        setP(hatX + x, hatY + y, p);
      }
    }
  }

  // Green bottom border
  for (let x = 0; x < W; x++) {
    setP(x, H - 2, DARK_GREEN);
    setP(x, H - 1, GREEN);
  }

  return createBMP(W, H, (x, y) => canvas[y * W + x]);
}

// ============================================================
//  UNINSTALLER SIDEBAR (same as installer but red tint)
// ============================================================

// ============================================================
//  GENERATE ALL
// ============================================================
console.log('Generating installer assets...');

// 1. Icon (multiple sizes for ICO)
const ico = createICO([16, 32, 48, 256]);
fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico);
console.log('  -> build/icon.ico (' + ico.length + ' bytes)');

// 2. Sidebar BMP
const sidebar = generateSidebar();
fs.writeFileSync(path.join(BUILD_DIR, 'installerSidebar.bmp'), sidebar);
console.log('  -> build/installerSidebar.bmp (' + sidebar.length + ' bytes)');

// 3. Header BMP
const header = generateHeader();
fs.writeFileSync(path.join(BUILD_DIR, 'installerHeader.bmp'), header);
console.log('  -> build/installerHeader.bmp (' + header.length + ' bytes)');

console.log('Done! All assets generated in build/ directory.');
