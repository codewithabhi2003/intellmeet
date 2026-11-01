export function Skeleton({ width = '100%', height = 16, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}
export function SkeletonText({ lines = 3 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} />)}
    </div>
  );
}
export default Skeleton;
