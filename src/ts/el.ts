// A tiny helper for building DOM nodes in code. It only ever sets TEXT (never innerHTML), so
// names, notes and device strings that come from users or the network cannot inject markup.
export type Child = Node | string | null | false | undefined;
type Prop = string | number | boolean | undefined | ((event: Event) => void);

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, Prop> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') node.addEventListener(name.replace(/^on/, ''), value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}