import { HttpStatus } from '@nestjs/common'

import type { RemnaApiErrorDetail } from './remna.types'

export interface RemnaApiExceptionParams {
  /** Имя метода RemnaService, в котором произошла ошибка (для логов/дебага) */
  operation: string
  statusCode?: number
  remnaMessage?: string
  errors?: RemnaApiErrorDetail[]
  isNetworkError?: boolean
  isTimeout?: boolean
  cause?: unknown
}

/**
 * Единая ошибка для всех сбоев при обращении к Remnawave Panel API.
 * Инкапсулирует: HTTP-статус, сообщение/ошибки от панели, признак сетевой ошибки/таймаута.
 */
export class RemnaApiException extends Error {
  public readonly operation: string
  public readonly statusCode: number
  public readonly remnaMessage?: string
  public readonly errors?: RemnaApiErrorDetail[]
  public readonly isNetworkError: boolean
  public readonly isTimeout: boolean

  constructor(params: RemnaApiExceptionParams) {
    const {
      operation,
      statusCode,
      remnaMessage,
      errors,
      isNetworkError,
      isTimeout,
      cause,
    } = params

    super(remnaMessage || `Remnawave API request failed: ${operation}`)

    this.name = 'RemnaApiException'
    this.operation = operation
    this.statusCode = statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR
    this.remnaMessage = remnaMessage
    this.errors = errors
    this.isNetworkError = Boolean(isNetworkError)
    this.isTimeout = Boolean(isTimeout)

    if (cause !== undefined) {
      this.cause = cause
    }

    // Восстанавливаем прототип, т.к. TS-таргеты ниже ES2015 ломают "instanceof" для Error-наследников
    Object.setPrototypeOf(this, RemnaApiException.prototype)
  }

  get isNotFound(): boolean {
    return this.statusCode === HttpStatus.NOT_FOUND
  }

  get isValidationError(): boolean {
    return this.statusCode === HttpStatus.BAD_REQUEST
  }

  get isUnauthorized(): boolean {
    return (
      this.statusCode === HttpStatus.UNAUTHORIZED ||
      this.statusCode === HttpStatus.FORBIDDEN
    )
  }

  get isConflict(): boolean {
    return this.statusCode === HttpStatus.CONFLICT
  }

  get isServerError(): boolean {
    return this.statusCode >= 500
  }

  /** Плоское summary-представление для логов/Sentry */
  toLogObject() {
    return {
      operation: this.operation,
      statusCode: this.statusCode,
      remnaMessage: this.remnaMessage,
      errors: this.errors,
      isNetworkError: this.isNetworkError,
      isTimeout: this.isTimeout,
    }
  }
}
