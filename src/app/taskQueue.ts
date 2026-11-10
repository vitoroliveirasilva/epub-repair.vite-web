export interface ScheduledTask {
  label: string;
  run: () => Promise<void>;
}






export class SerialTaskQueue {
  private readonly pending: ScheduledTask[] = [];
  private running = false;
  readonly maxPending: number;

  constructor(
    private readonly onChange: (pending: number) => void,
    maxPending = 8,
  ) {
    this.maxPending = maxPending;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

   
  get hasPendingMutation(): boolean {
    return this.pending.some((task) =>
      task.label === 'Reparar EPUB' || task.label === 'Substituir capa');
  }

  enqueue(task: ScheduledTask): boolean {
    if (this.pending.length >= this.maxPending) return false;
    this.pending.push(task);
    this.onChange(this.pending.length);
    void this.drain();
    return true;
  }

  clearPending(): number {
    const removed = this.pending.length;
    this.pending.length = 0;
    this.onChange(0);
    return removed;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length > 0) {
        const task = this.pending.shift()!;
        this.onChange(this.pending.length);
        try {
          await task.run();
        } catch {
          
          
        }
      }
    } finally {
      this.running = false;
      this.onChange(this.pending.length);
    }
  }
}
