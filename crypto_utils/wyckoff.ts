export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type WyckoffKind = "accumulation" | "distribution";
export type WyckoffPhase = "A" | "B" | "C" | "D" | "E";

export interface WyckoffEvent {
  code: string;
  label: string;
  time: number;
  price: number;
  volumeRatio: number;
}

export interface WyckoffSegment {
  phase: WyckoffPhase;
  start: number;
  end: number;
}

export interface WyckoffAnalysis {
  kind: WyckoffKind;
  phase: WyckoffPhase | null;
  support: number;
  resistance: number;
  levelSource: "structure" | "recent";
  events: WyckoffEvent[];
  segments: WyckoffSegment[];
  progress: number;
  observedUntil: number;
}

type Candidate = {
  climax: number;
  rally: number;
  test: number;
  phaseC: number | null;
  phaseCCode: string | null;
  breakout: number | null;
  pullback: number | null;
  phaseE: number | null;
  support: number;
  resistance: number;
  score: number;
};

function average(values: number[], start: number, end: number) {
  let total = 0;
  for (let index = start; index < end; index++) total += values[index];
  return total / Math.max(1, end - start);
}

function quantile(values: number[], position: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * position)];
}

function isPivot(candles: MarketCandle[], index: number, side: "low" | "high", radius = 3) {
  const value = candles[index][side];
  for (let offset = 1; offset <= radius; offset++) {
    if (index - offset < 0 || index + offset >= candles.length) return false;
    if (side === "low" && (candles[index - offset].low < value || candles[index + offset].low < value)) return false;
    if (side === "high" && (candles[index - offset].high > value || candles[index + offset].high > value)) return false;
  }
  return true;
}

function contextLevels(candles: MarketCandle[]) {
  const recent = candles.slice(-100);
  return {
    support: quantile(recent.map((candle) => candle.low), 0.12),
    resistance: quantile(recent.map((candle) => candle.high), 0.88),
  };
}

