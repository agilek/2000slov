"""Lehčí řez Fredoka One odvozený z jediného masteru: eroze obrysu + návrat zón.

Používá ho cz_font.py (--thin D); samostatně jen pro pokusy:

    python tools/thin_font.py <vstup.otf> <výstup.ttf> <d>

Potřebuje fontTools a skia-pathops. Postup, jak ho dělá typograf, když lehčí
master neexistuje:

1. Eroze: od každé skupiny kontur (vnější + její díry) se odečte tah šířky 2d
   po jejím obrysu (skia-pathops stroke + difference). To je přesný posun obrysu
   dovnitř o d — i v křivkách, bez smyček, které dělá posouvání bodů.
   Spoje s pokosem: zářez u spoje oblouku s dříkem (a, g, n, u…) zůstane ostrý;
   s oblým spojem by z něj byl kulatý výžlabek s „oušky".
2. Elipsa místo kruhu: svisle se ubírá jen K_Y·d, takže vodorovné tahy tenčí
   méně — lehčí řezy variabilní Fredoky mají taky menší kontrast.
3. Tenké tahy (kroužek å, ©, ¸, ˛…) se ztenčí úměrně své tloušťce, ne o celé d,
   jinak by zmizely.
4. Zóny: dno na účaří, výška verzálek, horní dotahy a dolní dotahy se vrátí
   přesně na místo (po částech lineární mapa y), výška minusek jen z X_RESTORE —
   stejně jako ve variabilní Fredoce klesá x-výška s tloušťkou.
5. Šířky znaků se nemění: kostra zůstane, přibude jen světlo po stranách. Text
   v lehčím řezu tak zabere stejně místa jako v plném (žádný skok v rozvržení).

Čísla K_Y a X_RESTORE jsou změřená z variabilní Fredoky (wght 700 → 400),
tabulka ZONES z extrémů glyfů Fredoka One.
"""
import math
import statistics
import sys
import pathops
from fontTools.ttLib import TTFont
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.basePen import BasePen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.filterPen import FilterPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

K_Y = 0.8            # svislá eroze vůči vodorovné
X_RESTORE = 0.45     # kolik z posunu x-výšky se vrátí
T_FULL = 120         # tahy aspoň takhle silné se ztenčí o celé d
MITER = 10           # mez pokosu ve spojích
# zóny (od, do) v jednotkách Fredoka One a kolik posunu se v nich vrátí
ZONES = [((-240, -185), 1.0), ((-16, 6), 1.0), ((518, 550), X_RESTORE), ((728, 755), 1.0), ((765, 790), 1.0)]


class _Flat(BasePen):
    """Obrys jako úsečky — pro měření tloušťky tahů."""
    def __init__(self):
        super().__init__(None); self.segs = []
    def _moveTo(self, p): self.cur = self.start = p
    def _lineTo(self, p): self.segs.append((self.cur, p)); self.cur = p
    def _qCurveToOne(self, c, p):
        a = self.cur
        for i in range(1, 9):
            t = i / 8; u = 1 - t
            q = (u*u*a[0] + 2*u*t*c[0] + t*t*p[0], u*u*a[1] + 2*u*t*c[1] + t*t*p[1])
            self._lineTo(q)
    def _closePath(self):
        if self.cur != self.start: self.segs.append((self.cur, self.start))


class _MapY(FilterPen):
    def __init__(self, out, f):
        super().__init__(out); self.f = f
    def _p(self, p): return None if p is None else (p[0], self.f(p[1]))
    def moveTo(self, p): self._outPen.moveTo(self._p(p))
    def lineTo(self, p): self._outPen.lineTo(self._p(p))
    def qCurveTo(self, *pts): self._outPen.qCurveTo(*map(self._p, pts))
    def curveTo(self, *pts): self._outPen.curveTo(*map(self._p, pts))


def _unit(x, y):
    n = math.hypot(x, y)
    return (x / n, y / n) if n else None


def _ray(p, v, segs):
    """Vzdálenost z p ve směru v k nejbližší hraně obrysu."""
    best = math.inf
    for a, b in segs:
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = v[0] * ey - v[1] * ex
        if abs(den) < 1e-9: continue
        wx, wy = a[0] - p[0], a[1] - p[1]
        t, u = (wx * ey - wy * ex) / den, (wx * v[1] - wy * v[0]) / den
        if 3 < t < best and 0 <= u <= 1: best = t
    return best


def _contours(glyf, g):
    """[(body [(x, y, on)], RecordingPen)] pro každou konturu."""
    coords, ends, flags = g.getCoordinates(glyf)
    out, st = [], 0
    for e in ends:
        pts = [(coords[i][0], coords[i][1], bool(flags[i] & 1)) for i in range(st, e + 1)]
        rp = RecordingPen()
        k = next((i for i, p in enumerate(pts) if p[2]), None)
        if k is None:
            rp.qCurveTo(*[p[:2] for p in pts], None)
        else:
            seq = pts[k:] + pts[:k]
            rp.moveTo(seq[0][:2]); buf = []
            for x, y, on in seq[1:] + seq[:1]:
                if on:
                    (rp.qCurveTo(*buf, (x, y)) if buf else rp.lineTo((x, y))); buf = []
                else:
                    buf.append((x, y))
            rp.closePath()
        out.append((pts, rp))
        st = e + 1
    return out


