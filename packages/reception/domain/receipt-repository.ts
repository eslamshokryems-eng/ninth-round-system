import type { Result } from "@9thround/shared-kernel";
import type { Receipt } from "./receipt";

export interface ReceiptRepository {
  list(branchId: string): Promise<Result<Receipt[]>>;
}
