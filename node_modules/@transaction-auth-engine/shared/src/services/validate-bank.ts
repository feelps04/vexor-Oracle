import axios from 'axios';

const BRASILAPI_BANKS = 'https://brasilapi.com.br/api/banks/v1/';

export interface BankInfo {
  ispb: string;
  name: string;
  code: number;
  fullName?: string;
}

export async function validateBankCode(bankCode: string): Promise<BankInfo> {
  const code = bankCode.replace(/\D/g, '').padStart(3, '0').slice(0, 3);
  const response = await axios.get<BankInfo>(`${BRASILAPI_BANKS}${code}`, {
    timeout: 10_000,
    validateStatus: (status) => status === 200,
  });

  if (response.status !== 200 || !response.data?.name) {
    throw new Error(`Banco inválido ou não encontrado: ${bankCode}`);
  }

  return response.data;
}