def _area(rec):
    ap = AreaPen(); rec.replay(ap); return ap.value       # TrueType: vnější kontura < 0


def _thickness(pts, segs):
    """Medián tloušťky tahu kontury (paprsky dovnitř z on-curve bodů)."""
    ts, n = [], len(pts)
    for i, (x, y, on) in enumerate(pts):
        if not on: continue
        a = _unit(x - pts[i - 1][0], y - pts[i - 1][1])
        b = _unit(pts[(i + 1) % n][0] - x, pts[(i + 1) % n][1] - y)
        if not a or not b: continue
        na, nb = (a[1], -a[0]), (b[1], -b[0])           # vpravo od směru = do tahu
        rays = [r for r in (_unit(na[0] + nb[0], na[1] + nb[1]), na, nb) if r]
        ts.append(min(_ray((x, y), r, segs) for r in rays))
    return statistics.median(ts) if ts else T_FULL


def _erode(members, r):
    shape = pathops.Path()
    pen = TransformPen(shape.getPen(), (1, 0, 0, 1 / K_Y, 0, 0))   # elipsa -> kruh
    for rec in members: rec.replay(pen)
    ring = pathops.Path(); shape.draw(ring.getPen())
    ring.stroke(2 * r, pathops.LineCap.BUTT_CAP, pathops.LineJoin.MITER_JOIN, MITER)
    ring.convertConicsToQuads()
    return pathops.op(shape, ring, pathops.PathOp.DIFFERENCE)


def _ymap(anchors):
    """Po částech lineární mapa y po erozi -> cílové y; mimo kotvy jen posun."""
    pts = []
    for a in sorted(set(anchors)):
        if not pts or (a[0] > pts[-1][0] and a[1] > pts[-1][1]): pts.append(a)
    def f(y):
        if not pts: return y
        if y <= pts[0][0]: return y + pts[0][1] - pts[0][0]
        if y >= pts[-1][0]: return y + pts[-1][1] - pts[-1][0]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if y <= x1: return y0 + (y - x0) * (y1 - y0) / (x1 - x0)
    return f


def thin_glyph(font, name, d):
    glyf = font['glyf']
    cs = _contours(glyf, glyf[name])
    flat = _Flat()
    for _, rec in cs: rec.replay(flat)
    dc = [d * min(1.0, _thickness(pts, flat.segs) / T_FULL) for pts, _ in cs]
    # skupiny: vnější kontura + díry uvnitř ní; každá se erozí zvlášť svým d
    outers = [i for i, (_, rec) in enumerate(cs) if _area(rec) < 0]
    paths = {i: pathops.Path() for i in outers}
    for i in outers: cs[i][1].replay(paths[i].getPen())
    groups = {i: [i] for i in outers}
    for i, (pts, _) in enumerate(cs):
        if i in groups: continue
        hosts = [o for o in outers if paths[o].contains(pts[0][:2])]
        if hosts:
            groups[min(hosts, key=lambda o: -_area(cs[o][1]))].append(i)    # nejmenší obklopující
        else:
            groups[i] = [i]
    result = pathops.Path()
    for members in groups.values():
        r = min(dc[m] for m in members)
        for m in members: dc[m] = r
        _erode([cs[m][1] for m in members], r).draw(TransformPen(result.getPen(), (1, 0, 0, K_Y, 0, 0)))
    result.convertConicsToQuads()
    # kotvy zón: vodorovné extrémy původních kontur; spodní hrana tahu šla nahoru, horní dolů
    anchors = []
    for (pts, _), r in zip(cs, dc):
        n = len(pts)
        for i, (x, y, on) in enumerate(pts):
            prev, nxt = pts[i - 1], pts[(i + 1) % n]
            if not on or not ((prev[1] >= y <= nxt[1]) or (prev[1] <= y >= nxt[1])): continue
            if nxt[0] == prev[0]: continue
            up = 1 if nxt[0] < prev[0] else -1          # jde doleva = tah je nad hranou
            for (lo, hi), keep in ZONES:
                if lo <= y <= hi:
                    moved = y + up * r * K_Y
                    anchors.append((round(moved, 3), round(moved - up * r * K_Y * keep, 3)))
    rec = RecordingPen()
    result.draw(Cu2QuPen(_MapY(rec, _ymap(anchors)), 1.0))
    if _area(rec) > 0:                                   # pathops kreslí opačným směrem
        rev = RecordingPen(); rec.replay(ReverseContourPen(rev)); rec = rev
    tt = TTGlyphPen(None); rec.replay(tt)
    g = tt.glyph()
    g.coordinates.toInt()
    glyf[name] = g


def thin(font, d):
    """Zeslabí všechny jednoduché glyfy o d (na stranu); složeniny je převezmou."""
    glyf = font['glyf']
    for name in font.getGlyphOrder():
        g = glyf[name]
        if not g.isComposite() and g.numberOfContours > 0:
            thin_glyph(font, name, d)
    for name in font.getGlyphOrder():                   # levý okraj podle nového obrysu
        g = glyf[name]; g.recalcBounds(glyf)
        if g.numberOfContours:
            font['hmtx'][name] = (font['hmtx'][name][0], g.xMin)


if __name__ == '__main__':
    f = TTFont(sys.argv[1])
    thin(f, float(sys.argv[3]))
    f.save(sys.argv[2])
