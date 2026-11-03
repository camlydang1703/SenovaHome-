// ============================================================================
// DETERMINISTIC PSEUDO-RANDOM & HASH FUNCTIONS (FNV-1a & LCG)
// ============================================================================

function h01(...args) {
  const str = args.join('|');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = (h * 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296.0;
}

function makeRNG(seed) {
  let s = seed & 0xFFFFFFFF;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 4294967296.0;
  };
}
