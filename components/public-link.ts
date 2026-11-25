import type {MouseEvent} from 'react';

/** Let the browser handle new tabs, copy-link, modified clicks and no-JS navigation. */
export function followPublicLink(event: MouseEvent<HTMLAnchorElement>, open: () => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open();
}
