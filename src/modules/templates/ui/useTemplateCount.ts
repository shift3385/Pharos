import { useEffect, useState } from "react";
import { useAuth } from "@modules/auth";
import { templateApi } from "../api/templateApi";

/** How many templates the signed-in account sees, for the Plantillas tab's
 *  counter. Undefined while unknown or before the built-ins are seeded (the
 *  tab seeds them the first time it opens), so no «0» is ever shown wrongly. */
export function useTemplateCount(): number | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [count, setCount] = useState<number | undefined>();
  useEffect(() => {
    let cancelled = false;
    templateApi.list(userId).then(
      (list) => !cancelled && setCount(list.length || undefined),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return count;
}
