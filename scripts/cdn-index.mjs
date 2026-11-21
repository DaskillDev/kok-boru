// Переписывает собранный index.html так, чтобы код игры и тяжёлые файлы (модели, небо, звуки)
// скачивались через быструю сеть доставки (jsDelivr), а не с GitHub Pages.
// Если сеть доставки недоступна, игра сама берёт те же файлы с GitHub Pages.
//
// node scripts/cdn-index.mjs dist/index.html https://cdn.jsdelivr.net/gh/<owner>/<repo>@<sha>/
import fs from 'node:fs';

const [, , file, cdn] = process.argv;
if (!file || !cdn) throw new Error('usage: cdn-index.mjs <index.html> <cdn base url>');
let html = fs.readFileSync(file, 'utf8');

const m = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/.exec(html);
if (!m) throw new Error('module script tag not found in ' + file);
const js = m[1];

const loader = `<link rel="preconnect" href="${new URL(cdn).origin}" crossorigin />
    <script>
      (function () {
        var cdn = ${JSON.stringify(cdn)};
        var js = ${JSON.stringify(js)};
        var local = /[?&]nocdn\\b/.test(location.search);
        function load(base, onerror) {
          var s = document.createElement('script');
          s.type = 'module';
          s.crossOrigin = 'anonymous';
          s.src = base + js;
          s.onerror = onerror;
          document.head.appendChild(s);
        }
        if (local) {
          window.__ASSET_BASE__ = './';
          load('./');
        } else {
          window.__ASSET_BASE__ = cdn;
          load(cdn, function () {
            window.__ASSET_BASE__ = './';
            load('./');
          });
        }
      })();
    </script>`;

html = html.replace(m[0], loader);
fs.writeFileSync(file, html);
console.log('index.html now loads', js, 'from', cdn);
