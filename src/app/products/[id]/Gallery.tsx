"use client";

import { useState } from "react";

export function Gallery({ images, fallback, name }: { images: string[]; fallback: React.ReactNode; name: string }) {
  const [index, setIndex] = useState(0);
  return (
    <div>
      <div className="gallery-main">
        {images.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[index]} alt={name} />
        ) : (
          fallback
        )}
      </div>
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
