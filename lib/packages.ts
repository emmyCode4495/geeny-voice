export type CreditPackage = {
  id: string;
  credits: number;
  amountNgn: number;
  amountUsd: number;
  label: string;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "starter", credits: 200, amountNgn: 2500, amountUsd: 2, label: "200 credits" },
  { id: "basic", credits: 600, amountNgn: 6000, amountUsd: 5, label: "600 credits" },
  { id: "pro", credits: 1800, amountNgn: 14000, amountUsd: 12, label: "1,800 credits" },
  { id: "studio", credits: 5000, amountNgn: 30000, amountUsd: 25, label: "5,000 credits" }
];

export function getPackage(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((p) => p.id === id);
}
