"""Doplní do Fredoka One (2011) chybějící české znaky a uloží kopii pod jiným jménem.

    python tools/cz_font.py <FredokaOne-Regular.otf> <výstup.otf> [<výstup.woff2>]
    python tools/cz_font.py <FredokaOne-Regular.otf> <výstup.otf> <výstup.woff2> --thin 24 --style Light --weight 300

S --thin se písmo nejdřív zeslabí (thin_font.py, eroze obrysu o d jednotek na
stranu) a teprve pak se doplní čeština — polohy znamének se tak měří z už
zeslabených glyfů dané váhy. Řezy hry: Regular (bez --thin), Light (--thin 24,
300), ExtraLight (--thin 40, 200).

Potřebuje fontTools (a brotli pro .woff2, skia-pathops pro --thin). Fredoka One má Š/Ž, čárky i háček,
ale chybí ů č ď ě ň ř ť a Ů Č Ď Ě Ň Ř Ť. Nové znaky jsou TrueType složeniny
písmeno + znaménko, polohy znamének jsou změřené z hotových Š/š a å:

- háček: stejný tvar všude, u malých ve výšce samostatného háčku, u velkých
  o +200 výš (jako v Š), vystředěný nad písmenem (Š/Ž mají posun ~+5),
- kroužek: z å (menší než samostatný kroužek), u Ů ve výšce velkých znamének,
- ď, ť: v češtině apostrof vpravo od dříku, ne háček — zmenšený apostrof
  fontu, u ť nad příčkou.

Kerning (GPOS) se převezme z původního písmene (Č jako C…), u ď/ť jen zprava
— vpravo mají apostrof, takže kerning d/t jako prvního znaku by nesedl.

Licence: OFL 1.1 s vyhrazeným jménem „Fredoka" — upravená verze ho nesmí nést,
proto „Slovka One". Copyright autorky zůstává, doplní se licence do metadat.
"""
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.ttLib.tables import otTables

FAMILY = 'Slovka One'
PS_NAME = 'SlovkaOne-Regular'
CAP_LIFT = 200                     # o kolik výš je háček u velkých (Š vs š)
CARON_NUDGE = 5                    # háček je v Š/Ž o pár jednotek vpravo od středu
APOS_SCALE = 0.55                  # apostrof u ď/ť vůči běžnému apostrofu
APOS_GAP = 25                      # mezera mezi dříkem a apostrofem

# nový znak: (kód, základ, znaménko, poloha)
CARON = [
    (0x010C, 'Ccaron', 'C', 'uc'), (0x010D, 'ccaron', 'c', 'lc'),
    (0x011A, 'Ecaron', 'E', 'uc'), (0x011B, 'ecaron', 'e', 'lc'),
    (0x0147, 'Ncaron', 'N', 'uc'), (0x0148, 'ncaron', 'n', 'lc'),
    (0x0158, 'Rcaron', 'R', 'uc'), (0x0159, 'rcaron', 'r', 'lc'),
    (0x0164, 'Tcaron', 'T', 'uc'), (0x010E, 'Dcaron', 'D', 'uc'),
]
RING = [(0x016E, 'Uring', 'U', 'uc'), (0x016F, 'uring', 'u', 'lc')]
APOS = [(0x010F, 'dcaron', 'd'), (0x0165, 'tcaron', 't')]


def bounds(font, name):
    g = font['glyf'][name]
    g.recalcBounds(font['glyf'])
    return g.xMin, g.yMin, g.xMax, g.yMax


def component(name, dx, dy, scale=None, metrics=False):
    c = GlyphComponent()
    c.glyphName, c.x, c.y = name, round(dx), round(dy)
    c.flags = 0x0200 if metrics else 0          # USE_MY_METRICS: šířka z písmene
    if scale:
        c.transform = [[scale, 0], [0, scale]]
    return c


def composite(font, name, comps, advance):
    g = Glyph()
    g.numberOfContours = -1
    g.components = comps
    font['glyf'][name] = g          # glyf přidá jméno do sdíleného pořadí glyfů sám
    g.recalcBounds(font['glyf'])
    font['hmtx'][name] = (advance, g.xMin)


