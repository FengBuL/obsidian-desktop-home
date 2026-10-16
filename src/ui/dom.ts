export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag); if (cls) element.className = cls; if (text !== undefined) element.textContent = text; return element;
}
/** 图标按钮：aria-label 同时作为 Obsidian 的悬停提示，所以不再额外设置 title（避免出现两个提示）。 */
export function button(doc: Document, label: string, action: () => void, cls = 'dh-icon-button'): HTMLButtonElement {
  const b = el(doc, 'button', cls); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', action); return b;
}
/** 有可见文字的按钮，可访问名称来自文字本身，不加 aria-label。 */
export function textButton(doc: Document, text: string, action: () => void, cls = 'dh-text-button'): HTMLButtonElement {
  const b = el(doc, 'button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b;
}
/** 内容按钮（行、卡片）：名称来自内部文字。 */
export function rowButton(doc: Document, action: () => void, cls: string): HTMLButtonElement {
  const b = el(doc, 'button', cls); b.type = 'button'; b.addEventListener('click', action); return b;
}
let labelId = 0;
/** 用屏幕阅读器可读、视觉隐藏的文字命名区域，避免大块区域上的 aria-label 触发悬停提示。 */
export function labelWith(container: HTMLElement, text: string, target: HTMLElement = container): HTMLElement {
  const doc = container.ownerDocument; const label = el(doc, 'span', 'dh-sr-only', text); label.id = `dh-label-${++labelId}`;
  container.prepend(label); target.setAttribute('aria-labelledby', label.id); return label;
}
/** 统一通过 CSS 变量传值（Obsidian 的 setCssProps），不写内联样式属性。 */
export function setVars(target: HTMLElement, props: Record<string, string>) { target.setCssProps(props); }
