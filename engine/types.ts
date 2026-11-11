export type Good = 'grain' | 'bread' | 'tools' | 'cloth';

export const GOODS: readonly Good[] = ['grain', 'bread', 'tools', 'cloth'];

/** Coins it costs a seller to make one unit, before events. */
export const INPUT_COST: Record<Good, number> = { grain: 2, bread: 3, tools: 8, cloth: 5 };

export type Side = 'buy' | 'sell';

/** A revealed bid or ask. `seq` is the commit order, used to break price ties. */
export interface Order {
  account: string;
  side: Side;
  units: number;
  price: number;
  seq: number;
}

export interface Fill {
  account: string;
  side: Side;
  units: number;
}

/** Units one buyer takes from one seller. Payment is units x clearing price. */
export interface Match {
  buyer: string;
  seller: string;
  units: number;
}

export interface Clearing {
  /** Uniform price for every matched unit, or null when nothing traded. */
  price: number | null;
  units: number;
  fills: Fill[];
  matches: Match[];
}
