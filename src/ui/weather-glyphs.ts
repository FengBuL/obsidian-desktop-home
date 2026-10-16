/**
 * 彩色天气图标：用 DOM 逐个创建 SVG 元素（不使用 innerHTML），
 * 渐变 id 按实例递增，多个图标同时出现也不会互相串色。
 */
export type GlyphKind = 'sun' | 'moon' | 'partly-day' | 'partly-night' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';
const NS = 'http://www.w3.org/2000/svg';
let counter = 0;

/** WMO 天气代码 + 白天/夜晚 → 图标种类。与 weatherDescription 的分档一致。 */
export function glyphKind(code: number, isDay = true): GlyphKind {
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code < 3) return isDay ? 'partly-day' : 'partly-night';
  if (code === 3) return 'cloud';
  if (code < 50) return 'fog';
  if (code < 60) return 'drizzle';
  if (code < 70) return 'rain';
  if (code < 80) return 'snow';
  if (code < 85) return 'rain';
  if (code < 90) return 'snow';
  return 'thunder';
}
/** 天空背景分组，用于天气组件的渐变底色。 */
export function skyTone(code: number, isDay = true): string {
  if (!isDay && code < 3) return 'night';
  if (code < 3) return 'clear';
  if (code === 3 || (code >= 45 && code < 50)) return isDay ? 'cloudy' : 'night-cloudy';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code < 80) || code === 85 || code === 86) return 'snow';
  return isDay ? 'rain' : 'night-cloudy';
}

