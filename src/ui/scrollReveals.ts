const REVEAL_TARGETS = ["#app-workspace .workspace-intro","#app-workspace .workflow-mode-selector","#app-workspace .workspace-core > .panel","#app-workspace .workspace > .cover-studio-panel","#app-workspace .workspace > .panel","#app .capability-showcase","#app .support-sections .support-heading","#app .support-sections .support-card","#app .converter-main > .panel","#app .converter-sidebar > .panel","#app .converter-how > .section-heading","#app .converter-how .converter-how-card","#app .converter-how .converter-limitations",
"#app .editorial-footer-content > .editorial-footer-brand",
"#app .editorial-footer-content > .editorial-footer-art",
"#app .editorial-footer-content > .editorial-footer-product",
"#app .editorial-footer-content > .editorial-footer-project",
"#app .editorial-footer-wave"].join(', ');
const activeObservers = new WeakMap<HTMLElement, IntersectionObserver>();

export function setupScrollReveals(root: HTMLElement): void {
  activeObservers.get(root)?.disconnect();
  activeObservers.delete(root);

  if (typeof IntersectionObserver === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_TARGETS));
  if (targets.length === 0) return;

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
  const groupIndex = new Map<Element, number>();
  const positions = targets.map((target) => target.getBoundingClientRect());
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      if (!target.isConnected) continue;
      const hasFocus = target.contains(document.activeElement);
      target.dataset.scrollRevealState = entry.isIntersecting || hasFocus ? 'visible' : 'hidden';
    }
  }, {
    rootMargin: '-4% 0px -9% 0px',
    threshold: 0,
  });

  targets.forEach((target, index) => {
    const parent = target.parentElement;
    if (parent) {
      const order = groupIndex.get(parent) ?? 0;
      const stagger = target.closest('.editorial-footer') ? 95 : 55;
      target.style.setProperty('--scroll-reveal-delay', String(Math.min(order, 3) * stagger) + 'ms');
      groupIndex.set(parent, order + 1);
    }
    const rect = positions[index]!;
    const onScreen = rect.bottom >= 0 && rect.top < viewportHeight * .92;
    const hasFocus = target.contains(document.activeElement);
    target.dataset.scrollRevealState = onScreen || hasFocus ? 'visible' : 'hidden';
    target.classList.add('scroll-reveal-element');
    observer.observe(target);
  });
  activeObservers.set(root, observer);
}