def ring_glyph(font):
    """Kroužek z å jako samostatný (nezakódovaný) glyf ring.lc."""
    glyf = font['glyf']
    base_y = bounds(font, 'a')[3]
    coords, ends, flags = glyf['aring'].getCoordinates(glyf)
    g = Glyph()
    g.numberOfContours, g.program = 0, None
    from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
    pts, fl, new_ends, start = [], [], [], 0
    for end in ends:
        contour = list(range(start, end + 1))
        if min(coords[i][1] for i in contour) > base_y:          # jen kontury nad a
            pts += [coords[i] for i in contour]
            fl += [flags[i] for i in contour]
            new_ends.append(len(pts) - 1)
        start = end + 1
    g.coordinates = GlyphCoordinates(pts)
    g.flags = bytearray(fl)
    g.endPtsOfContours = new_ends
    g.numberOfContours = len(new_ends)
    from fontTools.ttLib.tables import ttProgram
    g.program = ttProgram.Program()
    g.program.fromBytecode(b'')
    glyf['ring.lc'] = g
    g.recalcBounds(glyf)
    font['hmtx']['ring.lc'] = (0, g.xMin)


def build(font):
    glyf, hmtx = font['glyf'], font['hmtx']
    cx0, _, cx1, _ = bounds(font, 'caron')
    caron_mid = (cx0 + cx1) / 2
    for code, name, base, pos in CARON:
        b0, _, b1, _ = bounds(font, base)
        dx = (b0 + b1) / 2 + CARON_NUDGE - caron_mid
        dy = CAP_LIFT if pos == 'uc' else 0
        composite(font, name, [component(base, 0, 0, metrics=True), component('caron', dx, dy)], hmtx[base][0])

    ring_glyph(font)
    r0, r1, r2, r3 = bounds(font, 'ring.lc')
    cap_top = bounds(font, 'Scaron')[3]                          # výška velkých znamének
    for code, name, base, pos in RING:
        b0, _, b1, _ = bounds(font, base)
        dx = (b0 + b1) / 2 - (r0 + r2) / 2
        dy = (cap_top - r3) if pos == 'uc' else 0
        composite(font, name, [component(base, 0, 0, metrics=True), component('ring.lc', dx, dy)], hmtx[base][0])

    a0, a1, a2, a3 = bounds(font, 'quoteright')
    for code, name, base in APOS:
        pts = glyf[base].getCoordinates(glyf)[0]
        top = max(p[1] for p in pts)
        stem_right = max(p[0] for p in pts if p[1] >= top - 90)  # pravý okraj dříku nahoře
        x = stem_right + APOS_GAP
        # ď: apostrof zarovnaný s horním okrajem dříku; ť: kousek nad dřík, ať mine příčku
        y_top = top if base == 'd' else top + 38
        dx, dy = x - a0 * APOS_SCALE, y_top - a3 * APOS_SCALE
        adv = max(hmtx[base][0], round(x + (a2 - a0) * APOS_SCALE + 15))
        composite(font, name, [component(base, 0, 0), component('quoteright', dx, dy, APOS_SCALE)], adv)

    new = {name: base for _, name, base, _ in CARON + RING} | {name: base for _, name, base in APOS}
    for code, name, *_ in CARON + RING + APOS:
        for t in font['cmap'].tables:
            if t.format == 4:
                t.cmap[code] = name
    gdef = font['GDEF'].table.GlyphClassDef
    for name, base in new.items():
        if base in gdef.classDefs:
            gdef.classDefs[name] = gdef.classDefs[base]
    copy_kerning(font, new, right_only={'dcaron', 'tcaron'})


