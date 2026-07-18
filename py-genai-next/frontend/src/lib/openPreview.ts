/**
 * Opening the product tour.
 *
 * On desktop a new tab is nice — you keep your chat open. On phones it is a
 * liability: iOS Safari ships with "Block Pop-ups" enabled, and a `target=_blank`
 * navigation can be swallowed with no feedback, so the tour simply appears not to
 * open. Small/touch screens therefore navigate in the same tab, which no popup
 * blocker can intercept. The preview page links back to the app.
 */
export const PREVIEW_URL = "/preview";

export function prefersSameTab(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1023px), (pointer: coarse)").matches;
}

/** Use as an anchor onClick; keeps normal desktop behaviour (incl. ⌘/ctrl-click). */
export function openPreview(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let the browser do its thing
  if (!prefersSameTab()) return;                                      // desktop: keep the new tab
  e.preventDefault();
  window.location.assign(PREVIEW_URL);
}
