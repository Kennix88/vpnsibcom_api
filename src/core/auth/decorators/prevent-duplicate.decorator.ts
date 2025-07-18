import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'
import { PreventDuplicateInterceptor } from '../guards/prevent-duplicate.guard'

export const PREVENT_DUPLICATE_META = 'prevent_duplicate_ttl'

export function PreventDuplicateRequest(ttl = 120) {
  return applyDecorators(
    SetMetadata(PREVENT_DUPLICATE_META, ttl),
    UseInterceptors(PreventDuplicateInterceptor),
  )
}
