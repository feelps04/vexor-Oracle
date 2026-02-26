export declare class CurrencyConverter {
    convertToBRL(amount: number, currency: string): Promise<number>;
    /** Returns { amountBRL, rate }. */
    convertToBRLWithRate(amount: number, currency: string): Promise<{
        amountBRL: number;
        rate: number;
    }>;
}
//# sourceMappingURL=currency-converter.d.ts.map