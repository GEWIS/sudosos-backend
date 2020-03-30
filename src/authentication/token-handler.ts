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
  readonly publicKey: string;
  /**
   * The key to be used for signing tokens.
   */
  readonly privateKey: string;
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
   */
  public async signToken(payload: JsonWebToken, nonce: string): Promise<string> {
    assert(payload.user, 'Payload has no user.');
    assert(Number.isInteger(Number((payload.user.id))), 'Payload user has invalid id.');
    assert(nonce, 'Nonce must be set.');

    const noncedPayload = {
      ...payload,
      nonce,
    };
    return util.promisify(jwt.sign).bind(null, noncedPayload, this.options.privateKey, {
      algorithm: this.options.algorithm,
      expiresIn: this.options.expiry,
      notBefore: 0,
    })();
  }

  /**
   * Verifies if the supplied token string is signed by this handler.
   * @param token - the token string to be validated.
   */
  public async verifyToken(token: string): Promise<JsonWebToken> {
    return util.promisify(jwt.verify).bind(null, token, this.options.publicKey, {
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
    delete payload.iat;
    delete payload.exp;
    delete payload.nbf;
    delete payload.jti;
    return this.signToken(payload, nonce);
  }

  /**
   * @returns the options used by this token handler.
   */
  public getOptions(): HandlerOptions {
    return this.options;
  }
}
