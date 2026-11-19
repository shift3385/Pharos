// Public API of the library module (CAS-01, ADR-0055): the project's shared
// steps and datasets. The page is the «Biblioteca» section of a project; the
// rest is what the case editor uses to insert a shared step, show its block
// and bind a dataset to the Examples table.
export { LibraryPage } from "./ui/LibraryPage";
export { libraryApi } from "./api/libraryApi";
export { libraryLink } from "./model/types";
export { blockEdited } from "./model/caseRefs";
export { LibraryStepList } from "./ui/case/LibraryStepList";
export { BoundDataset } from "./ui/case/BoundDataset";
export { useCaseLibrary } from "./ui/case/useCaseLibrary";
export type { CaseLibraryState } from "./ui/case/useCaseLibrary";
export type {
  DatasetRef,
  LibraryItem,
  LibraryRefStatus,
  SharedRef,
} from "./model/types";
