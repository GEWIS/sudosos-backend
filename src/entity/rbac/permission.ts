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
 * The Permission entity represents a specific permission within the Role-Based Access Control (RBAC) system.
 * Permissions define what actions a role can perform on specific entities and attributes, with
 * granular control over ownership relations and access scopes.
 *
 * ## Permission Structure
 * Each permission consists of four key components:
 * - **Entity**: The type of resource being accessed (e.g., 'User', 'Product', 'Transaction')
 * - **Action**: The operation being performed (e.g., 'create', 'read', 'update', 'delete')
 * - **Relation**: The ownership relationship (e.g., 'own', 'created', 'all', 'organ')
 * - **Attributes**: Specific fields or properties that can be accessed (e.g., ['name', 'email'] or ['*'])
 *
 * ## Permission Examples
 * - `entity: 'User', action: 'read', relation: 'own', attributes: ['*']` - Can read all own user data
 * - `entity: 'Product', action: 'create', relation: 'all', attributes: ['name', 'price']` - Can create products with name and price
 * - `entity: 'Transaction', action: 'update', relation: 'organ', attributes: ['status']` - Can update transaction status for organ
 *
 * ## Attribute Wildcards
 * The special attribute '*' grants access to all attributes of the entity, providing full access
 * to all properties regardless of the specific attribute list.
 *
 * ## Database Design
 * The permission uses a composite primary key consisting of roleId, action, relation, and entity,
 * ensuring that each role can have only one permission per unique combination of these fields.
 * The attributes are stored as a JSON array in the database.
 *
 * ## Integration with Role Manager
 * Permissions are evaluated by the RoleManager's `can()` method, which checks if a user's roles
 * have the necessary permissions to perform a specific action on an entity with given attributes.
 *
 * @module rbac
 */

import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import Role from './role';

@Entity()
export default class Permission extends BaseEntity {
  @PrimaryColumn()
  public roleId: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  public role: Role;

  @PrimaryColumn()
  public action: string;

  @PrimaryColumn()
  public relation: string;

  @PrimaryColumn()
  public entity: string;

  @Column({ type: 'varchar', transformer: {
    to: (val: string[]) => JSON.stringify(val),
    from: (val: string) => JSON.parse(val),
  } })
  public attributes: string[];
}
