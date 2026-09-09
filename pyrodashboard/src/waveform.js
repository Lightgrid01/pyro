// src/waveform.js
// Generates an ECG-style waveform path: a flat baseline interrupted by
// sharp spikes, one per pulse. Purely a function of real data (the pulse
// count) — not decorative noise.

export function buildPulsePath(count, width = 280, height = 60) {
  const baseline = height / 2;
  const spikeCount = Math.max(1, Math.min(count, 10));
  const segment = width / (spikeCount + 1);
  let d = `M 0 ${baseline}`;

  for (let i = 1; i <= spikeCount; i++) {
    const x = i * segment;
    const spikeWidth = segment * 0.28;
    d += ` L ${x - spikeWidth} ${baseline}`;
    d += ` L ${x - spikeWidth * 0.4} ${baseline - height * 0.38}`;
    d += ` L ${x} ${baseline + height * 0.22}`;
    d += ` L ${x + spikeWidth * 0.4} ${baseline}`;
  }
  d += ` L ${width} ${baseline}`;
  return d;
}
