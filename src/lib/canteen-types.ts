export type CanteenProduct = {
  id: number;
  name: string;
  price: number;
  itemNumber: number;
  needsReview?: boolean;
};

export type CanteenMovement = {
  id: number;
  itemNumber: number;
  itemName: string;
  balance: number;
  incoming: number | null;
  incomingDate: string | null;
  outgoing: number | null;
  outgoingDate: string | null;
  recipient: string;
  issueCategory?: string;
  voucherId: number | null;
  voided: boolean;
  voidReason: string;
  needsReview?: boolean;
};

export type CanteenBundle = {
  products: CanteenProduct[];
  movements: CanteenMovement[];
};
