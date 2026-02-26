export interface Holiday {
    date: string;
    name: string;
    type: string;
}
/** Check if today (Brazil timezone) is a national bank holiday. */
export declare function isBankHolidayToday(): Promise<boolean>;
//# sourceMappingURL=bank-holidays.d.ts.map