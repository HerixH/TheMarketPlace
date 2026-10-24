"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { isOptimizable } from "@/components/ProductCard";

const MOBILE_QUERY = "(max-width: 760px)";
const MAIN_SIZES = "(max-width: 760px) 100vw, 600px";
/** Fraction of the gallery width a drag must cover to change image. */
const SWIPE_DISTANCE = 0.2;
/** Release speed (px per ms) that changes image even after a short drag. */
const SWIPE_VELOCITY = 0.3;
const SLIDE_MS = 320;
const FLICK_MS = 220;
const ZOOM_MS = 260;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;
const DOUBLE_TAP_ZOOM = 2.5;
const MAX_ZOOM = 4;

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

function Photo({ src, alt, eager, priority }: { src: string; alt: string; eager?: boolean; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={loaded ? "photo is-loaded" : "photo"}>
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes="64px"
        className="photo-backdrop"
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        unoptimized={!isOptimizable(src)}
      />
      <Image
        src={src}
        alt={alt}
        fill
        className="photo-main"
        sizes={MAIN_SIZES}
        quality={90}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
        unoptimized={!isOptimizable(src)}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}

export function Gallery({ images, fallback, name }: { images: string[]; fallback: React.ReactNode; name: string }) {
  const [index, setIndex] = useState(0);
  const mobile = useIsMobile();

  return (
    <div>
      {mobile && images.length > 0 ? (
        <SwipeTrack images={images} name={name} index={index} onChange={setIndex} />
      ) : (
        <div className="gallery-main">
          {images.length ? (
            <div className="gallery-stack">
              {images.map((src, i) => (
                <div key={src} className={i === index ? "gallery-slide is-active" : "gallery-slide"} aria-hidden={i !== index}>
                  <Photo src={src} alt={i === index ? name : ""} eager={i === 0} priority={i === 0} />
                </div>
              ))}
            </div>
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
              <Image src={src} alt="" width={68} height={68} sizes="68px" unoptimized={!isOptimizable(src)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type View = { scale: number; x: number; y: number };

type OneFinger = {
  kind: "pending" | "swipe" | "scroll" | "pan";
  x0: number;
  y0: number;
  t0: number;
  lastX: number;
  lastT: number;
  velocity: number;
  dx: number;
  moved: boolean;
  viewX: number;
  viewY: number;
};

type Gesture = OneFinger | { kind: "pinch"; d0: number; s0: number; qx: number; qy: number };

function placeTrack(track: HTMLElement, index: number, dx: number, ms: number) {
  track.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
  track.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`;
}

function placeZoom(el: HTMLElement, view: View, ms: number) {
  el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
  el.style.transform = view.scale === 1 ? "" : `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
}

/**
 * Mobile gallery: swipe between photos, pinch or double-tap to zoom, drag to pan while zoomed.
 * Gestures write transforms straight to the DOM so dragging never waits on a React render.
 */
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
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const zoomRefs = useRef<(HTMLDivElement | null)[]>([]);
  const indexRef = useRef(index);
  /** Mutated in place: the touch listeners keep a reference to this object. */
  const view = useRef<View>({ scale: 1, x: 0, y: 0 });
  const slideMs = useRef(0);
  const count = images.length;

  useLayoutEffect(() => {
    indexRef.current = index;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (trackRef.current) placeTrack(trackRef.current, index, 0, reduce ? 0 : slideMs.current);
    slideMs.current = SLIDE_MS;
    Object.assign(view.current, { scale: 1, x: 0, y: 0 });
    for (const el of zoomRefs.current) if (el) placeZoom(el, view.current, 0);
    if (frameRef.current) frameRef.current.dataset.zoomed = "false";
  }, [index]);

  useEffect(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    if (!frame || !track) return;
    const last = count - 1;
    const v = view.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = (value: number) => (reduce ? 0 : value);
    let g: Gesture | null = null;
    let lastTap = { t: 0, x: 0, y: 0 };

    function center() {
      const r = frame!.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    }

    function clampView() {
      const { w, h } = center();
      const maxX = ((v.scale - 1) * w) / 2;
      const maxY = ((v.scale - 1) * h) / 2;
      v.x = Math.min(maxX, Math.max(-maxX, v.x));
      v.y = Math.min(maxY, Math.max(-maxY, v.y));
    }

    function applyZoom(duration: number) {
      const el = zoomRefs.current[indexRef.current];
      if (el) placeZoom(el, v, ms(duration));
      frame!.dataset.zoomed = v.scale > 1 ? "true" : "false";
    }

    function resetZoom() {
      v.scale = 1;
      v.x = 0;
      v.y = 0;
      applyZoom(ZOOM_MS);
    }

    /** Zooms to `scale` keeping the photo point under (px, py) in place; coordinates are relative to the centre. */
    function zoomAt(scale: number, px: number, py: number) {
      const qx = (px - v.x) / v.scale;
      const qy = (py - v.y) / v.scale;
      v.scale = scale;
      v.x = px - scale * qx;
      v.y = py - scale * qy;
      clampView();
      applyZoom(ZOOM_MS);
    }

    function pinchStart(touches: TouchList) {
      const [a, b] = [touches[0], touches[1]];
      const { cx, cy } = center();
      const mx = (a.clientX + b.clientX) / 2 - cx;
      const my = (a.clientY + b.clientY) / 2 - cy;
      g = {
        kind: "pinch",
        d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        s0: v.scale,
        qx: (mx - v.x) / v.scale,
        qy: (my - v.y) / v.scale,
      };
    }

    function singleStart(touch: Touch) {
      const now = performance.now();
      g = {
        kind: v.scale > 1 ? "pan" : "pending",
        x0: touch.clientX,
        y0: touch.clientY,
        t0: now,
        lastX: touch.clientX,
        lastT: now,
        velocity: 0,
        dx: 0,
        moved: false,
        viewX: v.x,
        viewY: v.y,
      };
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        if (g?.kind === "swipe") placeTrack(track!, indexRef.current, 0, ms(SLIDE_MS));
        pinchStart(e.touches);
      } else if (e.touches.length === 1) {
        singleStart(e.touches[0]);
      } else {
        g = null;
      }
    }

    function onMove(e: TouchEvent) {
      if (!g) return;
      if (g.kind === "pinch") {
        if (e.touches.length < 2) return;
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const { cx, cy } = center();
        const mx = (a.clientX + b.clientX) / 2 - cx;
        const my = (a.clientY + b.clientY) / 2 - cy;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const scale = Math.min(MAX_ZOOM, Math.max(0.85, (g.s0 * d) / g.d0));
        v.scale = scale;
        v.x = mx - scale * g.qx;
        v.y = my - scale * g.qy;
        if (scale >= 1) clampView();
        applyZoom(0);
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - g.x0;
      const dy = touch.clientY - g.y0;
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) g.moved = true;

      if (g.kind === "pan") {
        e.preventDefault();
        v.x = g.viewX + dx;
        v.y = g.viewY + dy;
        clampView();
        applyZoom(0);
        return;
      }
      if (g.kind === "pending") {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        g.kind = Math.abs(dx) > Math.abs(dy) && last > 0 ? "swipe" : "scroll";
      }
      if (g.kind !== "swipe") return;

      e.preventDefault();
      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) g.velocity = 0.8 * ((touch.clientX - g.lastX) / dt) + 0.2 * g.velocity;
      g.lastX = touch.clientX;
      g.lastT = now;
      g.dx = dx;
      const i = indexRef.current;
      const atEdge = (i === 0 && dx > 0) || (i === last && dx < 0);
      placeTrack(track!, i, atEdge ? dx / 3 : dx, 0);
    }

    function finishSwipe(gesture: OneFinger) {
      const i = indexRef.current;
      // A finger held still before lifting is not a flick.
      const velocity = performance.now() - gesture.lastT > 80 ? 0 : gesture.velocity;
      const flick = Math.abs(velocity) > SWIPE_VELOCITY;
      const far = Math.abs(gesture.dx) > center().w * SWIPE_DISTANCE;
      const direction = flick ? -Math.sign(velocity) : far ? -Math.sign(gesture.dx) : 0;
      const next = Math.min(last, Math.max(0, i + direction));
      if (next !== i) {
        slideMs.current = flick ? FLICK_MS : SLIDE_MS;
        onChange(next);
      } else {
        placeTrack(track!, i, 0, ms(SLIDE_MS));
      }
    }

    function onEnd(e: TouchEvent) {
      if (!g) return;

      if (g.kind === "pinch") {
        if (v.scale < 1.05) resetZoom();
        else {
          clampView();
          applyZoom(ZOOM_MS);
        }
        if (e.touches.length === 1) singleStart(e.touches[0]);
        else g = null;
        return;
      }

      const gesture = g;
      g = null;
      if (gesture.kind === "swipe") {
        finishSwipe(gesture);
        return;
      }

      const now = performance.now();
      const touch = e.changedTouches[0];
      if (gesture.moved || !touch || now - gesture.t0 > 250) return;
      const isDouble =
        now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30;
      if (!isDouble) {
        lastTap = { t: now, x: touch.clientX, y: touch.clientY };
        return;
      }
      lastTap = { t: 0, x: 0, y: 0 };
      e.preventDefault();
      if (v.scale > 1) {
        resetZoom();
      } else {
        const { cx, cy } = center();
        zoomAt(DOUBLE_TAP_ZOOM, touch.clientX - cx, touch.clientY - cy);
      }
    }

    function onCancel() {
      if (g?.kind === "swipe") placeTrack(track!, indexRef.current, 0, ms(SLIDE_MS));
      if (g?.kind === "pinch" && v.scale < 1.05) resetZoom();
      g = null;
    }

    frame.addEventListener("touchstart", onStart, { passive: true });
    frame.addEventListener("touchmove", onMove, { passive: false });
    frame.addEventListener("touchend", onEnd, { passive: false });
    frame.addEventListener("touchcancel", onCancel);
    return () => {
      frame.removeEventListener("touchstart", onStart);
      frame.removeEventListener("touchmove", onMove);
      frame.removeEventListener("touchend", onEnd);
      frame.removeEventListener("touchcancel", onCancel);
    };
  }, [count, onChange]);

  return (
    <div
      ref={frameRef}
      className="gallery-main gallery-swipe"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${name} photos`}
    >
      <div ref={trackRef} className="gallery-track">
        {images.map((src, i) => (
          <div key={src} className="gallery-cell" aria-hidden={i !== index}>
            <div
              ref={(el) => {
                zoomRefs.current[i] = el;
              }}
              className="gallery-zoom"
            >
              <Photo src={src} alt={i === index ? name : ""} eager priority={i === 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
