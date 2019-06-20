import delay from 'delay';

const defaultTimeout = 5;

async function resolved<T>(promise: Promise<T>, ms: number = null) {
  const value = {};
  const result = await Promise.race([promise, delay(ms === null ? defaultTimeout : ms, { value })]);
  return result !== value;
}

export const shouldResolve = async <T>(promise: Promise<T>, should: boolean, ms: number = null) =>
  expect(await resolved(promise, ms)).toBe(should);
