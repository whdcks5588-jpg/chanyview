import { useEffect, useState } from 'react';
import { fetchBitcoinData, subscribeBTCTicks, type Candle } from './api/binance';
import BitcoinChart from './components/BitcoinChart';

function App() {
  const [data3m, setData3m] = useState<Candle[]>([]);
  const [data1h, setData1h] = useState<Candle[]>([]);
  const [data4h, setData4h] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastTick, setLastTick] = useState<{ price: number; time: number } | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeTicks: (() => void) | undefined;

    const init = async () => {
      setLoading(true);
      const [d3m, d1h, d4h] = await Promise.all([
        fetchBitcoinData('3m'),
        fetchBitcoinData('1h'),
        fetchBitcoinData('4h'),
      ]);

      if (isMounted) {
        setData3m(d3m);
        setData1h(d1h);
        setData4h(d4h);
        setLoading(false);

        // 틱 데이터(AggTrade) 구독 시작 (모든 차트에서 공통 사용)
        unsubscribeTicks = subscribeBTCTicks((price, time) => {
          if (isMounted) {
            setLastTick({ price, time });
          }
        });
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribeTicks) unsubscribeTicks();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xl font-medium">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 overflow-hidden flex flex-row">
      {/* 왼쪽: 3분봉 (메인) */}
      <div className="flex-1 relative border-r border-slate-800">
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h2 className="text-lg font-bold text-slate-200 bg-slate-900/50 px-2 py-1 rounded">BTC/USDT 3m</h2>
          {lastTick && (
            <div className="text-2xl font-mono font-bold text-green-400 mt-1 drop-shadow-lg">
              ${lastTick.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
        <BitcoinChart data={data3m} lastTick={lastTick} interval="3m" height="100%" />
      </div>

      {/* 오른쪽: 1시간봉, 4시간봉 (사이드) */}
      <div className="w-1/3 flex flex-col">
        <div className="flex-1 relative border-b border-slate-800">
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <h2 className="text-sm font-bold text-slate-300 bg-slate-900/50 px-2 py-0.5 rounded">BTC/USDT 1h</h2>
          </div>
          <BitcoinChart data={data1h} lastTick={lastTick} interval="1h" height="100%" />
        </div>
        <div className="flex-1 relative">
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <h2 className="text-sm font-bold text-slate-300 bg-slate-900/50 px-2 py-0.5 rounded">BTC/USDT 4h</h2>
          </div>
          <BitcoinChart data={data4h} lastTick={lastTick} interval="4h" height="100%" />
        </div>
      </div>
    </div>
  );
}

export default App;
