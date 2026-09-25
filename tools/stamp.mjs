// Verze statiky podle obsahu: `node tools/stamp.mjs` přepíše ?v= u stylů
// a skriptů v index.html na otisk souboru a v sw.js složí SHELL (co se
// ukládá při instalaci) a CACHE (mění se s každou změnou kteréhokoli souboru
// ze SHELL). Ručně se nic nezvyšuje. `node test.mjs` hlídá, že je hotovo.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const read = (p) => readFileSync(new URL(p, pub));
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

export function stamp() {
    const html = read('index.html', 'utf8').toString()
        .replace(/((?:href|src)=")([\w/.-]+\.(?:css|js))(?:\?v=[\w]+)?"/g, (m, a, file) => `${a}${file}?v=${hash(read(file))}"`);
    // Všechno místní, co index.html načítá (styly, skripty, písma, ikony, manifest)
    // a ikony z manifestu.
    const local = [...html.matchAll(/(?:href|src)="([\w/.-]+\.(?:css|js|woff2|png|svg|webmanifest)(?:\?v=\w+)?)"/g)].map(m => m[1]);
    const icons = JSON.parse(read('manifest.webmanifest')).icons.map(i => i.src);
    const shell = ['/', ...new Set([...local, ...icons].map(u => '/' + u.replace(/^\//, '')))];
    const all = createHash('sha256').update(html);
    for (const u of shell.slice(1)) all.update(read(u.slice(1).split('?')[0]));
    const sw = read('sw.js').toString()
        .replace(/const CACHE = '[^']*';/, `const CACHE = '20slov-${all.digest('hex').slice(0, 8)}';`)
        .replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = [\n${shell.map(u => `    '${u}',`).join('\n')}\n];`);
    return { html, sw };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { html, sw } = stamp();
    writeFileSync(new URL('index.html', pub), html);
    writeFileSync(new URL('sw.js', pub), sw);
    console.log('index.html a sw.js orazítkované');
}