function scan(candles: MarketCandle[], kind: WyckoffKind): Candidate | null {
  const n = candles.length;
  const isAccumulation = kind === "accumulation";
  const firstSide = isAccumulation ? "low" : "high";
  const oppositeSide = isAccumulation ? "high" : "low";
  const volumes = candles.map((candle) => candle.volume);
  const ranges = candles.map((candle, index) => {
    const previousClose = candles[Math.max(index - 1, 0)].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  let best: Candidate | null = null;

  for (let climax = Math.max(24, n - 190); climax < n - 25; climax++) {
    if (!isPivot(candles, climax, firstSide)) continue;
    const typicalVolume = average(volumes, climax - 20, climax);
    if (typicalVolume <= 0) continue;
    if (candles[climax].volume < typicalVolume * 1.35) continue;
    const atr = average(ranges, climax - 14, climax);
    if (atr <= 0) continue;
    const extreme = candles[climax][firstSide];
    const priorMove = isAccumulation
      ? candles[climax - 16].close - extreme
      : extreme - candles[climax - 16].close;
    if (priorMove < atr * 1.5) continue;

    let rally = -1;
    for (let index = climax + 3; index <= Math.min(climax + 18, n - 12); index++) {
      if (!isPivot(candles, index, oppositeSide, 2)) continue;
      if (rally === -1 || (isAccumulation
        ? candles[index].high > candles[rally].high
        : candles[index].low < candles[rally].low)) rally = index;
    }
    if (rally === -1) continue;
    const opposite = candles[rally][oppositeSide];
    const width = Math.abs(opposite - extreme);
    if (width < atr * 2.5) continue;

    let test = -1;
    let testDistance = Infinity;
    for (let index = rally + 3; index <= Math.min(rally + 36, n - 7); index++) {
      if (!isPivot(candles, index, firstSide, 2)) continue;
      const distance = Math.abs(candles[index][firstSide] - extreme);
      if (distance > Math.max(atr * 1.5, width * 0.25)) continue;
      if (distance < testDistance) {
        test = index;
        testDistance = distance;
      }
    }
    if (test === -1) continue;

    const support = isAccumulation ? Math.min(extreme, candles[test].low) : opposite;
    const resistance = isAccumulation ? opposite : Math.max(extreme, candles[test].high);
    let phaseC: number | null = null;
    let phaseCCode: string | null = null;

    for (let index = test + 7; index < n - 4; index++) {
      const candle = candles[index];
      const recovered = isAccumulation
        ? candle.low < support - atr * 0.1 && Math.max(candle.close, candles[index + 1].close) > support
        : candle.high > resistance + atr * 0.1 && Math.min(candle.close, candles[index + 1].close) < resistance;
      const limited = isAccumulation
        ? candle.low > support - width * 0.4
        : candle.high < resistance + width * 0.4;
      if (recovered && limited) {
        phaseC = index;
        phaseCCode = isAccumulation ? "SPR" : "UTAD";
        break;
      }
    }

    if (phaseC === null) {
      for (let index = test + 10; index < n - 4; index++) {
        if (!isPivot(candles, index, firstSide, 2)) continue;
        const nearLevel = isAccumulation
          ? candles[index].low >= support - atr * 0.1 && candles[index].low <= support + width * 0.28
          : candles[index].high <= resistance + atr * 0.1 && candles[index].high >= resistance - width * 0.28;
        if (nearLevel && candles[index].volume <= candles[climax].volume) {
          phaseC = index;
          phaseCCode = "TEST";
        }
      }
    }

    let breakout: number | null = null;
    if (phaseC !== null) {
      for (let index = phaseC + 3; index < n; index++) {
        const candle = candles[index];
        const outside = isAccumulation
          ? candle.close > resistance + atr * 0.15
          : candle.close < support - atr * 0.15;
        const directional = isAccumulation ? candle.close > candle.open : candle.close < candle.open;
        if (outside && directional && candle.volume >= average(volumes, Math.max(0, index - 20), index) * 1.05) {
          breakout = index;
          break;
        }
      }
    }

    let pullback: number | null = null;
    let phaseE: number | null = null;
    if (breakout !== null) {
      for (let index = breakout + 3; index < n - 2; index++) {
        if (!isPivot(candles, index, firstSide, 2)) continue;
        const holds = isAccumulation
          ? candles[index].low >= support && candles[index].low <= resistance + width * 0.3
          : candles[index].high <= resistance && candles[index].high >= support - width * 0.3;
        if (holds) {
          pullback = index;
          break;
        }
      }
      if (n - breakout >= 8) {
        const lastFive = candles.slice(-5);
        const held = lastFive.filter((candle) => isAccumulation
          ? candle.close > resistance
          : candle.close < support).length;
        if (held >= 4) phaseE = Math.max(breakout + 5, n - 5);
      }
    }

    const progress = 3 + Number(phaseC !== null) + Number(breakout !== null) + Number(pullback !== null) + Number(phaseE !== null);
    const score = progress * 20 + Math.min(width / atr, 8) + Math.min(candles[climax].volume / typicalVolume, 4)
      - testDistance / width * 5 - (n - climax) * 0.015;
    const candidate = { climax, rally, test, phaseC, phaseCCode, breakout, pullback, phaseE, support, resistance, score };
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

export function analyzeWyckoff(candles: MarketCandle[], kind: WyckoffKind): WyckoffAnalysis {
  const last = candles.at(-1)?.time ?? 0;
  if (candles.length < 60) {
    return { kind, phase: null, support: 0, resistance: 0, levelSource: "recent", events: [], segments: [], progress: 0, observedUntil: last };
  }

  const candidate = scan(candles, kind);
  if (!candidate) {
    return { kind, phase: null, ...contextLevels(candles), levelSource: "recent", events: [], segments: [], progress: 0, observedUntil: last };
  }

  const isAccumulation = kind === "accumulation";
  const event = (index: number, code: string, label: string, side: "low" | "high"): WyckoffEvent => ({
    code,
    label,
    time: candles[index].time,
    price: candles[index][side],
    volumeRatio: candles[index].volume / Math.max(1e-9, average(candles.map((candle) => candle.volume), Math.max(0, index - 20), index)),
  });
  const firstSide = isAccumulation ? "low" : "high";
  const oppositeSide = isAccumulation ? "high" : "low";
  const events = [
    event(candidate.climax, isAccumulation ? "SC" : "BC", isAccumulation ? "Clímax de venda" : "Clímax de compra", firstSide),
    event(candidate.rally, "AR", "Reação automática", oppositeSide),
    event(candidate.test, "ST", "Teste secundário", firstSide),
  ];
  if (candidate.phaseC !== null) events.push(event(candidate.phaseC, candidate.phaseCCode!, candidate.phaseCCode === "TEST" ? "Teste da faixa" : isAccumulation ? "Spring" : "Upthrust após distribuição", firstSide));
  if (candidate.breakout !== null) events.push(event(candidate.breakout, isAccumulation ? "SOS" : "SOW", isAccumulation ? "Sinal de força" : "Sinal de fraqueza", oppositeSide));
  if (candidate.pullback !== null) events.push(event(candidate.pullback, isAccumulation ? "LPS" : "LPSY", isAccumulation ? "Último ponto de suporte" : "Último ponto de oferta", firstSide));

  const segments: WyckoffSegment[] = [];
  const boundary = [candidate.climax, candidate.test, candidate.phaseC, candidate.breakout, candidate.phaseE, candles.length - 1];
  const phaseNames: WyckoffPhase[] = ["A", "B", "C", "D", "E"];
  for (let index = 0; index < phaseNames.length; index++) {
    const start = boundary[index];
    const end = boundary[index + 1];
    if (start === null) break;
    if (end === null) {
      segments.push({ phase: phaseNames[index], start: candles[start].time, end: last });
      break;
    }
    if (end > start) segments.push({ phase: phaseNames[index], start: candles[start].time, end: candles[end].time });
  }

  const phase: WyckoffPhase = candidate.phaseE !== null ? "E" : candidate.breakout !== null ? "D" : candidate.phaseC !== null ? "C" : "B";
  return {
    kind,
    phase,
    support: candidate.support,
    resistance: candidate.resistance,
    levelSource: "structure",
    events,
    segments,
    progress: events.length,
    observedUntil: last,
  };
}
