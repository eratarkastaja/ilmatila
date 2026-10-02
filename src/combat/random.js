export const DEFAULT_RANDOM_SEED = 0x6d2b79f5;

let fallbackSeedCounter = 0;

/** Creates a repeatable random stream from one unsigned 32-bit seed. */
export function createSeededRandom(seed = DEFAULT_RANDOM_SEED) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates the seed used by a newly prepared sortie. */
export function createSortieSeed() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0];
  }

  fallbackSeedCounter = (fallbackSeedCounter + 1) >>> 0;
  return (Date.now() ^ fallbackSeedCounter) >>> 0;
}
