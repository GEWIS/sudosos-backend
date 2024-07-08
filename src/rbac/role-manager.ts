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

import User from '../entity/user/user';
import AssignedRole from '../entity/rbac/assigned-role';

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
  /**
   * A mapping from role names to the role definitions defined in the system.
   */
  private roles: RoleDefinitions = {};

  /**
   * Registers a new role in the systsem.
   *
   * @param role - The role which should be registered in the system.
   * @throws {Error} - Throws an error when a role with the same name is already registered.
   */
  public registerRole(role: RoleDefinition): void {
    if (this.roles[role.name]) {
      throw new Error('Role with the same name already exists.');
    }

    this.roles[role.name] = role;
  }

  /**
   * Filter the allowed attributes from the set of unsatisfied attributes.
   * During this filtering, wildcards are taken into account.
   *
   * @param allowedAttributes - The set of allowed attributes to be processed.
   * @param unsatisfied - The mutable set of so-far unsatisfied attributes.
   * @returns
   */
  public static processAttributes(
    allowedAttributes: Set<AllowedAttribute>, unsatisfied: Set<AllowedAttribute>,
  ) {
    // If this relation has a wildcard, all attributes are allowed.
    if (allowedAttributes.has('*')) {
      unsatisfied.clear();
      return;
    }

    // Remove all allowed attributes from the unsatisfied attribute list.
    allowedAttributes.forEach((attr) => {
      unsatisfied.delete(attr);
    });
  }

  /**
   * Process the allowed attributes for the given relations in a given action definition.
   *
   * @param actionDefinition - The action definition from which to process the relations.
   * @param relations - The relations of the action definition which should be processed.
   * @param unsatisfied - The mutable set of so-far unsatisfied attributes.
   */
  public static processRelations(
    actionDefinition: ActionDefinition, relations: string[], unsatisfied: Set<AllowedAttribute>,
  ): void {
    // Use every, such that we can break early if all attributes are satisfied.
    relations.every((relation): boolean => {
      const allowedAttributes = actionDefinition[relation];
      // If there are no attributes to process, continue with the next iteration
      if (!allowedAttributes) return true;

      RoleManager.processAttributes(allowedAttributes, unsatisfied);
      // If unsatisfied is empty, return false and break from the every loop,
      // otherwise continue with the next iteration.
      return unsatisfied.size > 0;
    });
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
  public can(
    roles: string | string[],
    action: string,
    relations: string | string[],
    entity: string,
    attributes: AllowedAttribute[],
  ): boolean {
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
    if (relationsArray.indexOf('all') === -1) {
      relationsArray.push('all');
    }

    // Keep track of currently unsatisfied attributes.
    const unsatisfied = new Set<AllowedAttribute>(attributes);

    // For every role, remove the attributes that are satisfied by the role.
    // Use every, such that we can break early if all attributes are satisfied.
    rolesArray.every((role): boolean => {
      const roleDefinition: RoleDefinition = this.roles[role];
      // If there are no roles to process, continue with the next iteration.
      if (!roleDefinition) return true;

      const entityDefinition: EntityDefinition = roleDefinition.permissions[entity];
      // If there are no entities to process, continue with the next iteration.
      if (!entityDefinition) return true;

      const actionDefinition: ActionDefinition = entityDefinition[action];
      // If there are no actions to process, continue with the next iteration.
      if (!actionDefinition) return true;

      RoleManager.processRelations(
        actionDefinition, relationsArray, unsatisfied,
      );
      // If unsatisfied is empty, return false and break from the every loop,
      // otherwise continue with the next iteration.
      return unsatisfied.size > 0;
    });

    // Action is allowed if all attributes are satisfied.
    return unsatisfied.size === 0;
  }

  /**
   * Get all role names for which the given user passes the assignment check.
   * @param user - The user for which role checking is performed.
   * @returns a list of role names.
   */
  public async getRoles(user: User): Promise<string[]> {
    const roles = Object.keys(this.roles);
    const results = await Promise.all(
      roles.map((name): Promise<boolean> => this.roles[name].assignmentCheck(user)),
    );
    return roles.filter((_: string, index: number): boolean => results[index]);
  }

  /**
   * Returns a RoleDefinitions object for the provided role names.
   * @param roles - Names of the roles to return.
   */
  public toRoleDefinitions(roles: string[]): RoleDefinitions {
    const definitions: RoleDefinitions = {};
    roles.forEach((role) => { definitions[role] = this.roles[role]; });
    return definitions;
  }

  /**
   * Get all registered roles in the system.
   * Warning: changes to the returned content are reflected in the role manager.
   * @returns a list of all roles.
   */
  public getRegisteredRoles(): RoleDefinitions {
    return this.roles;
  }

  /**
   * Tests if the role manager contains a role with the given name
   * @param role - role name to test
   */
  public containsRole(role: string): Boolean {
    return this.roles[role] !== undefined;
  }

  /**
   * Sets (overwrites) all the assigned users of a role.
   * @param users - The users being set the role
   * @param role - The role to set
   */
  public async setRoleUsers(users: User[], role: string) {
    if (!this.roles[role]) return undefined;

    // Typeorm doesnt like empty deletes.
    const drop: AssignedRole[] = await AssignedRole.find({ where: { role } });
    if (drop.length !== 0) {
      // Drop all assigned users.
      await AssignedRole.delete({ role });
    }

    // Assign users the role
    const promises = users.map((user) => (Object.assign(new AssignedRole(), {
      user,
      role,
    })).save());
    return Promise.all(promises);
  }
}
