export interface BtcTickerResult {
    /** BTC price in BRL (float). */
    priceBRL: number;
    /** Raw last price string. */
    last: string;
}
export interface BtcCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
export declare class MercadoBitcoinClient {
    private readonly httpsAgent;
    getBtcBrlTicker(): Promise<BtcTickerResult>;
    getBtcBrlCandles(params: {
        fromSec: number;
        toSec: number;
        resolution: string;
    }): Promise<BtcCandle[]>;
    private withRetry;
}
//# sourceMappingURL=mercado-bitcoin-client.d.ts.map