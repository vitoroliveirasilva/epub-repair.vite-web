import VanillaTilt from '../vendor/vanilla-tilt.js';

const activeTilt = new WeakMap<HTMLElement, VanillaTilt>();

export function enableCoverPreviewTilt(root: HTMLElement): void {
  activeTilt.get(root)?.destroy();
  activeTilt.delete(root);

  const preview = root.querySelector<HTMLElement>('.cover-studio-preview-stage .cover-preview-tilt');
  if (!preview || typeof window.matchMedia !== 'function') return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  activeTilt.set(root, new VanillaTilt(preview, {
    max: 7,
    perspective: 1200,
    scale: 1,
    speed: 550,
    transition: true,
    reset: true,
    glare: false,
    gyroscope: false,
  }));
}
