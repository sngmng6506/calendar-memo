export function createPersistenceController({ state, saveStore }) {
  let running = null;
  let dirty = false;
  let debounceTimer = null;
  let debounceResolvers = [];

  async function run() {
    if (running) {
      dirty = true;
      return running;
    }

    running = (async () => {
      do {
        dirty = false;
        const snapshot = structuredClone(state.store);
        const saved = await saveStore(snapshot);
        if (saved?.meta) state.store.meta = saved.meta;
        if (saved?.settings?.lastStoreRecovery) {
          state.store.settings.lastStoreRecovery = saved.settings.lastStoreRecovery;
        }
      } while (dirty);
    })();

    try {
      await running;
    } finally {
      running = null;
    }
  }

  function resolveDebounced(error = null) {
    const resolvers = debounceResolvers;
    debounceResolvers = [];
    for (const { resolve, reject } of resolvers) {
      if (error) reject(error);
      else resolve();
    }
  }

  function persist(options = {}) {
    const debounceMs = Number(options.debounceMs || 0);
    if (!debounceMs) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      const promise = run();
      promise.then(() => resolveDebounced(), resolveDebounced);
      return promise;
    }

    dirty = true;
    clearTimeout(debounceTimer);
    return new Promise((resolve, reject) => {
      debounceResolvers.push({ resolve, reject });
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        run().then(() => resolveDebounced(), (error) => resolveDebounced(error));
      }, debounceMs);
    });
  }

  async function flush() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    await run();
    resolveDebounced();
  }

  return { persist, flush };
}
