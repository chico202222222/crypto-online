"use client";

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MarketCandle, WyckoffAnalysis, WyckoffKind, WyckoffPhase } from "@/crypto_utils/wyckoff";

interface Props {
  candles: MarketCandle[];
  analysis: WyckoffAnalysis | null;
  kind: WyckoffKind;
  precision: number;
}

interface PhasePosition {
  phase: WyckoffPhase;
  start: number;
  end: number;
}

export function WyckoffChart({ candles, analysis, kind, precision }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const analysisRef = useRef<WyckoffAnalysis | null>(null);
  const updatePhasesRef = useRef<() => void>(() => {});
  const [phases, setPhases] = useState<PhasePosition[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9aaabc",
        fontFamily: "var(--font-geist-mono)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#24313d", style: LineStyle.Dotted },
        horzLines: { color: "#24313d", style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: "#344351", scaleMargins: { top: 0.12, bottom: 0.24 } },
      timeScale: { borderColor: "#344351", timeVisible: true, secondsVisible: false, rightOffset: 3 },
      crosshair: {
        vertLine: { color: "#718194", style: LineStyle.Dashed },
        horzLine: { color: "#718194", style: LineStyle.Dashed },
      },
    });
    const price = chart.addSeries(LineSeries, { color: "#6c93e8", lineWidth: 2, priceLineVisible: false });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    priceRef.current = price;
    volumeRef.current = volume;
    markersRef.current = createSeriesMarkers(price, []);

    const updatePhases = () => {
      const segments = analysisRef.current?.segments ?? [];
      setPhases(segments.flatMap((segment) => {
        const start = chart.timeScale().timeToCoordinate(segment.start as UTCTimestamp);
        const end = chart.timeScale().timeToCoordinate(segment.end as UTCTimestamp);
        return start === null || end === null ? [] : [{ phase: segment.phase, start, end }];
      }));
    };
    updatePhasesRef.current = updatePhases;
    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePhases);

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
      updatePhases();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePhases);
      markersRef.current = null;
      priceRef.current = null;
      volumeRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const price = priceRef.current;
    const volume = volumeRef.current;
    if (!chart || !price || !volume) return;

    analysisRef.current = analysis;
    const color = kind === "accumulation" ? "#75a7ff" : "#ef8588";
    const minMove = Math.max(10 ** -precision, 1e-10);
    price.applyOptions({
      color,
      priceFormat: { type: "price", precision, minMove },
    });

    const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
    const validCandles: MarketCandle[] = [];
    for (const c of sortedCandles) {
      if (c && typeof c.time === "number" && (validCandles.length === 0 || c.time > validCandles[validCandles.length - 1].time)) {
        validCandles.push(c);
      }
    }

    price.setData(validCandles.map((candle) => ({ time: candle.time as UTCTimestamp, value: candle.close })));
    volume.setData(validCandles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      value: candle.volume,
      color: candle.close >= candle.open ? "#376d63a0" : "#855054a0",
    })));

    for (const line of linesRef.current) price.removePriceLine(line);
    linesRef.current = [];
    if (analysis && analysis.support > 0 && analysis.resistance > analysis.support) {
      linesRef.current = [
        price.createPriceLine({ price: analysis.resistance, color: "#dd7279", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "RESISTÊNCIA" }),
        price.createPriceLine({ price: analysis.support, color: "#6fbd87", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "SUPORTE" }),
      ];
    }

    const markers: SeriesMarker<Time>[] = (analysis?.events ?? []).map((event) => {
      const below = kind === "accumulation"
        ? ["SC", "ST", "SPR", "TEST", "LPS"].includes(event.code)
        : ["AR", "SOW"].includes(event.code);
      return {
        time: event.time as UTCTimestamp,
        position: below ? "belowBar" : "aboveBar",
        color: event.code === "SOS" || event.code === "SOW" ? "#e6c687" : color,
        shape: event.code === "SOS" ? "arrowUp" : event.code === "SOW" ? "arrowDown" : "circle",
        text: event.code,
        size: 1.2,
      };
    });
    markersRef.current?.setMarkers(markers.sort((a, b) => Number(a.time) - Number(b.time)));
    if (candles.length) chart.timeScale().fitContent();
    const frame = requestAnimationFrame(updatePhasesRef.current);
    return () => cancelAnimationFrame(frame);
  }, [candles, analysis, kind, precision]);

  return (
    <div className="relative h-[440px] w-full">
      <div ref={containerRef} role="img" className="h-full w-full" aria-label="Gráfico de preço e volume com níveis e eventos Wyckoff" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {phases.map((segment) => (
          <div key={`${segment.phase}-${segment.start}`}>
            {segment.phase !== "A" && (
              <div className="absolute bottom-9 top-3 border-l border-dashed border-white/35" style={{ left: segment.start }} />
            )}
            {segment.end - segment.start > 36 && (
              <span
                className="absolute bottom-12 -translate-x-1/2 rounded bg-[#111b26]/85 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/80"
                style={{ left: (segment.start + segment.end) / 2 }}
              >
                Fase {segment.phase}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
