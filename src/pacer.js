// -----------------------------------------------------------------------------
// One call at a time, at least `gap` milliseconds apart: Ambient answers 429
// past 1 request per second per API key. Every REST call of the integration
// (polls, discovery, the test button) goes through the same pacer, so they
// can never burst together.
// -----------------------------------------------------------------------------

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPacer(gap, { now = Date.now, sleep = defaultSleep } = {}) {
  let tail = Promise.resolve();
  let last = -Infinity;
  return function pace(task) {
    const run = tail.then(async () => {
      const wait = last + gap - now();
      if (wait > 0) {
        await sleep(wait);
      }
      try {
        return await task();
      } finally {
        last = now();
      }
    });
    // The next call waits for this one, whatever its outcome.
    tail = run.catch(() => {});
    return run;
  };
}
