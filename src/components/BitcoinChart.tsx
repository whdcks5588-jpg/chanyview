import React, { useEffect, useRef, useState } from 'react';
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
  const lastTickTimeRef = useRef<number>(0);
  const countdownRef = useRef<string>('');
  const countdownOverlayRef = useRef<HTMLDivElement>(null);

  // 인터벌 문자열을 초 단위로 변환
  const getIntervalInSeconds = (int: string): number => {
    const value = parseInt(int);
    if (int.endsWith('m')) return value * 60;
    if (int.endsWith('h')) return value * 3600;
    if (int.endsWith('d')) return value * 86400;
    return 60;
  };

  // 카운트다운 업데이트 로직 (Ref만 업데이트하여 차트 리렌더링 방지)
  useEffect(() => {
    const intervalSec = getIntervalInSeconds(interval);
    
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const nextCandleTime = Math.ceil(now / intervalSec) * intervalSec;
      const remaining = nextCandleTime - now;

      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      let timeStr = '';
      if (hours > 0) timeStr += `${hours}:`;
      timeStr += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      countdownRef.current = timeStr;

      // 우측 상단 카운트다운 실시간 업데이트
      if (countdownOverlayRef.current) {
        countdownOverlayRef.current.textContent = timeStr;
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [interval]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#0f172a' },
        horzLines: { color: '#0f172a' },
      },
      localization: {
        priceFormatter: (price: number) => {
          return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || (typeof height === 'number' ? height : 500),
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        alignLabels: true,
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
      priceLineVisible: true,
      priceLineSource: 1, // LastVisible
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

  // 실시간 틱 데이터 처리
  useEffect(() => {
    if (!seriesRef.current || !lastTick || !currentCandleRef.current || !chartRef.current) return;

    const { price, time } = lastTick;
    const currentCandle = currentCandleRef.current;
    
    // 현재 인터벌에 따른 새 캔들 여부 확인
    const candleInterval = getIntervalInSeconds(interval); 
    const candleStartTime = Math.floor(time / candleInterval) * candleInterval;

    if (candleStartTime > currentCandle.time) {
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
      currentCandle.close = price;
      if (price > currentCandle.high) currentCandle.high = price;
      if (price < currentCandle.low) currentCandle.low = price;
      
      seriesRef.current.update(currentCandle);
    }

    // 우측 상단 카운트다운 색상 업데이트
    if (countdownOverlayRef.current) {
      const isUp = price >= currentCandle.open;
      countdownOverlayRef.current.style.color = isUp ? '#22c55e' : '#ef4444';
    }
  }, [lastTick, interval]);

  return (
    <div className="w-full h-full bg-slate-950 relative overflow-hidden">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* 차트별 우측 상단 고정 카운트다운 표시 */}
      <div 
        ref={countdownOverlayRef}
        className="absolute right-[85px] top-[10px] z-50 pointer-events-none text-[18px] font-bold transition-colors duration-200"
        style={{ 
          fontFamily: "monospace",
          textShadow: '0 0 10px rgba(0,0,0,0.5)'
        }}
      >
      </div>
    </div>
  );
};

export default BitcoinChart;
