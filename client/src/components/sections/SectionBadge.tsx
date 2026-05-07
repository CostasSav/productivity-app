import type { Section } from '../../types';

export function SectionBadge({ section }: { section: Section }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: section.color + '20', color: section.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
      {section.name}
    </span>
  );
}
