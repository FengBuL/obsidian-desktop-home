import { widgetSpan, WIDGET_NAMES, type Settings, type Widget, type WidgetSize } from '../model';
import { el, button, textButton, labelWith, setVars } from './dom';
import { icon, type IconName } from './icons';
import { renderWidget, widgetKey, type WidgetContext } from './widgets';

interface GridActions {
  remove(this: void, id: string): void;
  resize(this: void, id: string, size: WidgetSize): void;
  move(this: void, id: string, delta: number): void;
  drop(this: void, id: string, target: string): void;
  add(this: void): void;
}
interface Card { element: HTMLElement; bodyKey: string; editor?: HTMLElement }

/** Reuse cards and editor controls so appearance changes never restart widgets. */
export class WidgetGrid {
  private cards = new Map<string, Card>();
  private editing = false;
  private dragged = '';
  constructor(private board: HTMLElement, private actions: GridActions) {}
  update(settings: Settings, editing: boolean, context: WidgetContext, day: string) {
    this.editing = editing;
    const doc = this.board.ownerDocument;
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && this.board.contains(active) ? active : null;
    const ids = new Set(settings.widgets.map(w => w.id));
    for (const [id, card] of this.cards) if (!ids.has(id)) { card.element.remove(); this.cards.delete(id); }
    if (!settings.widgets.length) {
      if (!this.board.querySelector('.dh-empty-desktop')) {
        const empty = el(doc, 'div', 'dh-empty-desktop');
        empty.append(icon(doc, 'grid', 34), el(doc, 'h2', '', '留白，也可以很美'), el(doc, 'p', '', '桌面上还没有组件。添加时钟、天气、日历或笔记卡片，打开 Obsidian 就能看到。'), textButton(doc, '添加第一个组件', () => this.actions.add(), 'dh-add-button'));
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
      const [cols, rows] = widgetSpan(widget); setVars(node, { '--dh-cols': String(cols), '--dh-rows': String(rows) }); node.draggable = editing;
      if (editing && !card.editor) { card.editor = this.editor(widget); node.prepend(card.editor); }
      if (!editing && card.editor) { card.editor.remove(); card.editor = undefined; }
      if (card.editor) {
        const select = card.editor.querySelector('select'); if (select) select.value = widget.size;
        const previous = card.editor.querySelector<HTMLButtonElement>('[data-action="previous"]'); if (previous) previous.disabled = index === 0;
        const next = card.editor.querySelector<HTMLButtonElement>('[data-action="next"]'); if (next) next.disabled = index === settings.widgets.length - 1;
      }
      const key = widgetKey(widget, context, day);
      if (card.bodyKey !== key) {
        // 便签正在输入时不重建，避免丢失光标。
        const typing = widget.kind === 'memo' && node.contains(doc.activeElement) && card.bodyKey;
        if (!typing) { node.querySelector('.dh-widget-body')?.remove(); node.append(renderWidget(widget, context)); card.bodyKey = key; }
      }
      const position = this.board.children[index];
      if (position !== node) this.board.insertBefore(node, position ?? null);
    });
    if (focused && doc.activeElement !== focused) {
      if (focused.isConnected && !focused.matches(':disabled')) focused.focus({ preventScroll: true });
      else this.board.querySelector<HTMLElement>('select, button:not([disabled])')?.focus({ preventScroll: true });
    }
  }
  private createCard(widget: Widget): HTMLElement {
    const node = el(this.board.ownerDocument, 'article', `dh-widget dh-widget-${widget.kind}`); node.dataset.widgetId = widget.id; labelWith(node, WIDGET_NAMES[widget.kind]);
    const target = (e: Event) => e.target instanceof Element ? e.target : null;
    node.addEventListener('dragstart', e => {
      if (!this.editing || target(e)?.closest('button,input,select,textarea')) { e.preventDefault(); return; }
      this.dragged = widget.id; e.dataTransfer?.setData('text/plain', widget.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; node.classList.add('dh-dragging');
    });
    node.addEventListener('dragend', () => { this.dragged = ''; this.board.querySelectorAll('.dh-dragging,.dh-drop-target').forEach(n => n.classList.remove('dh-dragging', 'dh-drop-target')); });
    node.addEventListener('dragover', e => { if (this.editing && this.dragged && this.dragged !== widget.id) { e.preventDefault(); node.classList.add('dh-drop-target'); } });
    node.addEventListener('dragleave', e => { if (!(e.relatedTarget instanceof Node && node.contains(e.relatedTarget))) node.classList.remove('dh-drop-target'); });
    node.addEventListener('drop', e => { if (!this.editing || !this.dragged) return; e.preventDefault(); const id = this.dragged; this.dragged = ''; this.actions.drop(id, widget.id); });
    return node;
  }
  private editor(widget: Widget) {
    const doc = this.board.ownerDocument; const name = WIDGET_NAMES[widget.kind]; const editor = el(doc, 'div', 'dh-widget-editor');
    editor.append(el(doc, 'span', 'dh-widget-edit-label', name));
    const control = (label: string, glyph: IconName, action: () => void) => { const b = button(doc, label, action); b.append(icon(doc, glyph, 13)); return b; };
    const remove = control(`移除${name}`, 'close', () => this.actions.remove(widget.id));
    const size = el(doc, 'select', 'dh-size-select'); size.setAttribute('aria-label', `${name}尺寸`);
    for (const [value, label] of [['s', '小'], ['m', '中'], ['l', '大']] as const) { const option = el(doc, 'option', '', label); option.value = value; size.append(option); }
    size.addEventListener('change', () => { const value = size.value; if (value === 's' || value === 'm' || value === 'l') this.actions.resize(widget.id, value); });
    const previous = control(`向前移动${name}`, 'left', () => this.actions.move(widget.id, -1)); previous.dataset.action = 'previous';
    const next = control(`向后移动${name}`, 'right', () => this.actions.move(widget.id, 1)); next.dataset.action = 'next';
    editor.append(size, previous, next, remove); return editor;
  }
}
