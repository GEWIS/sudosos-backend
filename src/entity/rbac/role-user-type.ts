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
 * @module rbac
 */

import { BaseEntity, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import Role from './role';
import { UserType } from '../user/user';

/**
 * The RoleUserType entity represents the many-to-many relationship between user types and roles
 * in the Role-Based Access Control (RBAC) system. This entity enables automatic role assignment
 * based on a user's type.
 *
 * ## Purpose and Usage
 * RoleUserType allows the system to automatically assign roles to users based on their user type,
 * eliminating the need for manual role assignment for common user categories. This is the primary
 * mechanism for role assignment in the RBAC system.
 *
 * ## User Types and Role Assignment
 * Different user types receive different sets of roles:
 * - **MEMBER**: Regular association members with basic access
 * - **LOCAL_USER**: Local users with limited permissions
 * - **LOCAL_ADMIN**: Local administrators with elevated privileges
 * - **ORGAN**: Organization accounts with specific permissions
 * - **VOUCHER**: Voucher accounts with restricted access
 * - **INVOICE**: Invoice-related accounts
 * - **POINT_OF_SALE**: Point of sale system accounts
 *
 * ## Automatic Role Assignment Flow
 * 1. **User Creation**: When a user is created with a specific user type
 * 2. **Role Lookup**: System queries RoleUserType for roles associated with that user type
 * 3. **Role Assignment**: User automatically receives all roles linked to their user type
 * 4. **Permission Evaluation**: RoleManager uses these roles for permission checks
 *
 * ## Relationship Model
 * - **Role**: Each relationship links a specific role to a user type
 * - **UserType**: Each relationship specifies which user type receives the role
 * - **Composite Key**: The combination of roleId and userType forms a unique constraint
 *
 * ## Database Design
 * The entity uses a composite primary key (roleId, userType) to ensure that each role
 * can only be assigned once per user type. The relationship includes cascade behavior
 * for maintaining referential integrity.
 *
 * ## Integration with Role Manager
 * The RoleManager's `getRoles()` method queries RoleUserType to determine which roles
 * a user should have based on their user type, providing the foundation for permission evaluation.
 *
 * @typedef {BaseEntity} RoleUserType
 * @property {Role.model} role.required - The role being assigned to the user type
 * @property {UserType} userType.required - The user type that receives this role
 *
 * @promote
 */
@Entity()
export default class RoleUserType extends BaseEntity {
  @PrimaryColumn()
  public roleId: number;

  @ManyToOne(() => Role, (r) => r.roleUserTypes, { cascade: true })
  @JoinColumn({ name: 'roleId' })
  public role: Role;

  @PrimaryColumn()
  public userType: UserType;
}
