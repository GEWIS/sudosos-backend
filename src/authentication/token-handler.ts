/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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
 * This is the module page of token-handler.
 *
 * @module authentication
 */

import assert from 'assert';
import * as util from 'util';
import * as jwt from 'jsonwebtoken';
import JsonWebToken from './json-web-token';

/**
 * The configuration options for the token handler.
 */
export interface HandlerOptions {
  /**
   * The algorithm used for signing the tokens.
   */
  readonly algorithm: jwt.Algorithm;
  /**
   * The key to be used for verifying tokens.
   */
  readonly publicKey: string | Buffer;
  /**
   * The key to be used for signing tokens.
   */
  readonly privateKey: string | Buffer;
  /**
   * The expiry time for newly generated or refreshed tokens, expressed in seconds.
   */
  readonly expiry: number;
}

/**
 * This class is responsible for key management, the signing, validation, and refreshing of JWT.
 */
export default class TokenHandler {
  /**
   * A reference to the options to be used by this handler instance.
   */
  private readonly options: HandlerOptions;

  /**
   * Creates a new token handler instance.
   * @param options - the options to be used by this handler.
   */
  public constructor(options: HandlerOptions) {
    this.options = options;
  }

  /**
   * Creates a token string by signing the payload.
   * @param payload - the payload of the JWT.
   * @param nonce - the cryptographically secure nonce to be used.
   * @param expiry - custom expiry to override the token default expiry time (in seconds)
   */
  public async signToken(payload: JsonWebToken, nonce: string, expiry?: number): Promise<string> {
    assert(payload.user, 'Payload has no user.');
    assert(Number.isInteger(Number((payload.user.id))), 'Payload user has invalid id.');
    assert(nonce, 'Nonce must be set.');

    const noncedPayload = {
      ...payload,
      nonce,
    };
    return util.promisify(jwt.sign).bind(null, noncedPayload, this.options.privateKey, {
      algorithm: this.options.algorithm,
      expiresIn: expiry ?? this.options.expiry,
      notBefore: 0,
    })();
  }

  /**
   * Verifies if the supplied token string is signed by this handler.
   * @param token - the token string to be validated.
   */
  public async verifyToken(token: string): Promise<JsonWebToken> {
    return util.promisify(jwt.verify).bind(null, token, this.options.publicKey, {
      algorithms: [this.options.algorithm],
      complete: false,
    })();
  }

  /**
   * Refreshes the given token to extend it's expiry time.
   * @param token the token string to be refreshed.
   * @param nonce - the cryptographically secure nonce to be used.
   */
  public async refreshToken(token: string, nonce: string): Promise<string> {
    const payload = await this.verifyToken(token) as any;
    const expiry = payload.exp - payload.iat;
    delete payload.iat;
    delete payload.exp;
    delete payload.nbf;
    delete payload.jti;
    return this.signToken(payload, nonce, expiry);
  }

  /**
   * @returns the options used by this token handler.
   */
  public getOptions(): HandlerOptions {
    return this.options;
  }
}
