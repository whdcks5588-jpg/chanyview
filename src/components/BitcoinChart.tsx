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
  const prevPriceRef = useRef<number | null>(null);
  const countdownRef = useRef<string>('');
  const countdownOverlayRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number; alertId?: string } | null>(null);
  const [alerts, setAlerts] = useState<{ id: string; price: number; line: any }[]>([]);
  const alertsRef = useRef<{ id: string; price: number; line: any }[]>([]);

  // 로컬 스토리지에서 알람 저장/가져오기
  const saveAlerts = (updatedAlerts: { id: string; price: number }[]) => {
    localStorage.setItem(`btc_alerts_${interval}`, JSON.stringify(updatedAlerts));
  };

  const loadAlerts = () => {
    const key = `btc_alerts_${interval}`;
    const saved = localStorage.getItem(key);
    console.log(`Loading alerts for ${interval}:`, saved);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? (parsed as { id: string; price: number }[]) : [];
      } catch (e) {
        console.error('Failed to parse alerts', e);
      }
    }
    return [];
  };

  // 사운드 재생 함수
  const playAlertSound = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  };

  // 인터벌 문자열을 초 단위로 변환 변환
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

    // 마우스 이동 시 컨텍스트 메뉴 닫기 (선택 사항: 사용자가 차트를 클릭하거나 이동할 때 닫히게 함)
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);

    // 우클릭 이벤트 처리
    const container = chartContainerRef.current;
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!seriesRef.current || !chartRef.current) return;

      const rect = container?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const price = seriesRef.current.coordinateToPrice(y);
      if (price !== null) {
        // 클릭한 위치 근처에 기존 알람이 있는지 확인 (오차 범위 5px)
        const nearbyAlert = alertsRef.current.find(alert => {
          const alertY = seriesRef.current?.priceToCoordinate(alert.price);
          return alertY !== null && Math.abs(alertY - y) < 10;
        });

        setContextMenu({ 
          x, 
          y, 
          price, 
          alertId: nearbyAlert?.id 
        });
      }
    };

    container?.addEventListener('contextmenu', handleContextMenu);

    if (data.length > 0) {
      candlestickSeries.setData(data);
      currentCandleRef.current = { ...data[data.length - 1] };
    }
    
    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // 저장된 알람 불러와서 복구
    const savedAlerts = loadAlerts();
    if (savedAlerts.length > 0) {
      console.log(`Restoring ${savedAlerts.length} alerts for ${interval}`);
      const restoredAlerts = savedAlerts.map(saved => {
        const line = candlestickSeries.createPriceLine({
          price: saved.price,
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Alert',
          draggable: false,
        });
        return { ...saved, line };
      });
      alertsRef.current = restoredAlerts;
      setAlerts(restoredAlerts);
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !chartContainerRef.current) return;
      const { width, height: entryHeight } = entries[0].contentRect;
      chart.applyOptions({ width, height: entryHeight });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('click', handleGlobalClick);
      container?.removeEventListener('contextmenu', handleContextMenu);
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

    // 알람 체크 로직
    const triggeredAlerts = alertsRef.current.filter(alert => {
      if (prevPriceRef.current === null) return false;
      const prev = prevPriceRef.current;
      const curr = price;
      
      // 가격이 위로 돌파하거나 아래로 돌파할 때
      return (prev < alert.price && curr >= alert.price) || 
             (prev > alert.price && curr <= alert.price) ||
             (curr === alert.price); // 정확히 일치할 때
    });

    if (triggeredAlerts.length > 0) {
      triggeredAlerts.forEach(alert => {
        playAlertSound();
        if (alert.line && seriesRef.current) {
          seriesRef.current.removePriceLine(alert.line);
        }
        
        const message = `BTC 가격이 ${alert.price.toLocaleString()} USDT에 도달했습니다.`;
        if (Notification.permission === 'granted') {
          new Notification('🔔 가격 알람!', { body: message });
        }
        // 화면 중앙 알림 표시 (콘솔 대신 더 확실한 방법)
        const toast = document.createElement('div');
        toast.className = 'fixed top-10 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-slate-900 px-6 py-3 rounded-full font-bold shadow-2xl animate-bounce';
        toast.textContent = `🔔 ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      });
      
      // 발동된 알람 제거
      const remainingAlerts = alertsRef.current.filter(a => !triggeredAlerts.find(t => t.id === a.id));
      alertsRef.current = remainingAlerts;
      setAlerts(remainingAlerts);
      saveAlerts(remainingAlerts.map(a => ({ id: a.id, price: a.price })));
    }

    prevPriceRef.current = price;
  }, [lastTick, interval]);

  // 알람 추가 핸들러
  const handleAddAlert = (price: number) => {
    if (!seriesRef.current) return;

    // 수평선 추가
    const priceLine = seriesRef.current.createPriceLine({
      price: price,
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Alert',
      draggable: false, // 드래그 기능 삭제
    });

    const newAlert = { id: Date.now().toString(), price, line: priceLine };
    const updatedAlerts = [...alertsRef.current, newAlert];
    alertsRef.current = updatedAlerts;
    setAlerts(updatedAlerts);
    saveAlerts(updatedAlerts.map(a => ({ id: a.id, price: a.price })));

    // 메뉴 닫기
    setContextMenu(null);

    // 알림 권한 요청
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };

  // 알람 삭제 핸들러
  const handleDeleteAlert = (id: string) => {
    const alertToDelete = alertsRef.current.find(a => a.id === id);
    if (alertToDelete && seriesRef.current) {
      seriesRef.current.removePriceLine(alertToDelete.line);
      const updatedAlerts = alertsRef.current.filter(a => a.id !== id);
      alertsRef.current = updatedAlerts;
      setAlerts(updatedAlerts);
      saveAlerts(updatedAlerts.map(a => ({ id: a.id, price: a.price })));
      
      // 알람 삭제 후 메뉴 닫기
      setContextMenu(null);
    }
  };

  return (
    <div className="w-full h-full bg-slate-950 relative overflow-hidden group">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div 
          className="absolute z-[100] bg-slate-800 border border-slate-700 rounded shadow-xl py-1 min-w-[150px]"
          style={{ 
            left: `${contextMenu.x}px`, 
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.alertId ? (
            <button
              onClick={() => handleDeleteAlert(contextMenu.alertId!)}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 flex items-center gap-2 transition-colors"
            >
              <span className="font-bold text-lg">✕</span>
              <span>알람 삭제</span>
            </button>
          ) : (
            <button
              onClick={() => handleAddAlert(contextMenu.price)}
              className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-2 transition-colors"
            >
              <span className="text-amber-500 font-bold text-lg">+</span>
              <span>알람 추가 ({contextMenu.price.toLocaleString()})</span>
            </button>
          )}
        </div>
      )}

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
