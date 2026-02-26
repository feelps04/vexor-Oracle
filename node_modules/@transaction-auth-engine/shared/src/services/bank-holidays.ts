import axios from 'axios';

const BRASILAPI_HOLIDAYS = 'https://brasilapi.com.br/api/feriados/v1/';

export interface Holiday {
  date: string;
  name: string;
  type: string;
}

/** Check if today (Brazil timezone) is a national bank holiday. */
export async function isBankHolidayToday(): Promise<boolean> {
  const now = new Date();
  const year = now.getFullYear();

  try {
    const response = await axios.get<Holiday[]>(`${BRASILAPI_HOLIDAYS}${year}`, {
      timeout: 10_000,
    });

    if (!Array.isArray(response.data)) return false;

    const today = now.toISOString().slice(0, 10);
    return response.data.some((h) => h.date === today);
  } catch {
    return false;
  }
}
