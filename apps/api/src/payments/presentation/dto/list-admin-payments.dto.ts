import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

// The query of the administrator's bounded paid read (T2, S3). The read lists one status, so `status` is a closed set
// of one: a caller cannot ask this route for a pending or refunded list. `limit` is bounded and defaults to 20, so the
// answer is bounded even when the query omits it, and the global ValidationPipe answers 400 for anything else.

/** The one status this read lists. A closed set of one is deliberate: it is the refund working list (S3). */
export const ADMIN_PAYMENT_STATUSES = ["paid"] as const;

export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

export const ADMIN_PAYMENT_DEFAULT_LIMIT = 20;
export const ADMIN_PAYMENT_MAX_LIMIT = 50;

export class ListAdminPaymentsDto {
  @IsOptional()
  @IsIn(ADMIN_PAYMENT_STATUSES)
  status: AdminPaymentStatus = "paid";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAYMENT_MAX_LIMIT)
  limit: number = ADMIN_PAYMENT_DEFAULT_LIMIT;
}
