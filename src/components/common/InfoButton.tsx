interface InfoButtonProps {
  open: boolean;
  onToggle: () => void;
  /** What the hint is about, for screen readers ("About strikes"). */
  label: string;
}

/**
 * A small ⓘ that shows or hides a hint. On a phone there is no hover, so what
 * a desktop keeps in a `title=` tooltip needs a tap instead. The caller owns
 * the open state and draws the hint wherever it fits its layout.
 */
export function InfoButton({ open, onToggle, label }: InfoButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`w-11 h-11 -my-2 shrink-0 flex items-center justify-center text-lg ${open ? 'text-white' : 'text-gray-400'}`}
      aria-label={label}
      aria-expanded={open}
    >
      ⓘ
    </button>
  );
}
