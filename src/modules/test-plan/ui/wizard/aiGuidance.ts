import type { AssistedField } from "./formState";

/** What the AI must write in each text field of the plan (IA-15), so a draft
 *  covers what that section is for and nothing else. In our own words, after
 *  ISTQB CTFL v4.0.1 §1.1.1, §5.1.1, §5.2, §5.3.2 and §5.5 (ADR-0005: the
 *  syllabus is not reproduced). The tone is set in `buildAssistMessages`. */
export const ASSIST_INSTRUCTION: Record<AssistedField, string> = {
  summary:
    "the Summary section of a software test plan: the context of testing, meaning the test object, the scope and the test basis",
  environmentConfig:
    "the test environment requirements of a software test plan: which environment is used and how it is configured",
  environmentRequirements:
    "the hardware and software a software test plan's test environment needs",
  automationStrategy:
    "the automation part of a software test plan's test approach: what to automate first, at which test levels, with which of the chosen tools, and what stays manual",
  testDataManagement:
    "the test data requirements of a software test plan: which data is needed, where it comes from and how sensitive data is protected",
  defectManagement:
    "the defect management process of a software test plan: the workflow from discovery to closure (log, analyze and classify, decide the response, close), the classification rules, and who takes part",
  communicationPlan:
    "the communication of a software test plan: which forms of communication, how often, for which stakeholders, and which report or template each one uses",
  purpose:
    "the Purpose section of a software test plan: the test objectives it pursues and what the plan is for. Do not describe results, next steps or conclusions",
  conclusion:
    "the Conclusion section of a software test plan. A conclusion is a judgment drawn from what the plan states, not a summary of it: say how testing is evaluated against the test objectives and exit criteria, which risks remain open, and what decision or next step follows. Report results only if the context gives them; otherwise say the evaluation is pending until testing is executed",
};
