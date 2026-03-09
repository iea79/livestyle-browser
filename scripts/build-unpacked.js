const fs = require("fs");
const path = require("path");

const OUT = "dist-unpacked";
const FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "popup.html",
  "options.js",
  "options.html",
  "offscreen.html",
  "offscreen.js",
];

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

FILES.forEach((f) => {
  fs.copyFileSync(f, path.join(OUT, f));
});

console.log(`Готово: ${OUT}/ — загрузите в Chrome: Расширения → «Загрузить распакованное» → выберите папку ${OUT}`);
