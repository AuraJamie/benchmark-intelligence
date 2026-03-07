import fs from 'fs';
const text = fs.readFileSync('out.txt', 'utf16le');
console.log(text);
