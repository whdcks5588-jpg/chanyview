import axios from 'axios';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const fetchBitcoinData = async (interval: string = '1h'): Promise<Candle[]> => {
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol: 'BTCUSDT',
        interval,
        limit: 500,
      },
    });

    return response.data.map((d: any) => ({
      time: d[0] / 1000, // Convert to seconds
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
    }));
  } catch (error) {
    console.error('Error fetching Bitcoin data:', error);
    return [];
  }
};

export const subscribeBTCTicks = (onTick: (price: number, time: number) => void) => {
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@aggTrade`);

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // p: price, E: event time
    onTick(parseFloat(message.p), message.E / 1000);
  };

  return () => {
    ws.close();
  };
};
