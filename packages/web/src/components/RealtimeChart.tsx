import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickData, UTCTimestamp, IChartApi, ISeriesApi } from 'lightweight-charts';

interface RealtimeChartProps {
  symbol: string;
  currentPrice: number | null;
  onCrosshairMove?: (data: { price: number; time: string } | null) => void;
}

// Tipos de mercado
export type MarketType = 'brazil' | 'usa' | 'crypto' | 'forex' | 'unknown';

// Detectar tipo de mercado baseado no símbolo
const detectMarketType = (symbol: string): MarketType => {
  const sym = symbol.toUpperCase();
  
  // Cripto - BTC, ETH, SOL, etc.
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|DOT|LINK|LTC|AVAX|ATOM|AXS|ALGO|BCH|UNI|NEAR|APT|ARB|OP|INJ|FIL|IMX|SEI|SUI|MATIC|AAVE|GRT|SNX|YFI|COMP|MKR|CRV|1INCH|SUSHI|CAKE|PancakeSwap)/.test(sym) ||
      sym.includes('BTC') || sym.includes('ETH') || sym.includes('CRYPTO') || sym.includes('USDT') || sym.includes('USDC')) {
    return 'crypto';
  }
  
  // Forex - pares de moedas
  if (/^(USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD|BRL)(USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD|BRL)$/.test(sym) ||
      sym.includes('USD') && sym.includes('BRL') ||
      /^(EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD|EURBRL|USDBRL|GBPBRL|AUDBRL|CADBRL|CHFBRL)$/.test(sym) ||
      sym.includes('FOREX') || sym.includes('MOEDAS')) {
    return 'forex';
  }
  
  // EUA - NYSE/NASDAQ (símbolos sem número no final, BDRs com 34)
  if (/^(AAPL|MSFT|GOOGL|AMZN|META|NVDA|TSLA|AMD|INTC|NFLX|DIS|BA|CAT|KO|PEP|MCD|WMT|JPM|V|MA|HD|NKE|PG|JNJ|UNH|CRM|ORCL|ADBE|ABNB|AIRBNB|PYPL|SQ|SNOW|PLTR|COIN|ROKU|ZM|DOCU|OKTA|CRWD|ZS|FSLR|ENPH|SEDG|TSM|ASML|SHOP|SQ|BILL|DDOG|MNDY|TTD|RIVN|LCID|MRVL|AVGO|QCOM|TXN|AMAT|LRCX|KLAC|ADI|INTU|NOW|TEAM|WDAY|VEEV|ZEN|DOX|PAYX|CTSH|EXEL|SWKS|MPWR|ON|AXON|FICO|GLOB|EPAM|TYL|MANH|ENTG|TTWO|EA|RBLX|TTD|APP|DUOL|SOUN|PLTR|SOFI|UPST|LCID|PSNY|RKLB|SPCE|ASTR|RDW|TWO|IO|PL|RKLB|ASTS|IONQ|QBTS|RGTI|WKEY|LUNR|FLDR|BBAI|INSM|PROV|HROW|NUVL|NRBO|ONCO|CYCC|INFI|SINT|VXRT|IBIO|HTGM|ADMP|CYDY|TNXP|MTP|TOPS|SHIP|DKNG|PENN|CZR|MGM|LVS|WYNN|BYD|CZR|ERI|PNK|SGMS|IGT|Lotto|CSGP|CUBE|EXR|ESS|UDR|EQR|AVB|CPT|MAA|SSNC|PAYC|ANET|PANW|FTNT|CYBR|SPLK|FROG|ESTC|ZS|CRWD|OKTA|SAIL|VRNS|RPD|NLOK|MNDY|PCOR|TTD|DDOG|SNOW|NET|FAST|TWLO|DOCU|ZM|CFLT|SOFI|UPST|AFRM|LCID|PSNY|RIVN|MRK|PFE|ABT|JNJ|LLY|UNH|CVS|ANTM|CI|HUM|CNC|MOH|WCG|THC|HCA|UHS|DVA|ENSG|KND|FMS|PINC|DGX|LH|BRLI|QDEL|TECH|GH|NTRA|TWST|CDXS|CDNA|EXAS|LOGM|NVS|ROG|TECH|VIVO|AEM|ABX|GFI|HL|PAAS|SSRM|SAND|WPM|OR|CLF|AKS|MT|X|NUE|STLD|CMC|RS|ATI|MP|NEWM|STLD|ZIM|MATX|SBLK|DAC|GNK|EGLE|NM|NMM|SHIP|SBLK|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC|SBLK|NMM|NM|EGLE|MATX|GNK|SHIP|ZIM|DAC)/.test(sym)) {
    return 'usa';
  }
  
  // Brasil - B3 (símbolos com número no final: PETR4, VALE3, ABEV3, etc.)
  if (/[34]$/.test(sym) || // Ações brasileiras terminam em 3 (ON) ou 4 (PN)
      sym.includes('FII') || sym.endsWith('11') || // FIIs terminam em 11
      sym.includes('ETF') || sym.endsWith('11') || // ETFs
      sym === 'IBOV' || sym === 'WIN' || sym === 'WDO' || // Índices e futuros brasileiros
      sym.includes('BOVA') || sym.includes('BOVB') || sym.includes('BOVV') || sym.includes('BOVX') ||
      sym.includes('SMAL') || sym.includes('SMAL')) {
    return 'brazil';
  }
  
  // Padrão para ações brasileiras (letras + número 3 ou 4)
  if (/^[A-Z]{2,5}[34]$/.test(sym)) {
    return 'brazil';
  }
  
  // BDRs (terminam com 34, 32, etc.)
  if (/34$|32$|33$|35$/.test(sym)) {
    return 'usa';
  }
  
  return 'unknown';
};

