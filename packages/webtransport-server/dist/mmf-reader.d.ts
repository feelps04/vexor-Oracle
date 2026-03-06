/**
 * Leitor de Memória Compartilhada (MMF) do MT5
 *
 * Lê diretamente de Local\B3RAM (Genial) e Local\GLOBALRAM (Pepperstone)
 * Layout idêntico ao Sentinel_RAM_v520.mq5 e SentinelEuropa_RAM_v100.mq5
 */
export interface MMFTick {
    symbol: string;
    bid: number;
    ask: number;
    volume: bigint;
    timestamp: bigint;
    anomaly: number;
    heartbeat: number;
    source: 'b3' | 'global';
}
export declare class MMFReader {
    private hMap;
    private pBase;
    private recordCount;
    private source;
    private name;
    constructor(name: string, recordCount: number, source: 'b3' | 'global');
    connect(): boolean;
    disconnect(): void;
    /**
     * Lê um slot específico da memória
     * Usa Buffer para ler os dados diretamente do ponteiro
     */
    readSlot(slot: number): MMFTick | null;
    /**
     * Lê todos os slots e retorna ticks válidos
     */
    readAllSlots(): MMFTick[];
    isConnected(): boolean;
    getSource(): 'b3' | 'global';
}
export declare function initMMFReaders(): void;
export declare function closeMMFReaders(): void;
export declare function getB3Reader(): MMFReader | null;
export declare function getGlobalReader(): MMFReader | null;
