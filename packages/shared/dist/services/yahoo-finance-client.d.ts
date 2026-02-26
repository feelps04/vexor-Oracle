export type YahooFxInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1h' | '1d';
export interface YahooFxCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
export declare class YahooFinanceClient {
    getFxCandles(params: {
        pair: string;
        interval: YahooFxInterval;
        range: string;
    }): Promise<YahooFxCandle[]>;
    getFxRate(pair: string): Promise<number>;
}
//# sourceMappingURL=yahoo-finance-client.d.ts.map