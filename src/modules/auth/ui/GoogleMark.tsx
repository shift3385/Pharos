/** Google "G" for the disabled «Continuar con Google» button (SPEC §8, Login).
 *  Lucide ships no brand icons, so this is the one non-Lucide glyph. Google's
 *  sign-in branding guidelines (developers.google.com/identity/branding-guidelines)
 *  ask for the full-color "G" on a live button; while the button is disabled
 *  and marked «Próximamente» it is drawn monochrome with `currentColor`. Switch
 *  to the official asset when Google sign-in ships. */
export function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.08 1.08-2.77 2.26-5.72 2.26-4.57 0-8.14-3.68-8.14-8.25s3.57-8.25 8.14-8.25c2.46 0 4.27.97 5.6 2.22l2.31-2.31C18.75 1.98 16.25.75 12.48.75 6.18.75.98 5.85.98 12.15s5.2 11.4 11.5 11.4c3.4 0 5.97-1.12 7.97-3.2 2.06-2.06 2.7-4.96 2.7-7.3 0-.72-.05-1.39-.16-1.95H12.48z"
      />
    </svg>
  );
}
