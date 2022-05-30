import { RequestWithToken } from "../middleware/token-middleware";

/**
 * Checks if the given ID is part of the Token Organ List.
 * @param req - The request with token to validate against.
 * @param organId - The id of the organ to check.
 */
export default function userTokenInOrgan(req: RequestWithToken, organId: number) {
    if (!req.token.organs) return false;
    return (req.token.organs.find((organ) => organ.id === organId ) !== undefined);
}
