import { Buffer } from 'node:buffer';
export type MmfConfig = {
    name: string;
    recordBytes: number;
    recordCount: number;
    bidOffset: number;
    askOffset: number;
    volumeOffset: number;
    timeOffset: number;
    hbOffset: number;
    wfOffset: number;
    symbolOffset: number;
    symbolBytes: number;
};
export type MmfView = {
    handle: Buffer;
    view: Buffer;
};
export declare function openMmfWithConfig(cfg: MmfConfig): MmfView;
export declare function openMmf(): MmfView;
export declare function closeMmf(mmf: MmfView | null | undefined): void;
export type MmfRecord = {
    symbol: string;
    bid: number;
    ask: number;
    volume: number;
    ts: number;
    hb: number;
};
export declare function readAllRecordsWithConfig(view: Buffer, cfg: MmfConfig): MmfRecord[];
export declare function readAllRecords(view: Buffer): MmfRecord[];
//# sourceMappingURL=mmf.d.ts.map