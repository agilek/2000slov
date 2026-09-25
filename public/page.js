// Samostatné stránky mimo hru (404, zásady soukromí, veřejný profil /u/).
// Mají styly hry, ale ne game.js. iOS Safari ukáže :active (zamáčknutí
// tlačítka o ret, .btn:active ve style.css) jen na stránce, která poslouchá
// dotyk. Hra má posluchače v game.js, tady stačí prázdný. Rohy a ret
// dorovná v Safari squircle.js, načtený vedle stejně jako ve hře.
document.addEventListener('touchstart', () => {}, { passive: true });
