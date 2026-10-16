// Obsidian 在应用内为 HTMLElement 提供 setCssProps；浏览器预览与测试用同样语义的最小实现。
if (!('setCssProps' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'setCssProps', {
    configurable: true,
    value(this: HTMLElement, props: Record<string, string>) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); },
  });
}
export {};
