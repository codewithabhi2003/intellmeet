
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import '../../styles/landing.css';

export default function DemoVideo({
  src,
  poster,
  label,
  width = 1280,
  height = 720,
  autoPlay = true,
  className = '',
  videoClassName = '',
  ...motionProps
}) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && autoPlay) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(video);

    return () => observer.disconnect();
  }, [autoPlay]);

  return (
    <motion.div
      className={`lp-vwrap ${className}`}
      {...motionProps}
    >
      <video
        ref={ref}
        className={`lp-vid ${videoClassName}`}
        src={src}
        poster={poster}
        width={width}
        height={height}
        muted
        loop
        playsInline
        autoPlay={autoPlay}
        preload="auto"
        aria-label={label}
        controls={false}
        disablePictureInPicture
      />
    </motion.div>
  );
}
