// These functions run INSIDE the web page (browser.mjs sends their source over DevTools), so they
// may use only the page's own globals and must not reach anything else in this file.

export function readPage(maxChars) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const name = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || el.title || el.name || '')
    .trim().replace(/\s+/g, ' ').slice(0, 80);
  const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [contenteditable=true]')]
    .filter(visible).slice(0, 150)
    .map((el) => {
      const tag = el.tagName.toLowerCase();
      return `${tag === 'input' ? `input(${el.type || 'text'})` : tag}: ${name(el)}`;
    });
  const body = document.body?.innerText ?? '';
  return { title: document.title, url: location.href, text: body.length > maxChars ? `${body.slice(0, maxChars)}\n(page continues)` : body, controls };
}

export function clickElement(selector, wanted) {
  const name = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ');
  let el = null;
  if (selector) el = document.querySelector(selector);
  else {
    const want = wanted.trim().toLowerCase();
    const all = [...document.querySelectorAll('a, button, input[type=submit], input[type=button], input[type=checkbox], input[type=radio], label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [onclick]')];
    el = all.find((e) => name(e).toLowerCase() === want) ?? all.find((e) => name(e).toLowerCase().includes(want));
  }
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return name(el) || selector;
}

export function focusField(selector, wanted) {
  let el = null;
  if (selector) el = document.querySelector(selector);
  else if (wanted) {
    const want = wanted.trim().toLowerCase();
    const fields = [...document.querySelectorAll('input:not([type=hidden]), textarea, select, [contenteditable=true]')];
    const labels = [...document.querySelectorAll('label[for]')];
    const labelOf = (f) => [f.getAttribute('aria-label'), f.placeholder, f.name, f.id && labels.find((l) => l.htmlFor === f.id)?.innerText, f.closest('label')?.innerText]
      .filter(Boolean).map((s) => s.trim().toLowerCase());
    el = fields.find((f) => labelOf(f).some((l) => l === want)) ?? fields.find((f) => labelOf(f).some((l) => l.includes(want)));
  } else el = document.activeElement;
  if (!el || el === document.body) return null;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (typeof el.select === 'function') el.select();
  return el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.tagName.toLowerCase();
}
