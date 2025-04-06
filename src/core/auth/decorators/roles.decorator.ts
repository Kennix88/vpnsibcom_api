import { SetMetadata } from '@nestjs/common'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: UserRolesEnum[]) =>
  SetMetadata(ROLES_KEY, roles)
