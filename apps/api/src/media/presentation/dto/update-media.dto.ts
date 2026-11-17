import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

import { MAX_ALT_LENGTH } from "../../domain/media-asset";

/**
 * One media edit (M8 S4): the alt text, the gallery position, or both. `alt: null` clears the alt text, and a
 * position is a zero-based index among the stored gallery photos. The global `ValidationPipe` refuses an unknown
 * field, and the use case re-validates the values, so a request that skipped this pipe is still bounded.
 */
export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ALT_LENGTH)
  alt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
