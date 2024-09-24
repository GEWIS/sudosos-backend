# Documentation Workflow

This page outlines how we generate our documentation for the SudoSOS Backend. We have a straightforward process that uses a few tools to create a clean, user-friendly documentation site. We rely on a combination of [**TypeDoc**](https://typedoc.org/), [**typedoc-plugin-merge-modules**](https://github.com/krisztianb/typedoc-plugin-merge-modules), [**typedoc-plugin-markdown**](https://www.npmjs.com/package/typedoc-plugin-markdown), and the [**typedoc-vitepress-theme**](https://www.typedoc-plugin-markdown.org/plugins/vitepress) to create our documentation.

## Best Practices

When creating a new file, make sure to add a `@module` JSDoc comment at the top of the file to define the module it belongs to. If you are creating a new entity or module, be sure to add a `@mergeTarget` JSDoc comment at the top of the file to define the main text that is shown. Ideally, this should be done in the entity definition, as this file is relatively small and less frequently used, making it easier to store the documentation.

::: danger
If you create a new file without adding the `@module` JSDoc comment, the TypeDoc generator will drop it in an unpredictable location.
:::

Some modules are intended for internal use and can be moved to the `internal/` namespace.

When creating a pull request (PR), please try to add documentation incrementally, as we will be working to improve the documentation step by step.

## TypeDoc with `typedoc-plugin-merge-modules`

**TypeDoc** allows us to create documentation from our TypeScript code. To keep things organized, we use the `typedoc-plugin-merge-modules`. This plugin combines multiple modules into a single module, which makes it much easier to navigate the documentation.

Since our code has a different structure than what we want for the documentation, we use `typedoc-plugin-merge-modules` to combine and rearrange modules.

The first `@module` in a file determines which module it belongs to. To designate a module as the target text, we use the `@mergeTarget` tag. This defines the text that is displayed when a user clicks on a module.

### `typedoc-vitepress-theme` and `typedoc-plugin-markdown`

We use `typedoc-plugin-markdown` to convert our TypeDoc output into Markdown format. This allows us to integrate it into VitePress, which serves as our documentation site generator. Our VitePress setup is not very complex, and most of the "custom" configuration can be found in the `.vitepress/config.mts` file.
