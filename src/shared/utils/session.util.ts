import { InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { Users } from '@prisma/client'
import { SessionMetadata } from '@shared/types/session-metadata.interface'
import type { FastifyRequest } from 'fastify'

export function saveSession(
  req: FastifyRequest,
  user: Users,
  metadata: SessionMetadata,
) {
  return new Promise((resolve, reject) => {
    req.session.createdAt = new Date()
    req.session.userId = user.id
    req.session.metadata = metadata

    req.session.save((err) => {
      if (err) {
        return reject(new InternalServerErrorException("Couldn't save session"))
      }

      resolve({ user })
    })
  })
}

export function destroySession(
  req: FastifyRequest,
  configService: ConfigService,
) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) {
        return reject(new InternalServerErrorException("Couldn't end session"))
      }

      resolve(true)
    })
  })
}
