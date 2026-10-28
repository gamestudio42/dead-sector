export function uiRoot(): HTMLElement {
  const el = document.getElementById('ui');
  if (!el) throw new Error('#ui missing');
  return el;
}

export function clearUi(): void {
  uiRoot().innerHTML = '';
}
