import { Converter } from 'typedoc';

/**
 * Controller files in this repo document HTTP endpoints using swagger-jsdoc syntax:
 *
 *   @param {integer} take.query - How many items to return
 *   @param {integer} id.path.required - The id of the resource
 *   @param {SomeRequest} request.body.required - The payload
 *
 * These are **not** TypeScript function parameters — they describe Swagger operation
 * parameters. TypeDoc treats them as regular `@param` tags, fails to match them
 * against the real TS signature, and emits one "has an @param with name X, which was
 * not used" warning per tag (~700 in total).
 *
 * This plugin strips those swagger-jsdoc-style `@param` tags from comments in
 * controller files before TypeDoc's validation runs. We deliberately keep `@param`
 * tags whose name does NOT contain a `.` — those are genuine TypeScript param docs,
 * and if they drift, we want the warning to fire.
 *
 * Scope: files under `src/controller/` and `src/gewis/controller/`.
 */
export function load(app) {
    const DOTTED_PARAM_NAME = /\./;
    const CONTROLLER_PATH = /[\\/](?:src[\\/])?(?:gewis[\\/])?controller[\\/]/;

    app.converter.on(Converter.EVENT_CREATE_DECLARATION, (_context, reflection) => {
        stripFromReflection(reflection);
    });
    app.converter.on(Converter.EVENT_CREATE_SIGNATURE, (_context, reflection) => {
        stripFromReflection(reflection);
    });

    function stripFromReflection(reflection) {
        const comment = reflection?.comment;
        if (!comment || !Array.isArray(comment.blockTags)) return;

        const sourcePath = comment.sourcePath || reflection.sources?.[0]?.fileName || '';
        if (!CONTROLLER_PATH.test(sourcePath)) return;

        const before = comment.blockTags.length;
        comment.blockTags = comment.blockTags.filter((tag) => {
            if (tag.tag !== '@param') return true;
            if (typeof tag.name !== 'string') return true;
            return !DOTTED_PARAM_NAME.test(tag.name);
        });
        const removed = before - comment.blockTags.length;
        if (removed > 0) {
            app.logger.verbose(`Stripped ${removed} swagger @param tag(s) from ${reflection.name} (${sourcePath})`);
        }
    }
}
