import {
  Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
/**
 * @typedef User
 * @property {integer} userId.required - The auto-generated user id.
 */
export default class User {
  @PrimaryGeneratedColumn()
  public userId?: number;
}
