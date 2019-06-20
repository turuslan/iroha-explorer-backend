import sortedIndexBy from 'lodash/sortedIndexBy';

export class SequentialQueue<T> {
  private items: T[] = [];
  private consumers: ((item: T) => void)[] = [];

  public constructor(
    private indexOf: (item: T) => number,
    private nextIndex: number,
  ) {
  }

  public push(item: T) {
    const itemIndex = this.indexOf(item);
    if (itemIndex >= this.nextIndex && !this.items.find(existing => this.indexOf(existing) === itemIndex)) {
      this.items.splice(sortedIndexBy(this.items, item, this.indexOf), 0, item);
      this.checkConsumers();
      return true;
    }
    return false;
  }

  public next() {
    return new Promise<T>((resolve) => {
      this.consumers.push(resolve);
      this.checkConsumers();
    });
  }

  public pop() {
    if (this.tryNext() !== null) {
      this.nextIndex += 1;
      this.items.shift();
      this.checkConsumers();
      return true;
    }
    return false;
  }

  private tryNext() {
    const first = this.items.length ? this.items[0] : null;
    return first !== null && this.indexOf(first) === this.nextIndex ? first : null;
  }

  private checkConsumers() {
    const next = this.tryNext();
    if (next !== null) {
      this.consumers.forEach(resolve => resolve(next));
      this.consumers = [];
    }
  }
}
