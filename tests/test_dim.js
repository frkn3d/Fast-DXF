// Ölçü testi: boş şablona 5 tür ölçü (biri döndürülmüş) ekle → kaydet → yeniden oku (blok örneği + yazı) ; dosyayı yaz
// Kullanım: node tests/test_dim.js cikti.dxf
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const core = require('../js/dxf-core.js')();
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/template.js'), 'utf8') + ';this.T = NEW_DXF_TEMPLATE;', ctx);
const enc = core.makeEncoder('windows-1254');
const bytes = enc(ctx.T);
function parse(b) {
  const out = { E: [], TX: [], inst: 0, info: null, seg: 0 };
  core.parseStream((o, l) => b.subarray(o, o + l), b.length, {}, (type, d) => {
    if (type === 'ents') for (let i = 0; i < d.type.length; i++) out.E.push({ type: core.TYPE_NAMES[d.type[i]], vc: d.vc[i], ic: d.ic[i], tc: d.tc[i] });
    else if (type === 'texts') out.TX.push(...d.str);
    else if (type === 'inst') out.inst += d.blk.length;
    else if (type === 'done') out.info = d;
  });
  return out;
}
const A = parse(bytes);
const base = { type: 'DIMENSION', layer: '0', z: 0, h: 2.5, dec: 2 };
const news = [
  { kind: 'linear', x1: 0, y1: 0, x2: 40, y2: 0, lx: 20, ly: 10, rot: 0 },
  { kind: 'aligned', x1: 0, y1: 20, x2: 30, y2: 40, lx: 5, ly: 45 },
  { kind: 'radius', cx: 60, cy: 20, x2: 70, y2: 20 },
  { kind: 'diameter', cx: 90, cy: 20, x2: 98, y2: 26 },
  { kind: 'angular', cx: 0, cy: -40, x1: 30, y1: -40, x2: 0, y2: -10, lx: 20, ly: -20 }
].map(d => ({ def: Object.assign({}, base, d) }));
// döndürülmüş kopya (3B yol olmayan düzlem dönüşüm)
news.push({ def: Object.assign({}, base, { kind: 'linear', x1: 0, y1: 0, x2: 40, y2: 0, lx: 20, ly: 10, rot: 0 }), ed: { T: [0, -1, 1, 0, 200, 0, 1, 0] } });
const info = A.info;
const msg = { size: bytes.length, mode: 'full', encoding: info.encoding, eol: info.eol, version: info.version, owner: info.modelHandle, handseed: info.handseed, handseedHex: info.handseedHex,
  entStart: info.entStart, entEnd: info.entEnd, ops: [], copies: [], news, newLayers: [], layerEnd: info.layerEnd, layerTableHandle: info.layerTableHandle,
  brEnd: info.brEnd, brTableHandle: info.brTableHandle, blocksEnd: info.blocksEnd, dimMax: info.dimMax };
console.log('şablon: brEnd', info.brEnd, 'blocksEnd', info.blocksEnd, 'dimMax', info.dimMax, 'stiller', info.dimstyles);
const res = core.buildSaveParts((a, b) => bytes.subarray(a, b), msg);
const parts = res.parts.map(p => Array.isArray(p) ? bytes.subarray(p[0], p[1]) : p);
const outB = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let k = 0; for (const p of parts) { outB.set(p, k); k += p.length; }
fs.writeFileSync(process.argv[2] || 'dim_out.dxf', outB);
const B = parse(outB);
const dims = B.E.filter(e => e.type === 'DIMENSION');
console.log('ölçü', dims.length, 'blok örneği', dims.filter(e => e.ic > 0).length, 'yazılar', JSON.stringify(B.TX));
const ok = dims.length === 6 && dims.every(e => e.ic === 1) && B.TX.length >= 6;
console.log(ok ? 'TAMAM' : 'HATA');
