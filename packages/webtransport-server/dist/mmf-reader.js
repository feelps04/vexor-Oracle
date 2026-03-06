/**
 * Leitor de Memória Compartilhada (MMF) do MT5
 *
 * Lê diretamente de Local\B3RAM (Genial) e Local\GLOBALRAM (Pepperstone)
 * Layout idêntico ao Sentinel_RAM_v520.mq5 e SentinelEuropa_RAM_v100.mq5
 */
import koffi from 'koffi';
// Layout da memória (offsets em bytes)
const LAYOUT = {
    BID_OFF: 0, // double (8 bytes)
    ASK_OFF: 8, // double (8 bytes)
    VOL_OFF: 16, // int64 (8 bytes)
    TS_OFF: 24, // int64 (8 bytes)
    ANO_OFF: 32, // int32 (4 bytes)
    HB_OFF: 36, // int32 (4 bytes)
    WF_OFF: 40, // int32 (4 bytes) - write flag
    SYM_OFF: 44, // char[16] (16 bytes)
    RECORD_BYTES: 128
};
// Carregar kernel32.dll
const kernel32 = koffi.load('kernel32.dll');
// Funções do Windows API
const OpenFileMappingW = kernel32.func('long OpenFileMappingW(uint, bool, string)');
const MapViewOfFile = kernel32.func('long MapViewOfFile(long, uint, uint, uint, ulong)');
const UnmapViewOfFile = kernel32.func('bool UnmapViewOfFile(long)');
const CloseHandle = kernel32.func('bool CloseHandle(long)');
// Classe para ler MMF
export class MMFReader {
    hMap = 0n;
    pBase = 0n;
    recordCount;
    source;
    name;
    constructor(name, recordCount, source) {
        this.name = name;
        this.recordCount = recordCount;
        this.source = source;
    }
    connect() {
        try {
            // FILE_MAP_READ = 0x0004
            this.hMap = BigInt(OpenFileMappingW(0x0004, false, this.name));
            if (this.hMap === 0n) {
                console.error(`[MMF] Erro ao abrir ${this.name}: handle = 0`);
                return false;
            }
            // FILE_MAP_READ = 0x0004
            const totalBytes = this.recordCount * LAYOUT.RECORD_BYTES;
            this.pBase = BigInt(MapViewOfFile(Number(this.hMap), 0x0004, 0, 0, BigInt(totalBytes)));
            if (this.pBase === 0n) {
                console.error(`[MMF] Erro ao mapear ${this.name}`);
                CloseHandle(Number(this.hMap));
                this.hMap = 0n;
                return false;
            }
            console.log(`[MMF] Conectado a ${this.name} (${this.recordCount} slots)`);
            return true;
        }
        catch (err) {
            console.error(`[MMF] Erro ao conectar ${this.name}:`, err);
            return false;
        }
    }
    disconnect() {
        if (this.pBase !== 0n) {
            UnmapViewOfFile(Number(this.pBase));
            this.pBase = 0n;
        }
        if (this.hMap !== 0n) {
            CloseHandle(Number(this.hMap));
            this.hMap = 0n;
        }
    }
    /**
     * Lê um slot específico da memória
     * Usa Buffer para ler os dados diretamente do ponteiro
     */
    readSlot(slot) {
        if (this.pBase === 0n || slot < 0 || slot >= this.recordCount) {
            return null;
        }
        try {
            const offset = Number(this.pBase) + (slot * LAYOUT.RECORD_BYTES);
            const buf = Buffer.from({ length: LAYOUT.RECORD_BYTES });
            // Copia da memória para o buffer
            // Nota: em Node.js, não podemos ler diretamente de um ponteiro de memória
            // Precisamos usar um método alternativo
            // Por enquanto, retornamos null - isso requer implementação com addon nativo
            return null;
        }
        catch {
            return null;
        }
    }
    /**
     * Lê todos os slots e retorna ticks válidos
     */
    readAllSlots() {
        // Implementação requer addon nativo C++
        return [];
    }
    isConnected() {
        return this.pBase !== 0n;
    }
    getSource() {
        return this.source;
    }
}
// Instâncias globais
let b3Reader = null;
let globalReader = null;
export function initMMFReaders() {
    // B3RAM - Genial (8192 slots)
    b3Reader = new MMFReader('Local\\B3RAM', 8192, 'b3');
    b3Reader.connect();
    // GLOBALRAM - Pepperstone (16384 slots)
    globalReader = new MMFReader('Local\\GLOBALRAM', 16384, 'global');
    globalReader.connect();
}
export function closeMMFReaders() {
    b3Reader?.disconnect();
    globalReader?.disconnect();
    b3Reader = null;
    globalReader = null;
}
export function getB3Reader() {
    return b3Reader;
}
export function getGlobalReader() {
    return globalReader;
}
