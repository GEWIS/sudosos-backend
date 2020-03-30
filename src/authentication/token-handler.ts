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
   */
  public async signToken(payload: JsonWebToken): Promise<string> {
    throw new Error('Not implemented');
  }

  /**
   * Verifies if the supplied token string is signed by this handler.
   * @param token - the token string to be validated.
   */
  public async verifyToken(token: string): Promise<boolean> {
    throw new Error('Not implemented');
  }

  /**
   * Refreshes the given token to extend it's expiry time.
   * @param token the token string to be refreshed.
   */
  public async refreshToken(token: string): Promise<string> {
    throw new Error('Not implemented');
  }

  /**
   * @returns the options used by this token handler.
   */
  public getOptions(): HandlerOptions {
    return this.options;
  }
}
