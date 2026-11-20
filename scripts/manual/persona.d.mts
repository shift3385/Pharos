// Types of persona.mjs, for the tours (TypeScript).
export interface Person {
  alias: string;
  first: string;
  last: string;
  email: string;
}
export declare const PERSONA: Person;
export declare const TEAMMATE: Person;
export declare const ADMIN: Person;
export declare const PEOPLE: Person[];
export declare function foreignNames(text: string | null | undefined): string[];
