import { Link } from "react-router";

/** «+N más · Ver todas»: where the rows that did not fit are. */
export function FitMore({
  count,
  to,
  label,
  testId,
}: {
  count: number;
  to: string;
  label: string;
  testId?: string;
}) {
  if (count <= 0) return null;
  return (
    <Link to={to} className="home-more home-link" data-fit-more data-testid={testId}>
      {label}
    </Link>
  );
}
