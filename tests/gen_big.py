# Büyük (≈ hedef boyutta) sentetik DXF üretir: eş yükselti eğrileri, çizgiler, noktalar, yazılar, bloklar.
# Kullanım: python tests/gen_big.py cikti.dxf [MB]
import sys, math, random
out, target_mb = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1100
random.seed(1)
OX, OY = 430000.0, 4400000.0
W = 20000.0
layers = [('EGRI_1M', 5), ('EGRI_5M', 1), ('YOL', 2), ('BINA', 3), ('NOKTA', 7), ('YAZI', 6), ('AGAC', 3)]
f = open(out, 'w', newline='\r\n', encoding='cp1254')
w = f.write
w('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$DWGCODEPAGE\n  3\nANSI_1254\n  9\n$HANDSEED\n  5\nFFFFFFF\n  9\n$INSUNITS\n 70\n     6\n  0\nENDSEC\n')
w('  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n%d\n' % len(layers))
for n, c in layers:
    w('  0\nLAYER\n  2\n%s\n 70\n     0\n 62\n%6d\n  6\nCONTINUOUS\n' % (n, c))
w('  0\nENDTAB\n  0\nENDSEC\n')
w('  0\nSECTION\n  2\nBLOCKS\n  0\nBLOCK\n  8\n0\n  2\nAGAC\n 70\n     0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n')
w('  0\nCIRCLE\n  8\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n 40\n2.0\n  0\nLINE\n  8\n0\n 10\n-2.0\n 20\n0.0\n 30\n0.0\n 11\n2.0\n 21\n0.0\n 31\n0.0\n')
w('  0\nENDBLK\n  8\n0\n  0\nENDSEC\n')
w('  0\nSECTION\n  2\nENTITIES\n')
target = target_mb * 1048576
k = 0
while f.tell() < target:
    # bir "pafta": 500 eş yükselti eğrisi + 300 çizgi + 300 nokta + 60 yazı + 40 ağaç
    px, py = OX + random.random() * W, OY + random.random() * W
    for i in range(500):
        n = 60
        z = 2000 + i
        lay = 'EGRI_5M' if i % 5 == 0 else 'EGRI_1M'
        w('  0\nLWPOLYLINE\n  8\n%s\n 90\n%d\n 70\n0\n 38\n%.1f\n' % (lay, n, z))
        y0 = py + i * 2.0
        for j in range(n):
            x = px + j * 8.0
            y = y0 + 3.0 * math.sin(j * 0.3 + i * 0.05)
            w(' 10\n%.3f\n 20\n%.3f\n' % (x, y))
    for i in range(300):
        x, y = px + random.random() * 480, py + random.random() * 1000
        w('  0\nLINE\n  8\nYOL\n 10\n%.3f\n 20\n%.3f\n 30\n0.0\n 11\n%.3f\n 21\n%.3f\n 31\n0.0\n' % (x, y, x + 20, y + 5))
    for i in range(300):
        w('  0\nPOINT\n  8\nNOKTA\n 10\n%.3f\n 20\n%.3f\n 30\n%.3f\n' % (px + random.random() * 480, py + random.random() * 1000, 2000 + random.random() * 500))
    for i in range(60):
        w('  0\nTEXT\n  8\nYAZI\n 10\n%.3f\n 20\n%.3f\n 30\n0.0\n 40\n2.0\n  1\nKot %d ŞĞİ\n' % (px + random.random() * 480, py + random.random() * 1000, 2000 + i))
    for i in range(40):
        w('  0\nINSERT\n  8\nAGAC\n  2\nAGAC\n 10\n%.3f\n 20\n%.3f\n 30\n0.0\n' % (px + random.random() * 480, py + random.random() * 1000))
    k += 1
w('  0\nENDSEC\n  0\nEOF\n')
print('pafta', k, 'boyut MB', round(f.tell() / 1048576))
f.close()
