# Ejemplos del componente Logo (para pharos-ds)

Sustituyen a los ejemplos actuales del componente (los que generan las tarjetas «OnNavy» y «Sizes»).

### Sizes

```jsx
() => (
  <div style={{ display: "flex", alignItems: "end", gap: "var(--space-5)" }}>
    {[16, 20, 24, 32, 48, 64].map((s) => <Logo key={s} size={s} />)}
  </div>
)
```

### OnNavy

```jsx
() => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4) var(--space-5)", background: "var(--color-navy-900)", color: "var(--color-on-navy)", borderRadius: "var(--radius-md)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-title-sm)" }}>
    <Logo size={35} surface="navy" />
    Pharos
  </div>
)
```

### Lockup (nuevo, opcional)

```jsx
() => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <Logo size={96} />
    <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--color-text-primary)" }}>Pharos</span>
  </div>
)
```

En `Logo.d.ts`:

```ts
interface LogoProps {
  size?: number;
  /** "navy" aclara la torre para fondos navy (sidebar, login). */
  surface?: "light" | "navy";
  title?: string;
}
```
