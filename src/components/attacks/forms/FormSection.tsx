import type { ReactNode } from 'react';

/** A titled group of Customize knobs, stacked one per row for the editor's narrow control column. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-700 pb-1">{title}</h4>
      {children}
    </section>
  );
}
