// Registers @font-face rules for bundled font assets.
//
// How to add a font:
//   1. Drop the TTF/WOFF/WOFF2 file into src/renderer/assets/
//   2. import its URL here, e.g.
//        import interRegular from './assets/Inter-Regular.ttf';
//   3. Append a `@font-face` block to the css string below using that URL.
//   4. Reference the family by name from src/shared/theme.ts (SANS_FONT / MONO_FONT).
//
// Webpack's `asset/resource` rule (see webpack.config.js) turns these imports
// into runtime URL strings pointing at the emitted asset file.

import { injectStyle } from './inject-style';

// Example (uncomment after dropping the file into ./assets):
// import interRegular from './assets/Inter-Regular.ttf';
// import jbmRegular from './assets/JetBrainsMono-Regular.ttf';

const css = `
/* @font-face rules go here. Example:
@font-face {
  font-family: 'Inter';
  src: url('\${interRegular}') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
*/
`;

injectStyle('app-fonts', css);
