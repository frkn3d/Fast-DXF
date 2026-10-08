# Tüm desteklenen nesne tiplerini içeren küçük test çizimi üretir (ezdxf gerekir: pip install ezdxf)
# Kullanım: python tests/gen_coverage.py cikti.dxf
import sys, math
import ezdxf
from ezdxf.enums import TextEntityAlignment

doc = ezdxf.new('R2018', setup=True)
msp = doc.modelspace()
for name, col in [('KIRMIZI', 1), ('SARI', 2), ('YESIL', 3), ('MAVI', 5), ('ŞĞÜ_Türkçe', 6), ('KAPALI', 4)]:
    doc.layers.add(name, color=col)
doc.layers.get('KAPALI').off()

# 1. satır: temel geometri
msp.add_line((0, 0), (10, 10), dxfattribs={'layer': 'KIRMIZI'})
msp.add_circle((20, 5), 5, dxfattribs={'layer': 'SARI'})
msp.add_arc((35, 5), 5, 30, 240, dxfattribs={'layer': 'YESIL'})
msp.add_ellipse((50, 5), major_axis=(6, 2), ratio=0.4, dxfattribs={'layer': 'MAVI'})
msp.add_ellipse((65, 5), major_axis=(0, 5), ratio=0.5, start_param=0, end_param=math.pi, dxfattribs={'color': 1})
msp.add_point((75, 5)); msp.add_point((77, 5)); msp.add_point((79, 5))
# 2. satır: polyline'lar
msp.add_lwpolyline([(0, 20, 0, 0, 0.5), (10, 20, 0, 0, 0), (10, 30, 0, 0, -1), (0, 30)], format='xyseb', close=True, dxfattribs={'layer': 'SARI'})
msp.add_polyline2d([(15, 20), (25, 25), (20, 30)], close=True, dxfattribs={'color': 3})
msp.add_polyline3d([(30, 20, 0), (40, 30, 5), (35, 20, 10)], dxfattribs={'color': 4})
msp.add_spline([(45, 20), (50, 30), (55, 20), (60, 30)], dxfattribs={'color': 6})
msp.add_spline(fit_points=[(65, 20), (70, 28), (75, 22), (80, 30)], dxfattribs={'color': 2})
# 3. satır: yazılar
msp.add_text('Sol alt TEXT', height=1.5, dxfattribs={'layer': 'ŞĞÜ_Türkçe'}).set_placement((0, 40))
msp.add_text('Orta', height=1.5, rotation=30, dxfattribs={'color': 1}).set_placement((25, 40), align=TextEntityAlignment.MIDDLE_CENTER)
msp.add_text('Sağ üst %%c50 %%d', height=1.5, dxfattribs={'color': 3}).set_placement((50, 40), align=TextEntityAlignment.TOP_RIGHT)
msp.add_mtext('MTEXT {\\fArial|b1;kalın} satır 1\\Pikinci satır \\S1/2; ŞĞİÜÖÇ', dxfattribs={'char_height': 1.2, 'insert': (55, 45), 'color': 5}).set_location((55, 45), attachment_point=1)
# 4. satır: bloklar
b = doc.blocks.new('KAPI')
b.add_line((0, 0), (4, 0)); b.add_arc((0, 0), 4, 0, 90, dxfattribs={'color': 0})  # BYBLOCK yay
b.add_circle((2, 2), 0.5, dxfattribs={'layer': 'MAVI'})
b.add_attdef('NO', (0, -1.5), dxfattribs={'height': 0.8})
n = doc.blocks.new('ICICE')
n.add_blockref('KAPI', (0, 0)); n.add_blockref('KAPI', (6, 0), dxfattribs={'rotation': 90, 'color': 1})
n.add_lwpolyline([(-1, -1), (11, -1), (11, 6), (-1, 6)], close=True)
r = msp.add_blockref('KAPI', (0, 55), dxfattribs={'color': 2, 'layer': 'YESIL'})
r.add_auto_attribs({'NO': 'K-01'})
msp.add_blockref('KAPI', (12, 55), dxfattribs={'xscale': -1})            # aynalı
msp.add_blockref('ICICE', (20, 55), dxfattribs={'layer': 'KIRMIZI'})
ins = msp.add_blockref('KAPI', (40, 55), dxfattribs={'color': 6})
ins.dxf.column_count = 3; ins.dxf.row_count = 2; ins.dxf.column_spacing = 6; ins.dxf.row_spacing = 6  # MINSERT
# 5. satır: tarama, ölçü, katı, 3dface, leader, OCS
h = msp.add_hatch(color=3)
h.paths.add_polyline_path([(0, 70), (10, 70), (10, 80), (0, 80)], is_closed=True)
ep = h.paths.add_edge_path()
ep.add_line((2, 72), (8, 72)); ep.add_arc((5, 72), 3, 0, 180, ccw=True)
h2 = msp.add_hatch(color=5)
ep2 = h2.paths.add_edge_path(); ep2.add_ellipse((18, 75), (4, 0), 0.5, 0, 360)
d = msp.add_linear_dim(base=(25, 80), p1=(25, 70), p2=(40, 70), dimstyle='EZDXF'); d.render()
msp.add_solid([(45, 70), (50, 70), (45, 75), (50, 75)], dxfattribs={'color': 1})
msp.add_3dface([(55, 70, 0), (60, 70, 0), (60, 75, 0), (55, 76, 0)], dxfattribs={'color': 2})
msp.add_leader([(65, 80), (70, 75), (75, 75)], dxfattribs={'color': 3})
c = msp.add_circle((85, 75), 3, dxfattribs={'extrusion': (0, 0, -1), 'color': 1})   # OCS ters: merkez x=-85 → dünya x=85? (merkez OCS'de 85 → dünya -85)
a = msp.add_arc((85, 75), 3, 0, 90, dxfattribs={'extrusion': (0, 0, -1), 'color': 4})
msp.add_line((-90, 72), (-80, 78), dxfattribs={'true_color': ezdxf.colors.rgb2int((255, 128, 0))})
msp.add_line((90, 0), (100, 10), dxfattribs={'layer': 'KAPALI'})
doc.saveas(sys.argv[1])
print('yazıldı', sys.argv[1])
