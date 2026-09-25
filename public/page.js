// Samostatné stránky mimo hru (404, zásady soukromí, veřejný profil /u/).
// Mají styly hry, ale ne game.js. iOS Safari ukáže :active (zamáčknutí
// tlačítka o ret, .btn:active ve style.css) jen na stránce, která poslouchá
// dotyk — proto touchstart posluchač níž. Rohy a ret dorovná v Safari
// squircle.js, načtený vedle stejně jako ve hře.
//
// Tah prstem není klepnutí. Kdo začne stránku scrollovat na odkazu nebo
// tlačítku, nesmí ho spustit — stejná obrana jako touchFrom v game.js
// (tam navíc kvůli přepínači s nativní haptikou, tady jen proti
// falešnému kliknutí při odtažení prstu ze scrollu).
let touchFrom = null;
document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    touchFrom = { x: t.clientX, y: t.clientY, sy: scrollY, moved: false };
}, { capture: true, passive: true });
document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (touchFrom && Math.hypot(t.clientX - touchFrom.x, t.clientY - touchFrom.y) > 10) touchFrom.moved = true;
}, { capture: true, passive: true });
document.addEventListener('touchend', () => {
    const t = touchFrom;
    setTimeout(() => { if (touchFrom === t) touchFrom = null; }, 500);
}, { capture: true, passive: true });
document.addEventListener('click', e => {
    if (!touchFrom || !(touchFrom.moved || Math.abs(scrollY - touchFrom.sy) > 2)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
}, true);
