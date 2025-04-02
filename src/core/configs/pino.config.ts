import type { Params } from 'nestjs-pino'
import { DestinationStream, multistream, pino } from 'pino'
import { Options } from 'pino-http'

export function pinoConfig(): Params | Promise<Params> {
  return {
    pinoHttp: <Options | DestinationStream | [Options, DestinationStream]>[
      {
        stream: process.stdout,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          bindings: (bindings: any) => {
            return {
              ...bindings,
              node_version: process.version,
            }
          },
        },
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              level: 'trace',
              options: {
                sync: true,
                singleLine: true,
                colorize: true,
              },
            },
            {
              target: 'pino/file',
              level: 'info',
              options: {
                destination: 'logs/info.log',
                mkdir: true,
                maxSize: '1m',
                maxFiles: 3,
              },
            },
            {
              target: 'pino/file',
              level: 'error',
              options: {
                destination: 'logs/error.log',
                mkdir: true,
                maxSize: '1m',
                maxFiles: 3,
              },
            },
            {
              target: 'pino/file',
              level: 'debug',
              options: {
                destination: 'logs/debug.log',
                mkdir: true,
                maxSize: '1m',
                maxFiles: 3,
              },
            },
            {
              target: 'pino/file',
              level: 'fatal',
              options: {
                destination: 'logs/fatal.log',
                mkdir: true,
                maxSize: '1m',
                maxFiles: 3,
              },
            },
          ],
        },
      },
      multistream(
        [
          { level: 'debug', stream: process.stdout },
          { level: 'error', stream: process.stderr },
          { level: 'fatal', stream: process.stderr },
        ],
        { dedupe: true },
      ),
    ],
  }
}
