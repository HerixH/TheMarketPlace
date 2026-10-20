"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 760px)";
/** Fraction of the gallery width a drag must cover to change image. */
const SWIPE_DISTANCE = 0.2;
/** A quick flick (px per ms) changes image even when it is short. */
const SWIPE_VELOCITY = 0.4;

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function Gallery({ images, fallback, name }: { images: string[]; fallback: React.ReactNode; name: string }) {
  const [index, setIndex] = useState(0);
  const mobile = useIsMobile();
  const swipeable = mobile && images.length > 1;

  return (
    <div>
      {swipeable ? (
        <SwipeTrack images={images} name={name} index={index} onChange={setIndex} />
      ) : (
        <div className="gallery-main">
          {images.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[index]} alt={name} />
          ) : (
            fallback
          )}
        </div>
      )}
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`thumb ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SwipeTrack({
  images,
  name,
  index,
  onChange,
}: {
  images: string[];
  name: string;
  index: number;
  onChange: (index: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const last = images.length - 1;

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY, t: performance.now(), axis: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    if (!s) return;
    const touch = e.touches[0];
    const dx = touch.clientX - s.x;
    const dy = touch.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.axis === "x") setDragging(true);
    }
    if (s.axis !== "x") return;
    const atEdge = (index === 0 && dx > 0) || (index === last && dx < 0);
    setOffset(atEdge ? dx / 3 : dx);
  }

  function onTouchEnd() {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== "x") return;
    const width = frame.current?.offsetWidth || 1;
    const velocity = Math.abs(offset) / Math.max(1, performance.now() - s.t);
    const far = Math.abs(offset) > width * SWIPE_DISTANCE || velocity > SWIPE_VELOCITY;
    if (far && offset < 0 && index < last) onChange(index + 1);
    else if (far && offset > 0 && index > 0) onChange(index - 1);
    setOffset(0);
    setDragging(false);
  }

  return (
    <div
      ref={frame}
      className="gallery-main gallery-swipe"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${name} photos`}
    >
      <div
        className={dragging ? "gallery-track is-dragging" : "gallery-track"}
        style={{ transform: `translateX(calc(${-index * 100}% + ${offset}px))` }}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={i === index ? name : ""} aria-hidden={i !== index} draggable={false} />
        ))}
      </div>
    </div>
  );
}
