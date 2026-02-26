import axios from 'axios';

const AWESOMEAPI_URL = 'https://economia.awesomeapi.com.br/last/';

export class CurrencyConverter {
  async convertToBRL(amount: number, currency: string): Promise<number> {
    if (currency === 'BRL') return amount;

    try {
      const response = await axios.get(`${AWESOMEAPI_URL}${currency}-BRL`, {
        timeout: 10_000,
      });
      const key = `${currency}BRL`;
      const data = response.data;
      if (!data || !data[key]) {
        throw new Error(`Unexpected response: ${currency}-BRL`);
      }
      const rate = parseFloat(data[key].bid);
      return Math.round(amount * rate);
    } catch (error) {
      throw new Error(
        `Falha na conversão de moeda: ${currency} - ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Returns { amountBRL, rate }. */
  async convertToBRLWithRate(amount: number, currency: string): Promise<{ amountBRL: number; rate: number }> {
    if (currency === 'BRL') {
      return { amountBRL: amount, rate: 1 };
    }

    try {
      const response = await axios.get(`${AWESOMEAPI_URL}${currency}-BRL`, {
        timeout: 10_000,
      });
      const key = `${currency}BRL`;
      const data = response.data;
      if (!data || !data[key]) {
        throw new Error(`Unexpected response: ${currency}-BRL`);
      }
      const rate = parseFloat(data[key].bid);
      const amountBRL = Math.round(amount * rate);
      return { amountBRL, rate };
    } catch (error) {
      throw new Error(
        `Falha na conversão de moeda: ${currency} - ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
