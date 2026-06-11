import fs from 'fs';
import path from 'path';

const src = path.join(__dirname, '../data/db.json');
const dest = process.env.DATA_DIR ?? path.join(__dirname, '../data/db.json');

if (src === dest) {
  console.log('Source and destination are the same — nothing to do.');
  process.exit(0);
}

fs.copyFileSync(src, dest);
console.log(`Copied ${fs.statSync(dest).size} bytes to ${dest}`);