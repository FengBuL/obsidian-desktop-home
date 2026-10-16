export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag); if (cls) element.className = cls; if (text !== undefined) element.textContent = text; return element;
}
export function button(doc: Document, label: string, action: () => void, cls = 'dh-icon-button'): HTMLButtonElement {
  const b = el(doc, 'button', cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', action); return b;
}
export function textButton(doc: Document, text: string, action: () => void, cls = 'dh-text-button'): HTMLButtonElement {
  const b = button(doc, text, action, cls); b.textContent = text; return b;
}
