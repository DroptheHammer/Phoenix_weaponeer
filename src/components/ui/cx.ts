export type ClassPart = string | false | null | undefined;

/**
 * Joins class names, skipping the falsy ones. It does NOT resolve conflicts:
 * two utilities for the same property (px-2 and px-4) both stay, and the
 * stylesheet's order decides. So a primitive takes a `className` for layout
 * only (width, margin, flex, position); never to restyle it.
 */
export const cx = (...parts: ClassPart[]): string => parts.filter(Boolean).join(' ');
