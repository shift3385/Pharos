import type { MatrixSort } from "./matrix";

/** The result filters of the matrix (EJE-04) and its order. Kept in the URL
 *  by the page, so a filtered matrix can be linked and reloaded. */
export interface MatrixFilters {
  cycleId: string;
  configurationId: string;
  build: string;
  environment: string;
  sort: MatrixSort;
}

export const NO_FILTERS: MatrixFilters = {
  cycleId: "",
  configurationId: "",
  build: "",
  environment: "",
  sort: "risk",
};
