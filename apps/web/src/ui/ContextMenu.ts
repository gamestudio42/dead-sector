import { uiRoot } from './dom';

export interface MenuItem {
  label: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

/**
 * Small context menu at a screen position (Ctrl + right click on the map). Closes on choice,
 * outside click, Esc or right click elsewhere; keyboard: ↑/↓ + Enter.
 */
export class ContextMenu {
  private el: HTMLDivElement | null = null;
  private onDoc = (e: Event) => {
    if (this.el && !this.el.contains(e.target as Node)) this.close();
  };
  private onKey = (e: KeyboardEvent) => {
    if (!this.el) return;
    const items = [...this.el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = items.length;
      items[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n]?.focus();
    } else if (e.key !== 'Enter') {
      // swallow game shortcuts while the menu is open
      e.stopImmediatePropagation();
    }
  };

  get open(): boolean {
    return !!this.el;
  }

  show(screenX: number, screenY: number, title: string, items: MenuItem[]): void {
    this.close();
    const m = document.createElement('div');
    m.className = 'context-menu panel';
    m.dataset['testid'] = 'context-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="cm-title">${title}</div>`;
    items.forEach((it) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      if (it.danger) b.classList.add('danger');
      b.innerHTML = `<span>${it.label}</span>${it.hint ? `<small>${it.hint}</small>` : ''}`;
      b.onclick = (e) => {
        e.stopPropagation();
        this.close();
        it.run();
      };
      m.appendChild(b);
    });
    m.addEventListener('contextmenu', (e) => e.preventDefault());
    uiRoot().appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(screenX, window.innerWidth - r.width - 6)}px`;
    m.style.top = `${Math.min(screenY, window.innerHeight - r.height - 6)}px`;
    this.el = m;
    m.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    window.setTimeout(() => {
      document.addEventListener('pointerdown', this.onDoc, true);
    }, 0);
    window.addEventListener('keydown', this.onKey, true);
  }

  close(): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    document.removeEventListener('pointerdown', this.onDoc, true);
    window.removeEventListener('keydown', this.onKey, true);
  }
}
