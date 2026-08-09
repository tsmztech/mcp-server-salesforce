/**
 * Wraps an async function and records all calls.
 * @param {Function} fn - The function to wrap (default: async no-op returning undefined)
 * @returns {Function} A spy function with a `.calls` array of { args, result }
 */
export function createSpy(fn = async () => {}) {
  const spy = async (...args) => {
    const result = await fn(...args);
    spy.calls.push({ args, result });
    return result;
  };
  spy.calls = [];
  return spy;
}
