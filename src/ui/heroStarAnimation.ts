export function startHeroStarAnimation(hero: HTMLElement): void {
  const stars = Array.from(hero.querySelectorAll<HTMLElement>('.home-star'));
  if (stars.length < 5) return;

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let timer: number | undefined;
  let cycle = 0;
  let lastShown = new Set<HTMLElement>();
  let stopped = false;
  let detachObserver: MutationObserver | undefined;

  const randomBetween = (low: number, high: number): number =>
    low + Math.random() * (high - low);

  const clearStars = (): void => {
    stars.forEach(star => star.classList.remove('is-visible', 'is-static'));
  };

  const schedule = (callback: () => void, delay: number): void => {
    timer = window.setTimeout(callback, delay);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
    detachObserver?.disconnect();
    reduce?.removeEventListener?.('change', updatePreference);
    document.removeEventListener('visibilitychange', updatePreference);
    clearStars();
  };

  const showStatic = (): void => {
    clearStars();
    stars[1]?.classList.add('is-static');
    stars[4]?.classList.add('is-static');
  };

  const next = (): void => {
    if (!hero.isConnected) {
      stop();
      return;
    }
    if (reduce?.matches || document.hidden) {
      updatePreference();
      return;
    }
    clearStars();
    const count = cycle++ % 2 === 0 ? 2 : 1;
    const pool = stars.filter(star => !lastShown.has(star));
    const selection: HTMLElement[] = [];
    while (selection.length < count && pool.length) {
      selection.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    }
    lastShown = new Set(selection);

    selection.forEach(star => {
      star.style.setProperty('--star-fade-ms', `${Math.round(randomBetween(1000, 1650))}ms`);
      star.classList.add('is-visible');
    });

    schedule(() => {
      selection.forEach(star => star.classList.remove('is-visible'));
      schedule(next, randomBetween(1450, 2400));
    }, randomBetween(2300, 3300));
  };

  function updatePreference(): void {
    if (!hero.isConnected) {
      stop();
      return;
    }
    if (timer !== undefined) window.clearTimeout(timer);
    clearStars();
    if (reduce?.matches) showStatic();
    else if (!document.hidden) schedule(next, randomBetween(500, 1200));
  }

  if (hero.parentElement && typeof MutationObserver !== 'undefined') {
    detachObserver = new MutationObserver(() => {
      if (!hero.isConnected) stop();
    });
    detachObserver.observe(hero.parentElement, { childList: true });
  }
  reduce?.addEventListener?.('change', updatePreference);
  document.addEventListener('visibilitychange', updatePreference);
  updatePreference();
}
