export interface StockQuoteResult {
    /** Current price in BRL. */
    priceBRL: number;
    symbol: string;
}
export interface BrapiClientConfig {
    /** Optional. For test symbols (PETR4, VALE3, MGLU3, ITUB4) no token needed. */
    token?: string;
}
export declare class BrapiClient {
    private readonly config;
    constructor(config?: BrapiClientConfig);
    /**
     * Fetch current quote for a stock symbol (e.g. PETR4, VALE3).
     * Token optional for the 4 free test symbols.
     */
    getQuote(symbol: string): Promise<StockQuoteResult>;
}
//# sourceMappingURL=brapi-client.d.ts.map