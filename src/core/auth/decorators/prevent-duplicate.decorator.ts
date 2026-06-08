import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'
import { PreventDuplicateInterceptor } from '../guards/prevent-duplicate.interceptor'

// Single source of truth — imported by the interceptor, not redefined there
export const PREVENT_DUPLICATE_META = 'prevent_duplicate_ttl'

export function PreventDuplicateRequest(ttl = 120) {
  return applyDecorators(
    SetMetadata(PREVENT_DUPLICATE_META, ttl),
    UseInterceptors(PreventDuplicateInterceptor),
  )
}
