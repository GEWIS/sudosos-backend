import User from '../entity/user';

/**
 * The contents of the JWT used for user authentication.
 */
export default class JsonWebToken {
  /**
   * The token holds a reference to the user to which this token belongs.
   */
  public user: User;
}
