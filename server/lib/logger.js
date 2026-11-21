const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;
  function emit(kind, message, meta) {
    if (LEVELS[kind] < threshold) return;
    const line = {
      ts: new Date().toISOString(),
      level: kind,
      message,
      ...(meta && Object.keys(meta).length ? meta : {}),
    };
    const target = kind === 'error' ? console.error : kind === 'warn' ? console.warn : console.log;
    target(JSON.stringify(line));
  }
  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
  };
}
