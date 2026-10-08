// Kullanım: node tests/test_parse.js dosya.dxf [dosya2.dxf ...]
// Ayrıştırıcıyı tarayıcı olmadan çalıştırır, süre ve istatistikleri yazar.
const fs = require('fs');
const path = require('path');
const DXFCore = require(path.join(__dirname, '..', 'js', 'dxf-core.js'));
const core = DXFCore();

function parseFile(file, opts) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (off, len) => { const b = Buffer.allocUnsafe(len); fs.readSync(fd, b, 0, len, off); return new Uint8Array(b.buffer, b.byteOffset, len); };
  const res = { chunks: 0, verts: 0, pts: 0, ents: 0, texts: 0, inst: 0, blocks: 0, blockVerts: 0, layers: 0, done: null, entArr: [] };
  const t0 = Date.now();
  core.parseStream(read, size, opts || {}, (type, d) => {
    if (type === 'chunk') { res.chunks++; res.verts += d.pos.length / 2; res.pts += d.ppos.length / 2; }
    else if (type === 'ents') { res.ents += d.type.length; res.entArr.push(d); }
    else if (type === 'texts') res.texts += d.x.length;
    else if (type === 'inst') res.inst += d.blk.length;
    else if (type === 'blocks') { res.blocks += d.length; for (const b of d) res.blockVerts += b.pos.length / 2; }
    else if (type === 'layers') res.layers = d.length;
    else if (type === 'done') res.done = d;
  });
  fs.closeSync(fd);
  res.ms = Date.now() - t0; res.size = size;
  return res;
}

if (require.main === module) {
  for (const f of process.argv.slice(2)) {
    const r = parseFile(f);
    const d = r.done;
    console.log('\n== ' + path.basename(f) + ' (' + (r.size / 1048576).toFixed(1) + ' MB)');
    console.log('  süre: ' + r.ms + ' ms  (' + (r.size / 1048576 / (r.ms / 1000)).toFixed(0) + ' MB/s)');
    console.log('  sürüm ' + d.version + '  kodsayfası ' + d.codepage + ' -> ' + d.encoding + '  eol ' + JSON.stringify(d.eol) + '  ikili=' + d.binary);
    console.log('  varlık ' + r.ents + '  köşe ' + r.verts + '  nokta ' + r.pts + '  yazı ' + r.texts + '  blok ref ' + r.inst + '  blok ' + r.blocks + ' (' + r.blockVerts + ' köşe)  katman ' + r.layers);
    console.log('  tipler', JSON.stringify(d.stats));
    console.log('  desteklenmeyen', JSON.stringify(d.unsupported), ' uyarılar', JSON.stringify(d.warnings));
    console.log('  entStart ' + d.entStart + ' entEnd ' + d.entEnd + ' handseed ' + JSON.stringify(d.handseed) + ' ' + d.handseedHex + ' model ' + d.modelHandle);
    console.log('  origin ' + d.origin + ' ext ' + d.ext.map(v => v.toFixed(1)));
    console.log('  bellek ' + (process.memoryUsage().rss / 1048576).toFixed(0) + ' MB');
  }
}
module.exports = { parseFile, core };
