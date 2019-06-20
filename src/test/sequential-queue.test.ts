import identity from 'lodash/identity';
import { SequentialQueue } from '../sequential-queue';
import { shouldResolve } from './util/resolved';

describe('queue', () => {
  type Item = number;
  const makeQueue = (nextIndex: number = 1) => new SequentialQueue<Item>(identity, nextIndex);

  test('sequential', async () => {
    const queue = makeQueue();

    const item1 = queue.next();
    await shouldResolve(item1, false);
    expect(queue.push(0)).toBe(false);
    await shouldResolve(item1, false);
    queue.push(2);
    await shouldResolve(item1, false);
    queue.push(1);
    await shouldResolve(item1, true);

    queue.pop();
    const item2 = queue.next();
    await shouldResolve(item2, true);

    queue.pop();
    const item3 = queue.next();
    await shouldResolve(item3, false);
    queue.push(4);
    await shouldResolve(item3, false);
    expect(queue.pop()).toBe(false);

    expect(await item1).toBe(1);
    expect(await item2).toBe(2);
  });

  test('unique', async () => {
    const queue = makeQueue();

    const item1 = queue.next();
    expect(queue.push(1)).toBe(true);
    expect(queue.push(1)).toBe(false);
    await shouldResolve(item1, true);

    queue.pop();
    const item2 = queue.next();
    expect(queue.push(2)).toBe(true);
    expect(queue.push(2)).toBe(false);
    await shouldResolve(item2, true);

    queue.pop();
    const item3 = queue.next();
    await shouldResolve(item3, false);

    expect(await item1).toBe(1);
    expect(await item2).toBe(2);
  });

  test('starting index', async () => {
    const nextIndex = 100;
    const queue = makeQueue(nextIndex);

    const item1 = queue.next();
    queue.push(nextIndex);
    await shouldResolve(item1, true);

    expect(await item1).toBe(nextIndex);
  });
});
