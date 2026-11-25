/**
 * CollabFlow - Performance Throttling Utility (Phase 7)
 * 
 * Limits the execution frequency of a function to at most once per `limit` milliseconds.
 * Used to throttle high-frequency Socket.io cursor movements to ~25ms intervals (40 FPS),
 * cutting network bandwidth consumption without degrading visual fluidity.
 * 
 * @param {Function} func - The callback function to throttle
 * @param {number} limit - Interval in milliseconds (default: 25ms)
 * @returns {Function} - Throttled function
 */
export function throttle(func, limit = 25) {
  let lastRan = 0;
  let timerId = null;

  return function (...args) {
    const now = Date.now();
    const remaining = limit - (now - lastRan);

    if (remaining <= 0) {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      func.apply(this, args);
      lastRan = now;
    } else if (!timerId) {
      // Trailing call: guarantees the final mouse coordinate is always delivered
      timerId = setTimeout(() => {
        func.apply(this, args);
        lastRan = Date.now();
        timerId = null;
      }, remaining);
    }
  };
}
