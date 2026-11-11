// Saldo y movimientos (ver docs/movimientos.md).
export interface Movement {
  merchant: string;
  kind: "food" | "transfer" | "purchase";
  amount: number;
  currency: string;
  at: string;
}

export const LATEST_MOVEMENTS = 10;

/** Los últimos movimientos, del más reciente al más antiguo. */
export function latest(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) => b.at.localeCompare(a.at)).slice(0, LATEST_MOVEMENTS);
}

/** Un retiro no puede superar el saldo disponible. */
export function canWithdraw(balance: number, amount: number): boolean {
  return amount > 0 && amount <= balance;
}
