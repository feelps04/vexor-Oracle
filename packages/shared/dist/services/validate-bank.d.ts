export interface BankInfo {
    ispb: string;
    name: string;
    code: number;
    fullName?: string;
}
export declare function validateBankCode(bankCode: string): Promise<BankInfo>;
//# sourceMappingURL=validate-bank.d.ts.map