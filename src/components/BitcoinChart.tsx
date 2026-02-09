import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../api/binance';

interface BitcoinChartProps {
  data: Candle[];
  lastTick: { price: number; time: number } | null;
  interval: string;
  height?: string | number;
}

const BitcoinChart: React.FC<BitcoinChartProps> = ({ data, lastTick, interval, height = 500 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const currentCandleRef = useRef<Candle | null>(null);

  // 인터벌 문자열을 초 단위로 변환
  const getIntervalInSeconds = (int: string): number => {
    const value = parseInt(int);
    if (int.endsWith('m')) return value * 60;
    if (int.endsWith('h')) return value * 3600;
    if (int.endsWith('d')) return value * 86400;
    return 60;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' }, // 더 어두운 색상 (slate-950)
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#0f172a' },
        horzLines: { color: '#0f172a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || (typeof height === 'number' ? height : 500),
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    if (data.length > 0) {
      candlestickSeries.setData(data);
      currentCandleRef.current = { ...data[data.length - 1] };
    }
    
    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !chartContainerRef.current) return;
      const { width, height: entryHeight } = entries[0].contentRect;
      chart.applyOptions({ width, height: entryHeight });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // 초기 데이터가 변경될 때 (예: 처음 로드될 때)
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      currentCandleRef.current = { ...data[data.length - 1] };
    }
  }, [data]);

  // 실시간 틱 데이터 처리
  useEffect(() => {
    if (!seriesRef.current || !lastTick || !currentCandleRef.current) return;

    const { price, time } = lastTick;
    const currentCandle = currentCandleRef.current;
    
    // 현재 인터벌에 따른 새 캔들 여부 확인
    const candleInterval = getIntervalInSeconds(interval); 
    const candleStartTime = Math.floor(time / candleInterval) * candleInterval;

    if (candleStartTime > currentCandle.time) {
      // 새로운 캔들 시작
      const newCandle: Candle = {
        time: candleStartTime,
        open: price,
        high: price,
        low: price,
        close: price,
      };
      seriesRef.current.update(newCandle);
      currentCandleRef.current = newCandle;
    } else {
      // 기존 캔들 업데이트
      currentCandle.close = price;
      if (price > currentCandle.high) currentCandle.high = price;
      if (price < currentCandle.low) currentCandle.low = price;
      
      seriesRef.current.update(currentCandle);
    }
  }, [lastTick]);

  return (
    <div className="w-full h-full bg-slate-950">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default BitcoinChart;
