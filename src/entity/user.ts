import {
  Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
/**
 * @typedef User
 * @property {integer} userId
 */
export default class User {
  @PrimaryGeneratedColumn()
  /**
   * The auto-generated user id.
   */
  public userId?: number;
}
