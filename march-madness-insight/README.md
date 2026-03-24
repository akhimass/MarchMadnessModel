# March Madness Insight (Vite + React)

## shadcn/ui

Components live in **`src/components/ui/`**. Imports use the `@ui/*` alias (see `vite.config.ts` and `tsconfig`), matching `npx shadcn` defaults via `components.json` (`@/components/ui`).

```tsx
import { Button } from "@ui/button";
```

## Scripts

- `npm run dev` — Vite dev server  
- `npm run build` — production build  
- `npm run lint` — ESLint  
- `npm run check` — TypeScript + ESLint (use before PRs)  

Set `VITE_API_BASE_URL` when the API is not on `http://localhost:8000`.
