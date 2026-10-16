import { widgetSpan, WIDGET_NAMES, type Settings, type Widget, type WidgetSize } from '../model';
import { el, button, textButton } from './dom';
import { icon, type IconName } from './icons';
import { renderWidget, type WidgetContext } from './widgets';

interface GridActions {
  remove(id: string): void;
  resize(id: string, size: WidgetSize): void;
  move(id: string, delta: number): void;
  drop(id: string, target: string): void;
  add(): void;
}
interface Card { element: HTMLElement; bodyKey: string; editor?: HTMLElement }

/** Reuse cards and editor controls so appearance changes never restart widgets. */
export class WidgetGrid {
  private cards = new Map<string, Card>();
  private editing = false;
  private dragged = '';
  constructor(private board: HTMLElement, private actions: GridActions) {}
  update(settings: Settings, editing: boolean, context: WidgetContext, revision: number, day: string) {
    this.editing = editing;
    const doc = this.board.ownerDocument;
    const focused = this.board.contains(doc.activeElement) ? doc.activeElement as HTMLElement : null;
    const ids = new Set(settings.widgets.map(w => w.id));
    for (const [id, card] of this.cards) if (!ids.has(id)) { card.element.remove(); this.cards.delete(id); }
    if (!settings.widgets.length) {
      if (!this.board.querySelector('.dh-empty-desktop')) {
        const empty = el(doc, 'div', 'dh-empty-desktop');
        empty.append(icon(doc, 'grid', 34), el(doc, 'h2', '', '留白，也可以很美'), textButton(doc, '添加第一个组件', this.actions.add, 'dh-add-button'));
        this.board.append(empty);
      }
      if (focused) this.board.querySelector<HTMLButtonElement>('.dh-empty-desktop button')?.focus({ preventScroll: true });
      return;
    }
    this.board.querySelector('.dh-empty-desktop')?.remove();
    settings.widgets.forEach((widget, index) => {
      let card = this.cards.get(widget.id);
      if (!card) { card = { element: this.createCard(widget), bodyKey: '' }; this.cards.set(widget.id, card); }
      const node = card.element;
      node.classList.remove('dh-dragging', 'dh-drop-target');
      node.classList.toggle('dh-size-s', widget.size === 's'); node.classList.toggle('dh-size-m', widget.size === 'm'); node.classList.toggle('dh-size-l', widget.size === 'l');
      const [cols, rows] = widgetSpan(widget); node.style.setProperty('--dh-cols', String(cols)); node.style.setProperty('--dh-rows', String(rows)); node.draggable = editing;
      if (editing && !card.editor) { card.editor = this.editor(widget); node.prepend(card.editor); }
      if (!editing && card.editor) { card.editor.remove(); card.editor = undefined; }
      if (card.editor) {
        card.editor.querySelector<HTMLSelectElement>('select')!.value = widget.size;
        card.editor.querySelector<HTMLButtonElement>('[data-action="previous"]')!.disabled = index === 0;
        card.editor.querySelector<HTMLButtonElement>('[data-action="next"]')!.disabled = index === settings.widgets.length - 1;
      }
      const key = widget.kind === 'clock' ? 'clock' : widget.kind === 'calendar' ? day : widget.kind === 'weather'
        ? JSON.stringify([widget.size, context.weather, context.weatherStatus, settings.city])
        : JSON.stringify([widget.size, revision, widget.kind === 'pinned' ? settings.pins : null]);
      if (card.bodyKey !== key) {
        node.querySelector('.dh-widget-body')?.remove(); node.append(renderWidget(widget, context)); card.bodyKey = key;
      }
      const position = this.board.children[index];
      if (position !== node) this.board.insertBefore(node, position ?? null);
    });
    if (focused && doc.activeElement !== focused) {
      if (focused.isConnected && !(focused as HTMLButtonElement).disabled) focused.focus({ preventScroll: true });
      else this.board.querySelector<HTMLElement>('select, button:not([disabled])')?.focus({ preventScroll: true });
    }
  }
  private createCard(widget: Widget): HTMLElement {
    const node = el(this.board.ownerDocument, 'article', `dh-widget dh-widget-${widget.kind}`); node.dataset.widgetId = widget.id; node.setAttribute('aria-label', WIDGET_NAMES[widget.kind]);
    node.addEventListener('dragstart', e => {
      if (!this.editing || (e.target as HTMLElement).closest('button,input,select')) { e.preventDefault(); return; }
      this.dragged = widget.id; e.dataTransfer?.setData('text/plain', widget.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; node.classList.add('dh-dragging');
    });
    node.addEventListener('dragend', () => { this.dragged = ''; this.board.querySelectorAll('.dh-dragging,.dh-drop-target').forEach(n => n.classList.remove('dh-dragging', 'dh-drop-target')); });
    node.addEventListener('dragover', e => { if (this.editing && this.dragged && this.dragged !== widget.id) { e.preventDefault(); node.classList.add('dh-drop-target'); } });
    node.addEventListener('dragleave', e => { if (!node.contains(e.relatedTarget as Node)) node.classList.remove('dh-drop-target'); });
    node.addEventListener('drop', e => { if (!this.editing || !this.dragged) return; e.preventDefault(); const id = this.dragged; this.dragged = ''; this.actions.drop(id, widget.id); });
    return node;
  }
  private editor(widget: Widget) {
    const doc = this.board.ownerDocument; const name = WIDGET_NAMES[widget.kind]; const editor = el(doc, 'div', 'dh-widget-editor');
    editor.append(el(doc, 'span', 'dh-widget-edit-label', name));
    const control = (label: string, glyph: IconName, action: () => void) => { const b = button(doc, label, action); b.append(icon(doc, glyph, 13)); return b; };
    const remove = control(`移除${name}`, 'close', () => this.actions.remove(widget.id));
    const size = el(doc, 'select', 'dh-size-select'); size.setAttribute('aria-label', `${name}尺寸`);
    for (const [value, label] of [['s', '小'], ['m', '中'], ['l', '大']]) { const option = el(doc, 'option', '', label); option.value = value; size.append(option); }
    size.addEventListener('change', () => this.actions.resize(widget.id, size.value as WidgetSize));
    const previous = control(`向前移动${name}`, 'left', () => this.actions.move(widget.id, -1)); previous.dataset.action = 'previous';
    const next = control(`向后移动${name}`, 'right', () => this.actions.move(widget.id, 1)); next.dataset.action = 'next';
    editor.append(size, previous, next, remove); return editor;
  }
}
