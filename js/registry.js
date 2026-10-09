/* Fast DXF — eklenti kaydı.
 * Proje derleyici olmadan file:// üzerinden çalıştığı için ES modülleri (import) kullanılamaz; her özellik kendi
 * dosyasında FastDXF.use({ name, init(app) { … } }) ile kayıt olur. App kurulurken eklentiler sırayla başlatılır.
 * Eklentinin kullanabileceği bağlantı noktaları (App): addCommand(…), addTool(name, tool, opts), tools, editor, store, R. */
'use strict';
const FastDXF = {
  plugins: [],
  use(p) { this.plugins.push(p); }
};
