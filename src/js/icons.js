// Replaces legacy <i class="lucide lucide-NAME"> placeholders with inline SVG from the icon sprite.
// Works for markup added later too (MutationObserver), so the rest of the UI keeps using the same classes.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let ready = false;

  async function loadSprite() {
    const res = await fetch('../assets/icons.svg');
    const holder = document.createElement('div');
    holder.innerHTML = await res.text();
    holder.firstElementChild.setAttribute('aria-hidden', 'true');
    document.body.prepend(holder.firstElementChild);
    ready = true;
    convert(document.body);
  }

  function toSvg(el) {
    const name = [...el.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide-spin')?.slice(7);
    if (!name || !document.getElementById(`i-${name}`)) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', `icon ${el.className}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.appendChild(use);
    el.replaceWith(svg);
  }

  function convert(root) {
    if (!ready || !root.querySelectorAll) return;
    if (root.matches?.('i.lucide')) toSvg(root);
    root.querySelectorAll('i.lucide').forEach(toSvg);
  }

  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(convert))).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('DOMContentLoaded', loadSprite);

  // Helper for new code: LCIcon('download') -> '<svg ...>'
  window.LCIcon = (name, cls = '') =>
    `<svg class="icon ${cls}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#i-${name}"/></svg>`;
})();
