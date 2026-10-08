import { useQueries } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import { api, openLiveStream, useAttendance, useCurrentClass, useParams } from "./api";
import { CHART_METRICS } from "./comfort";
import { initialLive, liveReducer } from "./live";
import { toPoints, type Point } from "./series";
import type { ChartMetric } from "./types";

/** One room, live: SSE stream + REST backfill (current session, 1-min series, attendance, config). */
export function useLive(room: string | undefined) {
  const [state, dispatch] = useReducer(liveReducer, room ?? "", initialLive);

  useEffect(() => {
    if (!room) return;
    dispatch({ type: "reset", room });
    return openLiveStream(room, {
      onTelemetry: (data) => dispatch({ type: "telemetry", data }),
      onEvent: (data) => dispatch({ type: "event", data }),
      onConfig: (data) => dispatch({ type: "config", data }),
      onStatus: (data) => dispatch({ type: "status", data }),
      onConnection: (value) => dispatch({ type: "connection", value }),
    });
  }, [room]);

  const current = useCurrentClass(room);
  const params = useParams(room);
  const session = current.data?.session ?? null;
  const series = useQueries({
    queries: CHART_METRICS.map((metric) => ({
      queryKey: ["series", session?.id, metric, 1],
      queryFn: async () => {
        const result = await api.series(session!.id, metric, 1);
        return "data" in result ? result.data : [];
      },
      enabled: !!session?.id,
      staleTime: 5 * 60_000,
    })),
  });
  const attendance = useAttendance(session?.id);

  useEffect(() => {
    if (params.data && params.data.room === room) dispatch({ type: "config", data: params.data.current });
  }, [params.data, room]);

  useEffect(() => {
    if (current.data && current.data.room === room) dispatch({ type: "seed", session });
    // session is derived from current.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.data, room]);

  const seriesData = series.map((s) => s.data);
  const seriesKey = series.map((s) => s.dataUpdatedAt).join(",");
  useEffect(() => {
    if (!session) return;
    const points: Partial<Record<ChartMetric, Point[]>> = {};
    CHART_METRICS.forEach((metric, i) => {
      const data = seriesData[i];
      if (data) points[metric] = toPoints(data);
    });
    dispatch({ type: "seed", session: null, points });
    // seriesKey changes exactly when any series result changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  useEffect(() => {
    if (attendance.data) dispatch({ type: "seed", session: null, attendance: attendance.data.data });
  }, [attendance.data]);

  const loading = current.isPending || (!!session && series.some((s) => s.isPending));
  return { state, loading, current, params };
}
