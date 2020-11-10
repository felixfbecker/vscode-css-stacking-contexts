# 💤 VS Code CSS Stacking Contexts [![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/felixfbecker.css-stacking-contexts)](https://marketplace.visualstudio.com/items?itemName=felixfbecker.css-stacking-contexts)

> The problem with z-index is that very few people understand how it really works. It’s not complicated, but it if you’ve never taken the time to read its specification, there are almost certainly crucial aspects that you’re completely unaware of.
>
> **The key to avoid getting tripped up is being able to spot when new stacking contexts are formed**. If you’re setting a z-index of a billion on an element and it’s not moving forward in the stacking order, take a look up its ancestor tree and see if any of its parents form stacking contexts. If they do, your z-index of a billion isn’t going to do you any good.
>
> <footer>
> <cite>— <a href="https://philipwalton.com/articles/what-no-one-told-you-about-z-index/">What No One Told You About Z-Index</a>, Philip Walton, Engineer @ Google</cite>
> </footer>

This extension makes [Stacking Contexts](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context) **visible** in CSS and SCSS, allowing you to write `z-index` declarations using small values _with confidence_.

<picture>
<source srcset="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/screenshot1.png" media="(prefers-color-scheme: dark)" />
<source srcset="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/screenshot1_light.png" media="(prefers-color-scheme: light)" />
<img alt="Screenshot" src="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/screenshot1_light.png" />
</picture>

Additionally, it will tell you when a `z-index` declaration has no effect, and offer automatic quick fixes.

<picture>
<source srcset="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/ineffective-z-index.gif" media="(prefers-color-scheme: dark)" />
<source srcset="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/ineffective-z-index_light.gif" media="(prefers-color-scheme: light)" />
<img alt="Ineffective z-index demo" src="https://raw.githubusercontent.com/felixfbecker/vscode-css-stacking-contexts/main/images/ineffective-z-index_light.gif" />
</picture>
