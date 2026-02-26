export type TwelveDataFxInterval = '1m' | '5m' | '15m' | '1h' | '1d';
export interface TwelveDataCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}
export declare class TwelveDataClient {
    private readonly apiKey?;
    constructor(apiKey?: string);
    isEnabled(): boolean;
    getFxRate(pair: string): Promise<number>;
    getFxCandles(params: {
        pair: string;
        interval: TwelveDataFxInterval;
        outputsize: number;
    }): Promise<TwelveDataCandle[]>;
}
//# sourceMappingURL=twelve-data-client.d.ts.map