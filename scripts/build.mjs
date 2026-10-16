// 生成可安装的插件目录 dist/desktop-home/（main.js、manifest.json、styles.css）。
// 内置壁纸以 WebP 内嵌进 main.js，所以从社区插件市场安装（只下载这三个文件）也能显示。
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const output = 'dist/desktop-home';
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({ entryPoints: ['src/main.ts'], outfile: `${output}/main.js`, bundle: true, external: ['obsidian', 'electron'], format: 'cjs', target: 'es2021', minify: true, loader: { '.webp': 'dataurl' }, logLevel: 'info' });
for (const [from, to] of [['manifest.json', 'manifest.json'], ['src/home.css', 'styles.css']]) await copyFile(from, `${output}/${to}`);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
// 可选：系统有 zip 时顺便打包；没有时只生成目录（发布用的 ZIP 可另行打包）。
if (existsSync('/usr/bin/zip')) {
  execFileSync('/usr/bin/zip', ['-qr', `desktop-home-${manifest.version}.zip`, 'desktop-home'], { cwd: 'dist' });
  console.log(`Local package: dist/desktop-home-${manifest.version}.zip`);
} else console.log(`Plugin folder: ${output}`);
