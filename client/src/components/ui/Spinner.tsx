export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
  return (
    <div className={`${cls} border-2 border-current border-t-transparent rounded-full animate-spin`} />
  );
}
