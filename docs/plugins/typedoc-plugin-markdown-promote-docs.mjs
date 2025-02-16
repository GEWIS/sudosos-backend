import { RendererEvent } from 'typedoc';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

const PROMOTE_TAG = '@promote';
const INDEX_TAG = '@index';

// Record promoted pages (name plus optional index).
const toPromote = [];

export function load(app) {
    // Record pages marked with @promote (and optionally @index)
    app.renderer.on(MarkdownPageEvent.BEGIN, (page) => {
        const hasPromoteTag =
            page.model.comment &&
            page.model.comment.blockTags &&
            page.model.comment.blockTags.some((tag) => tag.tag === PROMOTE_TAG);
        if (!hasPromoteTag) return;

        let promoteIndex;
        const indexTag =
            page.model.comment &&
            page.model.comment.blockTags &&
            page.model.comment.blockTags.find((tag) => tag.tag === INDEX_TAG);
        if (indexTag && indexTag.content.length > 0) {
            const parsed = parseInt(indexTag.content[0].text, 10);
            if (!isNaN(parsed)) {
                promoteIndex = parsed;
            }
        }
        app.logger.info(`Promoting ${page.model.name} with index ${promoteIndex}`);
        toPromote.push({ name: page.model.name, index: promoteIndex });

        page.model.comment.blockTags = page.model.comment.blockTags.filter(
            (tag) => tag.tag !== PROMOTE_TAG && tag.tag !== INDEX_TAG
        );
    });

    // After rendering, adjust the sidebar.
    app.renderer.on(RendererEvent.END, () => {
        const outputDir = app.options.getValue('out');
        const sidebarPath = join(outputDir, 'typedoc-sidebar.json');

        if (!existsSync(sidebarPath)) {
            app.logger.error(`Sidebar not found at: ${sidebarPath}`);
            return;
        }

        try {
            const sidebar = JSON.parse(readFileSync(sidebarPath, 'utf-8'));

            // Helper: get promote data by name.
            function getPromoteData(name) {
                return toPromote.find((entry) => entry.name === name);
            }

            /**
             * Recursively traverse the sidebar items and promote matching items one level higher.
             * @param {Array} currentItems - The array of items to process.
             * @param {Array} parentContainer - The container array in which the currentItems reside.
             */
            function recursivelyPromote(currentItems, parentContainer) {
                if (!Array.isArray(currentItems)) return;
                const itemsToPromote = [];
                for (let i = currentItems.length - 1; i >= 0; i--) {
                    const item = currentItems[i];
                    const promoteData = getPromoteData(item.text);
                    if (promoteData) {
                        const removed = currentItems.splice(i, 1)[0];
                        removed.promoteIndex = promoteData.index;
                        itemsToPromote.push(removed);
                    } else if (item.items && Array.isArray(item.items)) {
                        recursivelyPromote(item.items, currentItems);
                    }
                }
                if (itemsToPromote.length > 0 && parentContainer) {
                    // Sort promoted items by promoteIndex (items without an index go last)
                    itemsToPromote.sort((a, b) => {
                        const indexA = a.promoteIndex !== undefined ? a.promoteIndex : Infinity;
                        const indexB = b.promoteIndex !== undefined ? b.promoteIndex : Infinity;
                        return indexA - indexB;
                    });
                    // Insert them into the parent container (i.e. one level higher)
                    parentContainer.unshift(...itemsToPromote);
                }
            }

            if (Array.isArray(sidebar)) {
                // For each top-level section, promote nested items one level higher.
                sidebar.forEach((section) => {
                    if (section.items && Array.isArray(section.items)) {
                        recursivelyPromote(section.items, sidebar);
                    }
                });
            }
            writeFileSync(sidebarPath, JSON.stringify(sidebar, null, 2));
        } catch (error) {
            app.logger.error(`Error modifying sidebar: ${error.message}`);
        }
    });
}
