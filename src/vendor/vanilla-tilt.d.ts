export interface TiltOptions {
  max?: number;
  perspective?: number;
  scale?: number;
  speed?: number;
  transition?: boolean;
  reset?: boolean;
  glare?: boolean;
  gyroscope?: boolean;
}
export default class VanillaTilt {
  constructor(element: HTMLElement, settings?: TiltOptions);
  destroy(): void;
}
