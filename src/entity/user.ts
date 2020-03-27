import {
  Entity,
} from 'typeorm';
import BaseEntity from './base-entity';

@Entity()
/**
 * @typedef {BaseEntity} User
 */
export default class User extends BaseEntity {
}
