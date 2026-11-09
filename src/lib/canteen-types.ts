export type CanteenProduct = {
  id: number;
  name: string;
  price: number;
  itemNumber: number;
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
  voucherId: number | null;
  voided: boolean;
  voidReason: string;
};

export type CanteenBundle = {
  products: CanteenProduct[];
  movements: CanteenMovement[];
};
