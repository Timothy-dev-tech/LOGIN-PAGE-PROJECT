// Look up an element and check it is the kind we expect. If the HTML and the
// script ever disagree (a renamed id, a wrong tag) we fail loudly with a clear
// message instead of crashing later with "cannot read properties of null".
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Expected #${id} to be a ${type.name}`);
  }
  return element;
}