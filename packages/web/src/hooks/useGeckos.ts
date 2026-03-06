import { useEffect, useRef, useState, useCallback } from 'react';
import { geckos } from '@geckos.io/client';

// Price data types
export interface PriceData {
  symbol: string;
  priceBRL?: number;
  bid?: number;
  ask?: number;
  spread?: number;
  spreadPct?: number;
  source?: string;
  ts?: number;
}

export interface FeedMessage {
  type: 'tick' | 'ticks' | 'init' | 'prices' | 'sector_symbols';
  symbol?: string;
  items?: PriceData[];
  symbols?: PriceData[];
  sectorId?: string;
}

export interface GeckosState {
  connected: boolean;
}

export interface UseGeckosOptions {
  url?: string;
  port?: number;
  symbols: string[];
  onMessage?: (msg: FeedMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

export function useGeckos({
  url,
  port = 10208,
  symbols,
  onMessage,
  onConnect,
  onDisconnect,
  enabled = true
}: UseGeckosOptions) {
  const [state, setState] = useState<GeckosState>({ connected: false });
  
  const channelRef = useRef<any>(null);
  const mountedRef = useRef(false);
  
  useEffect(() => {
    if (!enabled) return;
    
    mountedRef.current = true;
    if (channelRef.current) return;
    if (typeof window === 'undefined') return;
    
    const connect = () => {
      try {
        const resolvedPort = Number.isFinite(Number(port)) ? Number(port) : 10208;
        // Geckos.io WebRTC client - connects to signaling server (HTTP) and then upgrades to WebRTC
        // Forçar 127.0.0.1 para evitar problemas com IPv6/localhost
        const channel = geckos({ 
          url: url || 'http://127.0.0.1', 
          port: resolvedPort 
        });
        
        channelRef.current = channel;
        console.log('[WebRTC] Channel created, waiting for connection...');
        
        channel.onConnect((err: any) => {
          if (err) {
            console.warn('[WebRTC] Connection error:', err);
            if (mountedRef.current) {
              setState(s => ({ ...s, connected: false }));
              onDisconnect?.();
            }
            return;
          }
          
          console.log('[WebRTC] Connected successfully!');
          if (mountedRef.current) {
            setState(s => ({ ...s, connected: true }));
            onConnect?.();
            
            // Envia lista de símbolos para o servidor
            if (symbols && symbols.length > 0) {
              channel.emit('set_symbols', { symbols: symbols.map(s => s.toUpperCase()) });
              console.log(`[WebRTC] Subscribed to ${symbols.length} symbols`);
            }
          }
        });
        
        channel.on('ticks', (data: any) => {
          if (!mountedRef.current) return;
          onMessage?.(data);
        });
        
        channel.on('prices', (data: any) => {
          if (!mountedRef.current) return;
          onMessage?.(data);
        });
        
        channel.on('init', (data: any) => {
          if (!mountedRef.current) return;
          onMessage?.(data);
        });
        
        channel.onDisconnect(() => {
          console.log('[WebRTC] Disconnected');
          if (mountedRef.current) {
            setState(s => ({ ...s, connected: false }));
            onDisconnect?.();
          }
        });
        
      } catch (err) {
        console.warn('[WebRTC] Error:', err);
      }
    };
    
    connect();
    
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, port, url, onConnect, onDisconnect, onMessage]);
  
  // Re-enviar set_symbols quando a lista de símbolos mudar (após conexão estabelecida)
  const symbolsKey = symbols ? symbols.slice().sort().join(',') : '';
  const prevSymbolsKeyRef = useRef<string>('');
  
  useEffect(() => {
    if (!enabled) return;
    if (!symbolsKey) return;
    const channel = channelRef.current;
    if (!channel) return;
    if (!state.connected) return;
    
    // Só re-enviar se a lista realmente mudou
    if (symbolsKey === prevSymbolsKeyRef.current) return;
    prevSymbolsKeyRef.current = symbolsKey;
    
    channel.emit('set_symbols', { symbols: symbols.map(s => s.toUpperCase()) });
    console.log(`[WebRTC] Updated subscription to ${symbols.length} symbols`);
  }, [enabled, symbolsKey, state.connected, symbols]);
  
  return {
    ...state,
    disconnect: () => {
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    }
  };
}

// Fallback to WebSocket if Geckos not available
export function useGeckosFallback(options: UseGeckosOptions) {
  // Desabilitado conforme solicitado pelo usuário (quer apenas geckos streaming)
  return {
    connected: false,
    subscribeSymbols: (syms: string[]) => {},
    disconnect: () => {}
  };
}
