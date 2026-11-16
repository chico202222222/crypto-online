import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWyckoff } from "../crypto_utils/wyckoff.ts";

function accumulationCandles() {
  const candles = [];
  for (let index = 0; index < 110; index++) {
    const close = index < 30 ? 150 - index * 1.4 : index < 84 ? 110 + Math.sin(index / 4) * 5 : 131 + Math.sin(index / 4) * 2;
    candles.push({ time: 1_700_000_000 + index * 14_400, open: close - 0.4, high: close + 1.2, low: close - 1.2, close, volume: 100 });
  }
  Object.assign(candles[30], { open: 102, high: 104, low: 95, close: 101, volume: 400 });
  Object.assign(candles[38], { open: 120, high: 126, low: 118, close: 122, volume: 170 });
  Object.assign(candles[51], { open: 100, high: 102, low: 96, close: 99, volume: 95 });
  Object.assign(candles[70], { open: 98, high: 100, low: 92, close: 98, volume: 145 });
  Object.assign(candles[84], { open: 122, high: 130, low: 121, close: 128, volume: 240 });
  Object.assign(candles[91], { open: 124, high: 126, low: 122, close: 125, volume: 85 });
  return candles;
}

test("detecta a sequência de acumulação e mantém os eventos em ordem", () => {
  const result = analyzeWyckoff(accumulationCandles(), "accumulation");
  assert.equal(result.phase, "E");
  assert.deepEqual(result.events.map((event) => event.code), ["SC", "AR", "ST", "SPR", "SOS", "LPS"]);
  assert.ok(result.support < result.resistance);
  assert.deepEqual(result.segments.map((segment) => segment.phase), ["A", "B", "C", "D", "E"]);
});

test("detecta a sequência espelhada de distribuição", () => {
  const candles = accumulationCandles().map((candle) => ({
    ...candle,
    open: 300 - candle.open,
    high: 300 - candle.low,
    low: 300 - candle.high,
    close: 300 - candle.close,
  }));
  const result = analyzeWyckoff(candles, "distribution");
  assert.equal(result.phase, "E");
  assert.deepEqual(result.events.map((event) => event.code), ["BC", "AR", "ST", "UTAD", "SOW", "LPSY"]);
});

test("não cria fases em uma série sem clímax de volume", () => {
  const candles = accumulationCandles().map((candle) => ({ ...candle, volume: 100 }));
  const result = analyzeWyckoff(candles, "accumulation");
  assert.equal(result.phase, null);
  assert.equal(result.events.length, 0);
  assert.equal(result.levelSource, "recent");
});

test("não marca estrutura quando o volume e a amplitude são zero", () => {
  const candles = accumulationCandles().map((candle) => ({ ...candle, high: candle.close, low: candle.close, open: candle.close, volume: 0 }));
  const result = analyzeWyckoff(candles, "accumulation");
  assert.equal(result.phase, null);
  assert.equal(result.events.length, 0);
});
