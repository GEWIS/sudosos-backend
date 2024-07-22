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
 */

import User, { UserType } from '../entity/user/user';
import AssignedRole from '../entity/rbac/assigned-role';
import Role from '../entity/rbac/role';
import log4js, { Logger } from 'log4js';
import Permission from '../entity/rbac/permission';
import { In } from 'typeorm';
import MemberAuthenticator from '../entity/authenticator/member-authenticator';
import { SELLER_ROLE } from './default-roles';

/**
 * The assignment check is a predicate performed on a user to determine
 * whether or not the user has the given role. This predicate could perform
 * database queries or other API calls, but should resolve swiftly as it delays
 * login requests et cetera.
 */
export type AssignmentCheck = (user: User) => Promise<boolean>;

/**
 * The allowed attribute is a string defining what attributes/properties of the
 * entity are allowed to be accessed.
 *
 * Using the '*' wildcard is possible.
 */
export type AllowedAttribute = string;

/**
 * The action definition interface defines a mapping from ownership relation
 * of the subject entity to the allowed attributes. Typical ownership relations are
 * 'own', 'created', and 'all'.
 *
 * Using the 'all' relation defines access regardless of ownership.
 */
export interface ActionDefinition {
  [relation: string]: Set<AllowedAttribute>;
}

/**
 * The entity definition interface defines a mapping from actions to
 * the action definitions belonging to these actions. Action names
 * typically are the CRUD values 'create', 'read', 'update', and 'delete'.
 */
export interface EntityDefinition {
  [action: string]: ActionDefinition;
}

/**
 * The permission definition interface defines a mapping from
 * entity subject names to entity definitions. The name of the
 * entity describes the object for which CRUD permissions are checked.
 */
export interface PermissionDefinition {
  [entity: string]: EntityDefinition;
}

/**
 * A role definition contains a unique name, permission definitions, and
 * an assignment predicate which determines if a supplied user has the role.
 */
export interface RoleDefinition {
  /**
   * The unique name of the role.
   */
  name: string;
  /**
   * The list containing the permissions set that this role has.
   */
  permissions: PermissionDefinition;
  /**
   * The assignment check predicate for this role.
   */
  assignmentCheck: AssignmentCheck
}

/**
 * The role definitions interface defines a mapping from
 * role names to role definitions. In this mapping, all role
 * definition objects should have the same name as the key
 * used in this mapping.
 */
export interface RoleDefinitions {
  [name: string]: RoleDefinition
}

/**
 * The role manager is responsible for the management of registered roles in the system,
 * and performing access checks based on user roles and user access.
 */
export default class RoleManager {
  private logger: Logger;

  constructor() {
    this.logger = log4js.getLogger('RoleManager');
  }

  public async initialize() {
    // Placeholder for possible (future) asynchronous logic to initialize the role manager
    return this;
  }

  /**
   * Performs an access check for the given parameters.
   * This method can be used to verify if a user with the given role(s)
   * is permitted to perform the given action (eg. create, read, update, delete) on the given
   * properties of the given data entity, to which the user has the given relations.
   *
   * @param roles - The role name or list of role names to perform the check for.
   *    If a single role is supplied as string, it is converted to a list.
   * @param action - The action on the entity to check access for.
   *    Commonly used actions are 'create', 'read', 'update', and 'delete'.
   * @param relations - The ownership relations towards the object.
   *    The ownership relations describes the status of the user related to the object:
   *    the user can be the owner, creator, editor, or not related at all.
   *    Commonly used ownership relations are 'own', 'created' and 'all'.
   * @param entity - The entity type name of the object. Most often this is a
   *    database entity, but it could also be a computed entity such as 'balance'.
   * @param attributes - The list of attributes to access. The wildcard '*' can be
   *    used to verify that the user is allowed to access all properties.
   * @returns {boolean} - True if access is allowed, false otherwise.
   */
  public async can(
    roles: string | string[],
    action: string,
    relations: string | string[],
    entity: string,
    attributes: AllowedAttribute[],
  ): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') return true;

    // Convert roles to array if a single role is given.
    let rolesArray: string[];
    if (typeof roles === 'string') {
      rolesArray = [roles];
    } else {
      rolesArray = roles;
    }

    // Convert relations to array if a single relation is given.
    let relationsArray: string[];
    if (typeof relations === 'string') {
      relationsArray = [relations];
    } else {
      relationsArray = relations;
    }
    // Add the relation "all" to the relations, because if you have permission to access "all",
    // it does not matter what the given relation is.
    if (relationsArray.indexOf('all') === -1) {
      relationsArray.push('all');
    }

    // Given the entity, action and relation, try to find whether such a permission exists for the
    // given roles.
    const applicablePermissions = await Permission.find({ where: {
      entity, action, relation: In(relationsArray), role: { name: In(rolesArray) },
    } });

    // For all found permission records, get a single list of all attributes the user is allowed to access
    const allAttributes = applicablePermissions.map((perm) => perm.attributes).flat();

    // If the user has a wildcard as attribute, they are allowed to access everything, so return true.
    const hasStar = allAttributes.some((a) => a === '*');
    if (hasStar) {
      return true;
    }

    // Find all attributes that the user should have, but the current set of permissions does not provide
    const disallowedAttributes = attributes.filter((a) => !allAttributes.includes(a));
    // Return whether the user is allowed to access all attributes
    return disallowedAttributes.length === 0;
  }

  /**
   * Returns all the ORGANS the user has rights over
   * @param user
   */
  public async getUserOrgans(user: User) {
    const organs = (await MemberAuthenticator.find({ where: { user: { id: user.id } }, relations: ['authenticateAs'] })).map((organ) => organ.authenticateAs);
    return organs.filter((organ) => organ.type === UserType.ORGAN);
  }

  /**
   * Get all role names for which the given user passes the assignment check.
   * @param user - The user for which role checking is performed.
   * @param getPermissions - Whether the permissions of each role should also be returned
   * @returns a list of role names.
   */
  public async getRoles(user: User, getPermissions = false): Promise<Role[]> {
    const roles = await Role.find({ where: [{
      assignments: { userId: user.id },
    }, {
      roleUserTypes: { userType: user.type },
    }], relations: { permissions: getPermissions } });

    const organs = await this.getUserOrgans(user);
    // If a user is part of an organ he gains seller rights.
    if (organs.length > 0) {
      const sellerRole = await Role.findOne({ where: { name: SELLER_ROLE }, relations: { permissions: getPermissions } });
      roles.push(sellerRole);
    }

    return roles;
  }

  /**
   * Sets (overwrites) all the assigned users of a role.
   * @param users - The users being set the role
   * @param roleName - The role to set
   */
  public async setRoleUsers(users: User[], roleName: string) {
    const role = await Role.findOne({ where: { name: roleName } });
    if (!role) return undefined;

    // Typeorm doesnt like empty deletes.
    const drop: AssignedRole[] = await AssignedRole.find({ where: { role: { id: role.id } } });
    if (drop.length !== 0) {
      // Drop all assigned users.
      await AssignedRole.delete({ role: { id: role.id } });
    }

    // Assign users the role
    const promises = users.map((user) => (Object.assign(new AssignedRole(), {
      user,
      role,
    })).save());
    return Promise.all(promises);
  }
}
