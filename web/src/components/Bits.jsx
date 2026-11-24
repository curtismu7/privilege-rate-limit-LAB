import Json from "./JsonPane.jsx";
export { Json };

// Keys the panes stand out in this lab's JSON (JsonPane adds its own claim keys).
export const HOT = ["outcome", "reason", "layer", "status", "retryAfterMs", "Retry-After", "allowed", "refused", "error", "message", "unverified"];

// A status with a word and a state, so meaning never rests on colour alone.
export function Chip({ state = "none", children, testId, wrap }) {
  return <span className={`tag${wrap ? " tag--wrap" : ""}`} data-state={state} data-testid={testId}>{children}</span>;
}

export const Card = ({ tone, title, kicker, children, testId, className = "" }) => (
  <section className={`card${tone ? ` card--${tone}` : ""} ${className}`.trim()} data-testid={testId}>
    {kicker && <p className="kicker">{kicker}</p>}
    {title && <h2 className="card__title">{title}</h2>}
    {children}
  </section>
);

export const Loading = () => <p className="muted" role="status">Loading...</p>;
