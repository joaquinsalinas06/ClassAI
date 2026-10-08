import { Link } from "react-router";
import { buttonClass } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export function NotFound() {
  return (
    <EmptyState
      illustration="room"
      title="Esta página no existe"
      description="Revisa la dirección o vuelve al resumen de aulas."
      action={<Link to="/" className={buttonClass("secondary", "sm")}>Ir al resumen</Link>}
    />
  );
}
