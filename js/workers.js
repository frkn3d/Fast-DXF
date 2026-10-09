/* DXF Okuyucu — Web Worker başlatıcıları.
 * file:// altında ayrı .js dosyasından worker açılamadığı için worker kodu
 * DXFCore ile birlikte metne çevrilip Blob URL'den başlatılır. */
'use strict';

function parseWorkerMain() {
  const core = DXFCore();
  self.onmessage = (e) => {
    const { file, opts } = e.data;
    try {
      const fr = new FileReaderSync();
      const read = (off, len) => new Uint8Array(fr.readAsArrayBuffer(file.slice(off, off + len)));
      core.parseStream(read, file.size, opts || {}, (type, data, transfer) => self.postMessage({ type, data }, transfer || []));
    } catch (err) {
      self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
    }
  };
}

function saveWorkerMain() {
  const core = DXFCore();
  self.onmessage = (e) => {
    const { file, msg } = e.data;
    try {
      const fr = new FileReaderSync();
      const read = (a, b) => new Uint8Array(fr.readAsArrayBuffer(file.slice(a, b)));
      msg.size = file.size;
      const res = core.buildSaveParts(read, msg);
      const parts = res.parts.map(p => Array.isArray(p) ? file.slice(p[0], p[1]) : p);
      const blob = new Blob(parts, { type: 'application/dxf' });
      self.postMessage({ type: 'done', blob, allocated: res.allocated });
    } catch (err) {
      self.postMessage({ type: 'error', data: (err && err.message) || String(err) });
    }
  };
}

function spawnWorker(fn) {
  // çekirdek eklentileri (ölçü geometrisi) işçiye de gömülür
  const dim = typeof DXFDimCore === 'function' ? DXFDimCore.toString() + '\n' : '';
  const src = dim + DXFCore.toString() + '\n;(' + fn.toString() + ')();';
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return w;
}
