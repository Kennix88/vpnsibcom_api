import { UserRolesEnum } from '@shared/enums/user-roles.enum'

export const RolesData: {
  key: UserRolesEnum
  name: string
  discount: number
  limitSubscriptions: number
}[] = [
  {
    key: UserRolesEnum.SUPER_ADMIN,
    name: 'Super admin',
    discount: 0,
    limitSubscriptions: 10,
  },
  {
    key: UserRolesEnum.ADMIN,
    name: 'Admin',
    discount: 0.5,
    limitSubscriptions: 10,
  },
  {
    key: UserRolesEnum.USER,
    name: 'User',
    discount: 1,
    limitSubscriptions: 10,
  },
  {
    key: UserRolesEnum.FRIEND,
    name: 'Friend',
    discount: 0,
    limitSubscriptions: 3,
  },
  {
    key: UserRolesEnum.OLD_USER,
    name: 'Old user',
    discount: 0.9,
    limitSubscriptions: 10,
  },
]
