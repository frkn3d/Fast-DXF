/* Fast DXF — imleç ikonu: bir araç alındığında imlecin sağ üstünde o aracın ikonu görünür.
 * Yerleşim (imlece göre): ikon sağ üstte (+14, −40) · hiza etiketi ikonun sağında (+38, −34) · yakalama etiketi ve
 * uzunluk / açı alanları altta (+16, +34) · dinamik girişteki ölçü etiketi sol üstte. Böylece hiçbiri üst üste binmez. */
'use strict';

FastDXF.use({
  name: 'imlec-ikonu',
  init(app) {
    const ov = $('ov'), view = $('view'); if (!ov || !view) return;
    const NO_ICON = new Set(['select', 'pan', 'orbit', 'zoomwin', 'grip']);
    view.insertAdjacentHTML('beforeend', '<div id="curIco" aria-hidden="true"><svg class="i"><use href=""/></svg></div>');
    const box = $('curIco'), use = box.querySelector('use');
    let inside = false, sx = 0, sy = 0;
    // aracın ikonu: araç çubuğu / menüdeki düğmeden okunur (eklentilerin araçları da kendiliğinden gelir)
    const iconOf = (name) => {
      if (typeof TOOL_ICON !== 'undefined' && TOOL_ICON[name]) return '#i-' + TOOL_ICON[name];
      for (const b of document.querySelectorAll('[data-tool="' + name + '"]')) {
        if (b.id === 'drawMain') continue;
        const u = b.querySelector('use'); if (u) return u.getAttribute('href') || u.getAttribute('xlink:href');
      }
      return null;
    };
    const update = () => {
      const name = app.toolName, href = !NO_ICON.has(name) && !app.pointMode ? iconOf(name) : null;
      const show = inside && !!href && !app.panning && !app.orbiting;
      box.style.display = show ? 'block' : 'none';
      if (!show) return;
      if (use.getAttribute('href') !== href) use.setAttribute('href', href);
      box.style.transform = 'translate(' + Math.round(sx + 14) + 'px,' + Math.round(sy - 40) + 'px)';
    };
    ov.addEventListener('pointermove', (e) => { inside = true; sx = e.offsetX; sy = e.offsetY; update(); });
    ov.addEventListener('pointerenter', (e) => { inside = true; sx = e.offsetX; sy = e.offsetY; update(); });
    ov.addEventListener('pointerleave', () => { inside = false; update(); });
    app.hooks.tool.push(() => setTimeout(update, 0));
  }
});
