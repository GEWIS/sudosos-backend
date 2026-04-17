import { ReflectionKind } from 'typedoc';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

/**
 * Prettify the H1 and breadcrumb of each module's index page.
 *
 * A module named `catalogue/containers` renders by default as:
 *
 *   [SudoSOS Back-end API](../../index.md) / catalogue/containers
 *
 *   # catalogue/containers
 *
 * This plugin rewrites it to:
 *
 *   [SudoSOS Back-end API](../../index.md) / catalogue / containers
 *
 *   # Catalogue: Containers
 *
 * Only pages whose reflection kind is Module are rewritten, so class,
 * interface, and other pages are untouched.
 */

function capitalizeWord(word) {
  if (!word.length) return word;
  return word[0].toUpperCase() + word.slice(1);
}

// "point-of-sale" -> "Point Of Sale"
function titleCaseSegment(segment) {
  return segment.split('-').map(capitalizeWord).join(' ');
}

// "catalogue/containers" -> "Catalogue: Containers"
function toDisplayTitle(moduleName) {
  return moduleName.split('/').map(titleCaseSegment).join(': ');
}

// "catalogue/containers" -> "catalogue / containers"
function toDisplayBreadcrumb(moduleName) {
  return moduleName.split('/').join(' / ');
}

function escapeRegex(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function load(app) {
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (!page.model || !page.model.kindOf || !page.model.kindOf(ReflectionKind.Module)) return;
    if (typeof page.contents !== 'string') return;

    const name = page.model.name;
    if (!name) return;

    const escapedName = escapeRegex(name);

    // Rewrite breadcrumb: `] / <name>` at end of a line -> `] / <spaced name>`.
    const breadcrumbRegex = new RegExp(`(\\) / )${escapedName}(\\s|$)`, 'm');
    page.contents = page.contents.replace(
      breadcrumbRegex,
      (_, prefix, suffix) => `${prefix}${toDisplayBreadcrumb(name)}${suffix}`,
    );

    // Rewrite H1: `# <name>` on its own line -> `# <pretty title>`.
    const titleRegex = new RegExp(`^# ${escapedName}$`, 'm');
    page.contents = page.contents.replace(titleRegex, `# ${toDisplayTitle(name)}`);
  });
}
