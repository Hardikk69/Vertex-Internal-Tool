// Brand mark from vertexmediahouse.com (src/components/site/Logo.tsx).
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-label="Vertex Media House" className={className}>
      <path
        d="M12 18C10 18 9 20 10 22L42 50L10 78C9 80 10 82 12 82H34C37 82 39 81 41 79L76 54C79 52 79 48 76 46L41 21C39 19 37 18 34 18H12Z"
        fill="#FF4B33"
      />
    </svg>
  );
}