def copy_kerning(font, new, right_only):
    """Nový znak dostane kerning svého písmene (jako první i druhý znak páru)."""
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if st.Format == 1:
                sets = dict(zip(st.Coverage.glyphs, st.PairSet))
                for ps in sets.values():                          # jako druhý znak
                    extra = [r for r in ps.PairValueRecord if r.SecondGlyph in new.values()]
                    for name, base in new.items():
                        for r in extra:
                            if r.SecondGlyph == base:
                                c = otTables.PairValueRecord()
                                c.SecondGlyph, c.Value1 = name, r.Value1
                                if hasattr(r, 'Value2'): c.Value2 = r.Value2
                                ps.PairValueRecord.append(c)
                    ps.PairValueRecord.sort(key=lambda r: font.getGlyphID(r.SecondGlyph))
                    ps.PairValueCount = len(ps.PairValueRecord)
                for name, base in new.items():                    # jako první znak
                    if base in sets and name not in right_only:
                        clone = otTables.PairSet()
                        clone.PairValueRecord = list(sets[base].PairValueRecord)
                        clone.PairValueCount = len(clone.PairValueRecord)
                        sets[name] = clone
                order = sorted(sets, key=font.getGlyphID)
                st.Coverage.glyphs, st.PairSet = order, [sets[g] for g in order]
                st.PairSetCount = len(order)
            elif st.Format == 2:
                cov = set(st.Coverage.glyphs)
                for name, base in new.items():
                    if base in st.ClassDef2.classDefs:
                        st.ClassDef2.classDefs[name] = st.ClassDef2.classDefs[base]
                    if name in right_only:
                        continue
                    if base in cov:
                        cov.add(name)
                        if base in st.ClassDef1.classDefs:
                            st.ClassDef1.classDefs[name] = st.ClassDef1.classDefs[base]
                st.Coverage.glyphs = sorted(cov, key=font.getGlyphID)


def rename(font, style='Regular', weight=None):
    name = font['name']
    copyright = name.getDebugName(0) + ' Czech glyphs (ČĎĚŇŘŤŮ čďěňřťů) added 2026 for the game 20 slov.'
    values = {
        0: copyright,
        1: FAMILY, 2: 'Regular', 3: f'{FAMILY} Regular; 1.001-cz', 4: f'{FAMILY} Regular',
        5: 'Version 1.001; Czech glyphs added', 6: PS_NAME,
        13: 'This Font Software is licensed under the SIL Open Font License, Version 1.1. '
            'Modified version of Fredoka One by Milena Brandão; the Reserved Font Name "Fredoka" is not used.',
        14: 'https://openfontlicense.org',
    }
    if style != 'Regular':
        # lehčí řez mimo RIBBI: rodina pro staré aplikace „Slovka One Light", typografická rodina
        # (16/17) „Slovka One" + styl
        values |= {
            0: copyright[:-1] + f', {style} weight derived by outline erosion.',
            1: f'{FAMILY} {style}', 3: f'{FAMILY} {style}; 1.001-cz', 4: f'{FAMILY} {style}',
            5: 'Version 1.001; Czech glyphs added; lighter weight derived from Fredoka One',
            6: f'SlovkaOne-{style}', 16: FAMILY, 17: style,
        }
    for rec in list(name.names):
        if rec.nameID in values:
            name.removeNames(nameID=rec.nameID)
    for nid, text in values.items():
        name.setName(text, nid, 3, 1, 0x409)
        if nid in (1, 2, 4, 6):
            name.setName(text, nid, 1, 0, 0)
    os2 = font['OS/2']
    if weight:
        os2.usWeightClass = weight
        os2.fsSelection &= ~(1 << 6)          # bit REGULAR jen u Regular
    os2.ulCodePageRange1 |= 1 << 1            # Latin 2 (střední Evropa)
    os2.ulUnicodeRange1 |= 1 << 2             # Latin Extended-A
    if 'DSIG' in font:
        del font['DSIG']                      # po úpravě by podpis stejně neplatil


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('woff2', nargs='?')
    ap.add_argument('--thin', type=float, help='zeslabit o d jednotek na stranu (thin_font.py)')
    ap.add_argument('--style', default='Regular'); ap.add_argument('--weight', type=int)
    args = ap.parse_args()
    font = TTFont(args.src)
    if args.thin:
        from thin_font import thin
        thin(font, args.thin)
    build(font)
    rename(font, args.style, args.weight)
    font.save(args.out)
    if args.woff2:
        font.flavor = 'woff2'
        font.save(args.woff2)
    out = args.out
    cz = 'áéíóúůýčďěňřšťžÁÉÍÓÚŮÝČĎĚŇŘŠŤŽ'
    check = TTFont(out).getBestCmap()
    missing = [c for c in cz if ord(c) not in check]
    print('chybí:', ''.join(missing) or 'nic — všechny české znaky jsou v písmu')
