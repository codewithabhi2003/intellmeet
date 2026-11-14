import VideoTile from './VideoTile';

// How the people on screen are laid out (plain CSS grid; every tile shares the full height):
//   * phone    : 1 person = full screen, 2 = stacked, 3 or more = a 2-column grid (an odd last person gets the whole bottom row)
//   * laptop   : 1 = whole stage, 2 = side by side, 3-4 = 2x2 (3 columns from 5 people)
//   * someone shares the screen : the shared screen is big, everybody else is a strip (right side on large screens, bottom otherwise)

const props = (t) => ({ stream: t.stream, name: t.name, isSelf: t.isSelf, media: t.media, connection: t.connection, quality: t.quality, isHost: t.isHost, avatarUser: t.avatarUser });

const COLS = (n) => (n <= 1 ? 'grid-cols-1'
  : n === 2 ? 'grid-cols-1 sm:grid-cols-2'
    : n === 3 ? 'grid-cols-2 lg:grid-cols-3'
      : n === 4 ? 'grid-cols-2'
        : n <= 6 ? 'grid-cols-2 lg:grid-cols-3'
          : n <= 9 ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4');
// an odd last person takes the full bottom row while the grid has 2 columns
const LAST = (n) => (n < 3 || n % 2 === 0 ? '' : n <= 6 ? 'col-span-2 lg:col-span-1' : 'col-span-2 sm:col-span-1');

export default function VideoGrid({ tiles }) {
  const n = tiles.length;
  const shared = tiles.find((t) => t.media?.screen);
  if (shared) {
    const others = tiles.filter((t) => t !== shared);
    return (
      <div className={`grid h-full w-full min-h-0 gap-2 ${others.length ? 'grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_220px] lg:grid-rows-1' : ''}`}>
        <div className="min-h-0 min-w-0"><VideoTile {...props(shared)} featured /></div>
        {others.length > 0 && (
          <div className="flex min-w-0 gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {others.map((t) => <div key={t.key} className="aspect-video w-44 shrink-0 lg:w-full"><VideoTile {...props(t)} className="h-full w-full min-h-0" /></div>)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`grid h-full w-full min-h-0 auto-rows-fr gap-2 ${COLS(n)}`}>
      {tiles.map((t, i) => (
        <div key={t.key} className={`h-full min-h-0 min-w-0 ${i === n - 1 ? LAST(n) : ''}`}><VideoTile {...props(t)} className="h-full w-full min-h-0" /></div>
      ))}
    </div>
  );
}