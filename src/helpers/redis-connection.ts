/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

/**
 * Shared Redis startup logic used by both the API server and the cron process.
 *
 * @module internal/helpers
 */

import Redis from 'ioredis';
import { Logger } from 'log4js';
import Config from '../config';

/**
 * Try to connect to Redis. If it is unreachable in non-production environments,
 * resolves to `undefined` so callers can fall back to direct SMTP sending.
 * In production a missing Redis connection is a hard failure.
 *
 * Mirrors the behaviour previously inlined in `src/index.ts`: wait for the
 * connection to become ready, attach a persistent error handler so post-startup
 * Redis errors are logged rather than crashing the process, and clean up the
 * client on failure so the event loop is not kept alive unnecessarily.
 */
export async function initRedisConnection(logger: Logger): Promise<Redis | undefined> {
  const config = Config.get();
  let redisClient: Redis | undefined;
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
      connectTimeout: config.redis.connectTimeoutMs,
    });

    await new Promise<void>((resolve, reject) => {
      let handleReady: () => void;
      let handleError: (err: Error) => void;

      handleReady = () => {
        redisClient!.removeListener('error', handleError);
        resolve();
      };
      handleError = (err: Error) => {
        redisClient!.removeListener('ready', handleReady);
        reject(err);
      };

      redisClient!.once('ready', handleReady);
      redisClient!.once('error', handleError);
    });

    redisClient.on('error', (err: Error) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    logger.info('Redis connection established.');
    return redisClient;
  } catch (err) {
    if (redisClient) {
      redisClient.removeAllListeners();
      redisClient.disconnect();
    }

    if (config.app.isProduction) {
      throw new Error(
        `Redis is required in production but could not be reached: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    logger.warn(
      `Could not connect to Redis (${err instanceof Error ? err.message : String(err)}). `
      + 'Email queueing will be disabled – emails will be sent directly via SMTP. '
      + 'Start Redis or set REDIS_HOST / REDIS_PORT to enable queued sending.',
    );
    return undefined;
  }
}
