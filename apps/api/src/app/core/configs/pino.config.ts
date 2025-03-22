import type { Request } from 'express'
import type { Params } from 'nestjs-pino'
import { DestinationStream, multistream } from 'pino'
import type { Options } from 'pino-http'

const passUrl = new Set(['/health'])
export const pinoConfig = <Params>{
	pinoHttp: <[Options<Request>, DestinationStream]>[
		{
			quietReqLogger: true,
			...(process.env.NODE_ENV === 'production'
				? {}
				: {
						level: 'debug',
						transport: {
							target: 'pino-pretty',
							options: { sync: true, singleLine: true },
						},
					}),
			autoLogging: {
				ignore: (req) => passUrl.has(req.originalUrl),
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
