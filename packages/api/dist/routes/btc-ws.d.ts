import type { FastifyInstance } from 'fastify';
type BtcCandle = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
};
type MercadoBitcoinCandlesClient = {
    getBtcBrlTicker?: () => Promise<{
        priceBRL: number;
    }>;
    getBtcBrlCandles(params: {
        fromSec: number;
        toSec: number;
        resolution: string;
    }): Promise<BtcCandle[]>;
};
export interface BtcWsDeps {
    brokers: string[];
    mercadoBitcoin: MercadoBitcoinCandlesClient;
}
export declare function btcWsRoutes(app: FastifyInstance, opts: BtcWsDeps): Promise<void>;
export {};
//# sourceMappingURL=btc-ws.d.ts.map