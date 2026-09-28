import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const [, , input, output, widthStr] = process.argv;
const width = Number(widthStr ?? 1400);
const svg = readFileSync(input, 'utf8');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: '#07110D' });
const png = resvg.render().asPng();
writeFileSync(output, png);
console.log(`${output} (${width}px)`);
