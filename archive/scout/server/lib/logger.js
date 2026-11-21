const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Minimal structured logger. No request bodies or secrets are ever logged.
 */
export function createLogger(level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(lvl, message, fields) {
    if (LEVELS[lvl] < threshold) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${message}`;
    const suffix = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
    const stream = lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout;
    stream.write(`${line}${suffix}\n`);
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}
