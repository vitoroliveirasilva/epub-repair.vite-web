export interface ScheduledTask {
  label: string;
  run: () => Promise<void>;
}

/**
 * FIFO delimitada. As tarefas são executadas estritamente uma de cada vez:
 * não permite que dois reparos mutem o estado de um mesmo EPUB simultaneamente.
 * Jobs pendentes podem ser descartados, sem interromper o Worker ativo.
 */
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
          // O executor da UI já apresenta falhas; não interromper os jobs
          // seguintes nem rejeitar uma Promise sem observador.
        }
      }
    } finally {
      this.running = false;
      this.onChange(this.pending.length);
    }
  }
}
