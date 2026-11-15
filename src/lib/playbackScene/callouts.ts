/**
 * The letters on the 3D view's discs. Pure: no three.js, no DOM.
 *
 * Each disc is filled with the planner's own colour (the map's and the
 * card's), so its letters are black or white, whichever reads better on that
 * fill. The WCAG luminance is written out here because the card's contrast
 * module sits outside the files this folder may import.
 */

/** WCAG 2.1 relative luminance of a '#rrggbb' colour. */
function luminance(hex: string): number {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** '#000000' or '#ffffff', whichever has the higher WCAG contrast on `hex` (a tie goes to black). */
export function letterInk(hex: string): '#000000' | '#ffffff' {
  const l = luminance(hex);
  const onBlack = (l + 0.05) / 0.05, onWhite = 1.05 / (l + 0.05);
  return onBlack >= onWhite ? '#000000' : '#ffffff';
}
