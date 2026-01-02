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
 * This is the module page of the assigned-role.
 *
 * @module rbac
 */

import {
  Entity, JoinColumn, ManyToOne, PrimaryColumn,
} from 'typeorm';
import BaseEntityWithoutId from '../base-entity-without-id';
import User from '../user/user';
import Role from './role';

/**
 * The AssignedRole entity represents the many-to-many relationship between users and roles
 * in the Role-Based Access Control (RBAC) system. This entity allows individual users
 * to be assigned specific roles, granting them the permissions associated with those roles.
 *
 * ## Purpose and Usage
 * While the RBAC system primarily uses user types for automatic role assignment (via RoleUserType),
 * AssignedRole provides explicit role assignment for individual users. This is useful for:
 * - **Custom Role Assignments**: Granting specific roles to individual users
 * - **Testing**: Assigning roles for testing purposes
 * - **Legacy Support**: Maintaining compatibility with existing role assignment systems
 * - **Administrative Overrides**: Manually assigning roles that differ from user type defaults
 *
 * ## Relationship Model
 * - **User**: Each assignment is linked to a specific user
 * - **Role**: Each assignment grants a specific role to the user
 * - **Composite Key**: The combination of userId and roleId forms a unique constraint
 *
 * ## Role Assignment Hierarchy
 * Users can receive roles through multiple mechanisms:
 * 1. **User Type Assignment**: Automatic roles based on user type (RoleUserType)
 * 2. **Individual Assignment**: Explicit role assignment (AssignedRole)
 * 3. **Organ Membership**: Additional roles through organ membership (OrganMembership)
 *
 * ## Database Design
 * The entity uses a composite primary key (userId, roleId) to ensure that each user
 * can only have one instance of each role. The relationship includes cascade delete
 * behavior to maintain referential integrity.
 *
 * ## Integration with Role Manager
 * The RoleManager's `getRoles()` method considers both user type assignments and
 * individual role assignments when determining a user's effective roles.
 *
 * @typedef {BaseEntityWithoutId} AssignedRole
 * @property {User.model} user.required - The user being assigned a role
 * @property {Role.model} role.required - The role being assigned to the user
 */
@Entity()
export default class AssignedRole extends BaseEntityWithoutId {
  @PrimaryColumn()
  public userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @PrimaryColumn()
  public roleId: number;

  @ManyToOne(() => Role, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'roleId' })
  public role: Role;
}
