/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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

/**
 * The assignment check is a predicate performed on a user to determine
 * whether or not the user has the given role. This predicate could perform
 * database queries or other API calls, but should resolve swiftly as it delays
 * login requests et cetera.
 */
export type AssignmentCheck = (user: User) => Promise<boolean>;

/**
 * The allowed attribute is a string defining what attributes/properties of the
 * object are allowed to be accessed.
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
 * an assignment perdicate which determines if a supplied user has the role.
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
   * The assignemnt check predicate for this role.
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
    throw new Error('Not Implemented');
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
    throw new Error('Not Implemented');
  }

  /**
   * Performs an access check for the given parameters.
   *
   * @param roles - The role name or list of role namess to perform the check for.
   * @param action - The action on the entity to check access for.
   * @param relation - The ownership relation towards the object.
   * @param entity - The entity type name of the object.
   * @param attributes - The list of attributes to access, possibly with wildcard.
   * @returns {boolean} - True if access is allowed, false otherwise.
   */
  public can(
    roles: string | string[],
    action: string,
    relation: string,
    entity: string,
    attributes: AllowedAttribute[],
  ): boolean {
    throw new Error('Not Implemented');
  }
}