interface TooltipData {
  time: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  x: number;
  y: number;
}

interface OHLCVBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function RealtimeChart({ symbol, currentPrice, onCrosshairMove }: RealtimeChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState<'1' | '5' | '15' | '60' | 'D' | 'W'>('5');
  const candlesRef = useRef<CandlestickData[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const initializedRef = useRef<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataCount, setDataCount] = useState(0);

  // Mapear timeframe para formato MT5
  const getMT5Timeframe = (tf: string): string => {
    const map: Record<string, string> = {
      '1': 'M1',
      '5': 'M5',
      '15': 'M15',
      '60': 'H1',
      'D': 'D1',
      'W': 'W1',
    };
    return map[tf] || 'M5';
  };

  // Buscar dados históricos reais da API
  const fetchHistoricalData = useCallback(async (sym: string, tf: string, count: number = 500): Promise<OHLCVBar[] | null> => {
    try {
      const market = detectMarketType(sym);
      const broker = (market === 'usa' || sym.toUpperCase().endsWith('.US')) ? 'pepperstone' : 'mt5';
      const response = await fetch('/python-api/ohlcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          timeframe: getMT5Timeframe(tf),
          count: count,
          broker,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      
      return result.data || null;
    } catch (err) {
      console.error('[Chart] Erro ao buscar OHLCV:', err);
      throw err;
    }
  }, []);

  // Inicializar gráfico - apenas uma vez
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 350,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(0, 255, 200, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#00ffc8',
        },
        horzLine: {
          color: 'rgba(0, 255, 200, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#00ffc8',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + 
                 date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        },
      },
      handleScroll: {
        vertTouchDrag: true,
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Configurar timeScale para candles inteiros e visíveis
    // barSpacing maior = candles mais largos
    chart.timeScale().applyOptions({
      fixLeftEdge: false,
      fixRightEdge: false,
      lockVisibleTimeRangeOnResize: true,
      rightOffset: 0,
      barSpacing: 20,
      minBarSpacing: 3,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Crosshair move callback - atualiza tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.point) {
        setTooltip(null);
        onCrosshairMove?.(null);
        return;
      }
      
      let data: CandlestickData | undefined;
      let candleTime: number | undefined;
      
      if (param.seriesData && param.seriesData.size > 0) {
        data = param.seriesData.get(series) as CandlestickData | undefined;
        if (!data) {
          param.seriesData.forEach((value) => {
            if (!data && 'open' in value) {
              data = value as CandlestickData;
            }
          });
        }
        if (param.time !== undefined) {
          candleTime = param.time as number;
        } else if (data?.time !== undefined) {
          candleTime = data.time as number;
        }
      }
      
      // Fallback: encontrar candle pela posição X
      if (!data && candlesRef.current.length > 0) {
        const candles = candlesRef.current;
        const lastCandle = candles[candles.length - 1];
        const firstCandle = candles[0];
        
        const startTime = firstCandle.time as number;
        const endTime = lastCandle.time as number;
        const chartWidth = chartContainerRef.current?.clientWidth || 800;
        
        const estimatedTime = startTime + (param.point.x / chartWidth) * (endTime - startTime);
        
        let closestCandle = candles[0];
        let minDiff = Math.abs((closestCandle.time as number) - estimatedTime);
        
        for (const candle of candles) {
          const diff = Math.abs((candle.time as number) - estimatedTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestCandle = candle;
          }
        }
        
        data = closestCandle;
        candleTime = closestCandle.time as number;
      }
      
      if (data && candleTime !== undefined) {
        const date = new Date(candleTime * 1000);
        const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        setTooltip({
          time: timeStr,
          date: dateStr,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          x: param.point.x,
          y: param.point.y,
        });
        
        onCrosshairMove?.({
          price: data.close,
          time: timeStr,
        });
      } else {
        setTooltip(null);
        onCrosshairMove?.(null);
      }
    });

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      initializedRef.current = '';
    };
  }, []);

  // Buscar candles reais quando símbolo OU timeframe mudar
  useEffect(() => {
    if (!seriesRef.current || !symbol) return;
    
    setLoading(true);
    setError(null);
    
    // Limpar dados anteriores e resetar gráfico
    seriesRef.current.setData([]);
    candlesRef.current = [];
    setDataCount(0);
    
    // Buscar mais dados para zoom out (500 candles)
    fetchHistoricalData(symbol, timeframe, 500).then((data) => {
      if (!data || data.length === 0) {
        setError('Sem dados históricos para este ativo');
        setLoading(false);
        return;
      }
      
      const candles: CandlestickData[] = data.map((bar) => {
        const date = new Date(bar.time);
        const timestamp = Math.floor(date.getTime() / 1000) as UTCTimestamp;
        
        return {
          time: timestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        };
      });
      
      // Ordenar por tempo ascendente
      candles.sort((a, b) => (a.time as number) - (b.time as number));
      
      candlesRef.current = candles;
      seriesRef.current!.setData(candles);
      setDataCount(candles.length);
      setLoading(false);
      
      // Ajustar visão para mostrar todos os dados com escala correta
      chartRef.current?.timeScale().fitContent();
      
      // Reaplicar configurações de candle para garantir visualização consistente
      chartRef.current?.timeScale().applyOptions({
        barSpacing: 20,
        minBarSpacing: 3,
      });
    }).catch((err) => {
      setError(`Erro: ${err.message}`);
      setLoading(false);
    });
  }, [symbol, timeframe, fetchHistoricalData]);

  // Atualizar com preço em tempo real
  useEffect(() => {
    if (!seriesRef.current || !currentPrice || candlesRef.current.length === 0) return;
    
    const now = Math.floor(Date.now() / 1000);
    const tfMinutes = timeframe === 'D' ? 1440 : timeframe === 'W' ? 10080 : parseInt(timeframe);
    const tfSeconds = tfMinutes * 60;
    const alignedNow = Math.floor(now / tfSeconds) * tfSeconds;
    
    if (now - lastUpdateRef.current < 0.5) return;
    lastUpdateRef.current = now;
    
    const candles = candlesRef.current;
    const lastCandle = candles[candles.length - 1];
    
    const lastTime = Number(lastCandle.time);
    if (lastCandle && lastTime === alignedNow) {
      const updatedCandle: CandlestickData = { 
        time: lastTime as UTCTimestamp,
        open: lastCandle.open,
        close: currentPrice, 
        high: Math.max(lastCandle.high, currentPrice), 
        low: Math.min(lastCandle.low, currentPrice) 
      };
      candles[candles.length - 1] = updatedCandle;
      seriesRef.current.update(updatedCandle);
    } else if (lastCandle && lastTime < alignedNow) {
      const newCandle: CandlestickData = { 
        time: alignedNow as UTCTimestamp, 
        open: lastCandle.close, 
        high: currentPrice, 
        low: currentPrice, 
        close: currentPrice 
      };
      candles.push(newCandle);
      if (candles.length > 600) candles.shift();
      candlesRef.current = candles;
      seriesRef.current.update(newCandle);
    }
  }, [currentPrice, timeframe]);

  // Zoom controls
  const handleZoomIn = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const center = ((visibleRange.from as number) + (visibleRange.to as number)) / 2;
        const range = ((visibleRange.to as number) - (visibleRange.from as number)) / 3;
        timeScale.setVisibleRange({ from: (center - range) as UTCTimestamp, to: (center + range) as UTCTimestamp });
      }
    }
  };

  const handleZoomOut = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const center = ((visibleRange.from as number) + (visibleRange.to as number)) / 2;
        const range = ((visibleRange.to as number) - (visibleRange.from as number)) * 1.5;
        timeScale.setVisibleRange({ from: (center - range) as UTCTimestamp, to: (center + range) as UTCTimestamp });
      }
    }
  };

  const handleFitContent = () => {
    chartRef.current?.timeScale().fitContent();
  };

  // Verificar se está em horário de negociação baseado no tipo de mercado
  const getTradingStatus = (marketType: MarketType): { isOpen: boolean; label: string; nextOpen?: string } => {
    const now = new Date();
    const day = now.getDay(); // 0 = domingo, 6 = sábado
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    switch (marketType) {
      case 'crypto': {
        // Cripto: 24/7, sempre aberto
        return { isOpen: true, label: 'MERCADO CRIPTO 24/7' };
      }
      
      case 'forex': {
        // Forex: Abre domingo 18:00 (EST) e fecha sexta 17:00 (EST)
        // Em horário de Brasília: domingo 20:00 a sexta 19:00
        if (day === 0) { // Domingo
          if (time >= 20 * 60) return { isOpen: true, label: 'FOREX ABERTO' };
          return { isOpen: false, label: 'FOREX FECHADO', nextOpen: '20:00' };
        }
        if (day === 5) { // Sexta
          if (time < 19 * 60) return { isOpen: true, label: 'FOREX ABERTO' };
          return { isOpen: false, label: 'FOREX FECHADO', nextOpen: 'Dom 20:00' };
        }
        if (day === 6) { // Sábado
          return { isOpen: false, label: 'FOREX FECHADO', nextOpen: 'Dom 20:00' };
        }
        // Segunda a quinta
        return { isOpen: true, label: 'FOREX ABERTO' };
      }
      
      case 'usa': {
        // NYSE/NASDAQ: 9:30-16:00 EST (11:30-18:00 Brasília)
        // Segunda a sexta
        if (day === 0 || day === 6) {
          return { isOpen: false, label: 'MERCADO EUA FECHADO', nextOpen: 'Seg 11:30' };
        }
        const start = 11 * 60 + 30; // 11:30 Brasília
        const end = 18 * 60; // 18:00 Brasília
        if (time >= start && time <= end) {
          return { isOpen: true, label: 'NYSE/NASDAQ ABERTO' };
        }
        if (time < start) {
          return { isOpen: false, label: 'MERCADO EUA FECHADO', nextOpen: '11:30' };
        }
        return { isOpen: false, label: 'MERCADO EUA FECHADO', nextOpen: 'Amanhã 11:30' };
      }
      
      case 'brazil':
      default: {
        // B3: 10:00-17:55 Brasília, segunda a sexta
        if (day === 0 || day === 6) {
          return { isOpen: false, label: 'B3 FECHADO', nextOpen: 'Seg 10:00' };
        }
        const start = 10 * 60; // 10:00
        const end = 17 * 60 + 55; // 17:55
        if (time >= start && time <= end) {
          return { isOpen: true, label: 'B3 ABERTO' };
        }
        if (time < start) {
          return { isOpen: false, label: 'B3 FECHADO', nextOpen: '10:00' };
        }
        return { isOpen: false, label: 'B3 FECHADO', nextOpen: 'Amanhã 10:00' };
      }
    }
  };

  const [marketType, setMarketType] = useState<MarketType>('brazil');
  const [tradingStatus, setTradingStatus] = useState({ isOpen: false, label: 'B3 FECHADO' });

  // Detectar tipo de mercado quando símbolo muda
  useEffect(() => {
    const type = detectMarketType(symbol);
    setMarketType(type);
    setTradingStatus(getTradingStatus(type));
  }, [symbol]);

  // Atualizar status de negociação a cada minuto
  useEffect(() => {
    const timer = setInterval(() => {
      setTradingStatus(getTradingStatus(marketType));
    }, 60000);
    return () => clearInterval(timer);
  }, [marketType]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {/* Trading status indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          padding: '4px 8px',
          background: tradingStatus.isOpen ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderRadius: 4,
          border: `1px solid ${tradingStatus.isOpen ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          <div style={{ 
            width: 6, 
            height: 6, 
            borderRadius: '50%', 
            background: tradingStatus.isOpen ? '#22c55e' : '#ef4444',
            animation: tradingStatus.isOpen ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ 
            fontSize: '10px', 
            color: tradingStatus.isOpen ? '#22c55e' : '#ef4444',
            fontWeight: 'bold',
          }}>
            {tradingStatus.label}
          </span>
        </div>
        
        {/* Timeframes */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['1', '5', '15', '60', 'D', 'W'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '4px 10px',
                background: timeframe === tf ? 'rgba(0, 255, 200, 0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${timeframe === tf ? 'rgba(0, 255, 200, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4,
                color: timeframe === tf ? '#00ffc8' : '#94a3b8',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: timeframe === tf ? 'bold' : 'normal',
              }}
            >
              {tf === 'D' ? '1D' : tf === 'W' ? '1W' : `${tf}m`}
            </button>
          ))}
        </div>
        
        {/* Zoom controls */}
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            +
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            −
          </button>
          <button
            onClick={handleFitContent}
            title="Ajustar"
            style={{
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '10px',
            }}
          >
            ⟲
          </button>
        </div>
      </div>
      
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
        <span>{loading ? '⏳ Carregando...' : error ? `❌ ${error}` : `📊 ${dataCount} candles`}</span>
        <span>🖱️ Arraste para navegar • Scroll para zoom</span>
      </div>
      
      {/* Loading overlay */}
      {loading && (
        <div style={{ 
          position: 'absolute', 
          top: 60, 
          left: '50%', 
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          padding: '8px 16px',
          borderRadius: 4,
          color: '#00ffc8',
          fontSize: '12px',
          zIndex: 10,
        }}>
          Carregando dados de {symbol}...
        </div>
      )}
      
      {/* Error overlay */}
      {error && !loading && (
        <div style={{ 
          position: 'absolute', 
          top: 60, 
          left: '50%', 
          transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.2)',
          padding: '8px 16px',
          borderRadius: 4,
          color: '#f87171',
          fontSize: '12px',
          zIndex: 10,
        }}>
          {error}
        </div>
      )}
      
      {/* Chart container */}
      <div ref={chartContainerRef} style={{ borderRadius: 4, minHeight: 350 }} />
      
      {/* OHLC Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 15, (chartContainerRef.current?.clientWidth || 400) - 180),
            top: Math.max(tooltip.y - 100, 80),
            background: 'rgba(10, 15, 25, 0.95)',
            border: '1px solid rgba(0, 255, 200, 0.4)',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: '12px',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Header com data e preço atual */}
          <div style={{ 
            color: '#00ffc8', 
            fontWeight: 'bold', 
            marginBottom: 8, 
            fontSize: '13px',
            borderBottom: '1px solid rgba(0, 255, 200, 0.2)',
            paddingBottom: 6,
          }}>
            {tooltip.date} {tooltip.time}
          </div>
          
          {/* Preço atual destacado */}
          <div style={{ 
            fontSize: '18px', 
            fontWeight: 'bold', 
            color: tooltip.close >= tooltip.open ? '#22c55e' : '#ef4444',
            marginBottom: 8,
          }}>
            R$ {tooltip.close.toFixed(2)}
          </div>
          
          {/* OHLC Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr', gap: '3px 12px', fontSize: '11px' }}>
            <span style={{ color: '#64748b' }}>Open:</span>
            <span style={{ color: '#e2e8f0', textAlign: 'right' }}>R$ {tooltip.open.toFixed(2)}</span>
            <span style={{ color: '#64748b' }}>High:</span>
            <span style={{ color: '#22c55e', textAlign: 'right' }}>R$ {tooltip.high.toFixed(2)}</span>
            <span style={{ color: '#64748b' }}>Low:</span>
            <span style={{ color: '#ef4444', textAlign: 'right' }}>R$ {tooltip.low.toFixed(2)}</span>
            <span style={{ color: '#64748b' }}>Close:</span>
            <span style={{ 
              color: tooltip.close >= tooltip.open ? '#22c55e' : '#ef4444', 
              fontWeight: 'bold',
              textAlign: 'right' 
            }}>
              R$ {tooltip.close.toFixed(2)}
            </span>
          </div>
          
          {/* Variação */}
          <div style={{ 
            marginTop: 6, 
            paddingTop: 6, 
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: '10px',
            color: tooltip.close >= tooltip.open ? '#22c55e' : '#ef4444',
          }}>
            {tooltip.close >= tooltip.open ? '▲' : '▼'} {Math.abs(((tooltip.close - tooltip.open) / tooltip.open) * 100).toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
}
