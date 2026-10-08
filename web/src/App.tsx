import { createBrowserRouter, Navigate } from "react-router";
import { Shell } from "./app/Shell";
import { Overview } from "./pages/Overview";
import { LiveRoom } from "./pages/LiveRoom";
import { NotFound } from "./pages/NotFound";

const storedRoom = () => {
  try {
    return localStorage.getItem("classai.room") ?? "a101";
  } catch {
    return "a101";
  }
};

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Overview /> },
      { path: "aula", element: <Navigate replace to={`/aula/${storedRoom()}`} /> },
      { path: "aula/:room", element: <LiveRoom /> },
      // Secondary pages load on demand to keep the first paint small.
      { path: "sesiones", lazy: () => import("./pages/Sessions").then((m) => ({ Component: m.Sessions })) },
      { path: "sesiones/:id", lazy: () => import("./pages/SessionDetail").then((m) => ({ Component: m.SessionDetail })) },
      { path: "asistente", lazy: () => import("./pages/Assistant").then((m) => ({ Component: m.Assistant })) },
      { path: "estudiantes", lazy: () => import("./pages/Students").then((m) => ({ Component: m.Students })) },
      { path: "design", lazy: () => import("./pages/DesignSystem").then((m) => ({ Component: m.DesignSystem })) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
