import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([len, typeAndData, crcBuf]);
}

function generatePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdr);

  // Raw RGBA pixels with ZemiFix branding
  // Background: #0B1336 (R: 11, G: 19, B: 54, A: 255)
  // Orange Accent: #FF5B00 (R: 255, G: 91, B: 0, A: 255)
  // White: #FFFFFF (R: 255, G: 255, B: 255, A: 255)
  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowSize);

  const center = size / 2;
  const margin = size * 0.15;
  const logoRadius = size * 0.35;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // None filter

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded container / shield logo shape
      let r = 11, g = 19, b = 54, a = 255; // #0B1336 background

      // Inner icon emblem
      if (dist <= logoRadius) {
        // Z / Wrench geometric icon pattern
        const inOrangeBox = Math.abs(dx) < size * 0.22 && Math.abs(dy) < size * 0.22;
        const isDiagonal = Math.abs(dx + dy) < size * 0.08 && Math.abs(dx) < size * 0.18;
        const isHorizontalTop = dy < -size * 0.10 && dy > -size * 0.18 && Math.abs(dx) < size * 0.18;
        const isHorizontalBottom = dy > size * 0.10 && dy < size * 0.18 && Math.abs(dx) < size * 0.18;

        if (isDiagonal || isHorizontalTop || isHorizontalBottom) {
          r = 255; g = 91; b = 0; // #FF5B00 Orange Z/Mark
        } else if (inOrangeBox) {
          r = 255; g = 255; b = 255; // White
        } else {
          r = 15; g = 25; b = 70; // Slightly lighter navy ring
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = writeChunk('IDAT', compressedData);
  const iendChunk = writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.join(process.cwd(), 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), generatePng(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), generatePng(512));

console.log('Successfully generated public/icon-192.png and public/icon-512.png!');
