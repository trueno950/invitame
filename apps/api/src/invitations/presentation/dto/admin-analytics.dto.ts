import {
  IsOptional,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

import { isAnalyticsDay } from "../../domain/analytics-window";

// The query of the administrator's analytics reads (M9 T11; S2, S3, S7). Both bounds are optional and each one, when
// present, must be a real calendar day written `YYYY-MM-DD`: the global ValidationPipe refuses anything else — a month
// 13, February 30, a full instant, an empty value — with its own 400 before a use case is reached, and it refuses an
// unknown parameter too (`forbidNonWhitelisted`).
//
// The rest of the window rule does not belong here: the default (`to` is today in Ciudad de México, `from` is thirty
// days ending there) needs the application's clock, and the order and width rules are stated with it in
// `domain/analytics-window.ts`, so a request that names a reversed or over-wide window answers 400
// `INVALID_ANALYTICS_WINDOW` from the use case instead of a validation message. Both are 400; only the body differs.

/** `@IsAnalyticsDay()`: the value is a real calendar day written `YYYY-MM-DD`, as the zone's own day is. */
@ValidatorConstraint({ name: "isAnalyticsDay" })
class AnalyticsDayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isAnalyticsDay(value);
  }

  defaultMessage(_arguments: ValidationArguments): string {
    return "each of from and to must be a real calendar day written YYYY-MM-DD";
  }
}

function IsAnalyticsDay(): PropertyDecorator {
  return Validate(AnalyticsDayConstraint);
}

export class AdminAnalyticsWindowDto {
  @IsOptional()
  @IsAnalyticsDay()
  from?: string;

  @IsOptional()
  @IsAnalyticsDay()
  to?: string;
}
