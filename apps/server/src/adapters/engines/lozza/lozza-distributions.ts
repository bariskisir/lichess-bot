export interface LozzaDistribution {
  id: string;
  name: string;
  version: '2' | '5';
  identification: string;
  elo: number;
}

export const LOZZA_DISTRIBUTIONS: readonly LozzaDistribution[] = [
  { id: 'lozza-2-local', name: 'Lozza 2', version: '2', identification: 'Lozza 2.0', elo: 2554 },
  { id: 'lozza-5-local', name: 'Lozza 5', version: '5', identification: 'Lozza 5', elo: 3071 },
];

export const DEFAULT_LOZZA = LOZZA_DISTRIBUTIONS[0]!;
