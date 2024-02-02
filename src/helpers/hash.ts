import crypto from "crypto";

/**
 * Returns the sha256 hash of an object.
 * @param jsonObject
 */
export function hashJSON(jsonObject: object) {
  const jsonString = JSON.stringify(jsonObject);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}
