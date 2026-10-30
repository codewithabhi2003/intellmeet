import VideoTile from './VideoTile';
import { gridColumns } from '../../lib/meetingForm';

const COLS = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };

// tiles: [{ key, stream, name, isSelf, media }]. When someone shares their screen, that tile is pinned large.
export default function VideoGrid({ tiles }) {
  const featured = tiles.find((t) => t.media.screen);
  if (featured) {
    const rest = tiles.filter((t) => t !== featured);
    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:grid-rows-1">
        <VideoTile {...featured} featured />
        <div className="flex min-h-0 gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">{rest.map(({ key, ...t }) => <div key={key} className="w-44 shrink-0 lg:w-full"><VideoTile {...t} className="aspect-video w-full" /></div>)}</div>
      </div>
    );
  }
  return <div className={`grid h-full min-h-0 auto-rows-fr gap-2 sm:gap-3 ${COLS[gridColumns(tiles.length)]}`}>{tiles.map(({ key, ...t }) => <VideoTile key={key} {...t} />)}</div>;
}
