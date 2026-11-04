// The focused element, looking through shadow roots (the phone lives in one, so document.activeElement is its host).
export function activeEl() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}