function node<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string | number>, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.append(...children); return el;
}
function gradient(doc: Document, id: string, stops: [string, string], from: [number, number], to: [number, number]) {
  return node(doc, 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: from[0], y1: from[1], x2: to[0], y2: to[1] },
    node(doc, 'stop', { offset: 0, 'stop-color': stops[0] }), node(doc, 'stop', { offset: 1, 'stop-color': stops[1] }));
}
/** 由几个圆和圆角矩形拼成的云，统一用 userSpace 渐变，看起来是一整朵。 */
function cloud(doc: Document, fill: string, dx = 0, dy = 0, scale = 1) {
  const t = (x: number, y: number) => [dx + x * scale, dy + y * scale];
  const [ax, ay] = t(25, 37); const [bx, by] = t(35.5, 31); const [cx, cy] = t(45, 38.5); const [rx, ry] = t(15, 37);
  return node(doc, 'g', { fill, stroke: 'rgba(255,255,255,.55)', 'stroke-width': 0.6 },
    node(doc, 'circle', { cx: ax, cy: ay, r: 9.5 * scale }), node(doc, 'circle', { cx: bx, cy: by, r: 12.5 * scale }),
    node(doc, 'circle', { cx: cx, cy: cy, r: 9 * scale }), node(doc, 'rect', { x: rx, y: ry, width: 39.5 * scale, height: 10.5 * scale, rx: 5.25 * scale }));
}
function radial(doc: Document, id: string, stops: [number, string, number][], cx: number, cy: number, r: number) {
  // 以图形自身的包围盒为坐标，太阳无论画在哪里都对得上。
  return node(doc, 'radialGradient', { id, cx, cy, r },
    ...stops.map(([offset, color, opacity]) => node(doc, 'stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
}
function sun(doc: Document, id: string, cx: number, cy: number, r: number, rays: boolean) {
  const g = node(doc, 'g', {});
  // 柔和光晕 + 径向高光的球体，比纯色圆更有体积感。
  g.append(node(doc, 'circle', { cx, cy, r: r + 11, fill: `url(#${id}-halo)`, }));
  if (rays) for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4; const r1 = r + 4.5; const r2 = r + 9;
    g.append(node(doc, 'line', { x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1, x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2, stroke: `url(#${id}-ray)`, 'stroke-width': 3.2, 'stroke-linecap': 'round' }));
  }
  g.append(node(doc, 'circle', { cx, cy, r, fill: `url(#${id}-sun)` }), node(doc, 'ellipse', { cx: cx - r * 0.28, cy: cy - r * 0.38, rx: r * 0.5, ry: r * 0.3, fill: '#FFFFFF', opacity: 0.35 }));
  return g;
}
function moon(doc: Document, id: string, x: number, y: number, s: number) {
  // 月牙：大圆减去偏移的小圆（用路径的两段圆弧）。
  return node(doc, 'path', { fill: `url(#${id}-moon)`, transform: `translate(${x} ${y}) scale(${s})`, d: 'M15.5 0A16 16 0 1 0 31 20.5 12.5 12.5 0 0 1 15.5 0Z' });
}
function drops(doc: Document, id: string, count: number) {
  const g = node(doc, 'g', { stroke: `url(#${id}-drop)`, 'stroke-width': 3.2, 'stroke-linecap': 'round' });
  const xs = count === 2 ? [27, 39] : [23, 32.5, 42];
  xs.forEach((x, i) => g.append(node(doc, 'line', { x1: x, y1: 47 + (i % 2) * 2, x2: x - 3, y2: 55 + (i % 2) * 2 })));
  return g;
}
export function weatherGlyph(doc: Document, code: number, isDay = true, size = 48): SVGSVGElement {
  const id = `dh-wg${++counter}`; const kind = glyphKind(code, isDay);
  const svg = node(doc, 'svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', class: `dh-glyph dh-glyph-${kind}` });
  svg.append(node(doc, 'defs', {},
    radial(doc, `${id}-sun`, [[0, '#FFF6B8', 1], [0.45, '#FFD23F', 1], [1, '#FF9500', 1]], 0.38, 0.32, 0.75),
    radial(doc, `${id}-halo`, [[0, '#FFE58A', 0.55], [1, '#FFD23F', 0]], 0.5, 0.5, 0.5),
    gradient(doc, `${id}-ray`, ['#FFD84D', '#FFAE1F'], [10, 10], [54, 54]),
    gradient(doc, `${id}-moon`, ['#FFF8DC', '#E9D49A'], [8, 8], [40, 44]),
    gradient(doc, `${id}-cloud`, ['#FFFFFF', '#D2DCEA'], [32, 22], [32, 50]),
    gradient(doc, `${id}-dark`, ['#EEF1F6', '#8E9BB0'], [32, 14], [32, 46]),
    gradient(doc, `${id}-drop`, ['#7FD0FF', '#2F86FF'], [30, 46], [26, 58]),
    gradient(doc, `${id}-bolt`, ['#FFE45C', '#FF9F0A'], [32, 42], [32, 62])));
  const light = `url(#${id}-cloud)`; const dark = `url(#${id}-dark)`;
  switch (kind) {
    case 'sun': svg.append(sun(doc, id, 32, 32, 12, true)); break;
    case 'moon': svg.append(moon(doc, id, 14, 14, 1.15), node(doc, 'circle', { cx: 49, cy: 15, r: 1.6, fill: '#FFF3C4' }), node(doc, 'circle', { cx: 54, cy: 26, r: 1.1, fill: '#FFF3C4' })); break;
    case 'partly-day': svg.append(sun(doc, id, 24, 23, 9, true), cloud(doc, light, 6, 6, 0.95)); break;
    case 'partly-night': svg.append(moon(doc, id, 12, 8, 0.8), cloud(doc, light, 6, 6, 0.95)); break;
    case 'cloud': svg.append(cloud(doc, dark, -5, -6, 0.85), cloud(doc, light, 4, 2, 0.95)); break;
    case 'fog': svg.append(cloud(doc, light, 0, -6), node(doc, 'g', { stroke: '#E6ECF4', 'stroke-width': 3, 'stroke-linecap': 'round' },
      node(doc, 'line', { x1: 16, y1: 49, x2: 44, y2: 49 }), node(doc, 'line', { x1: 22, y1: 56, x2: 50, y2: 56 }))); break;
    case 'drizzle': svg.append(cloud(doc, light, 0, -8), drops(doc, id, 2)); break;
    case 'rain': svg.append(cloud(doc, dark, 0, -8), drops(doc, id, 3)); break;
    case 'snow': svg.append(cloud(doc, light, 0, -8), node(doc, 'g', { fill: '#FFFFFF', stroke: '#A9D4F5', 'stroke-width': 1.2 },
      node(doc, 'circle', { cx: 23, cy: 50, r: 2.6 }), node(doc, 'circle', { cx: 33, cy: 55, r: 2.6 }), node(doc, 'circle', { cx: 43, cy: 50, r: 2.6 }))); break;
    case 'thunder': svg.append(cloud(doc, dark, 0, -8), node(doc, 'path', { fill: `url(#${id}-bolt)`, d: 'M34 41 25 54h7l-3 10 11-15h-7l4-8Z' })); break;
  }
  return svg;
}
