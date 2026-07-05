import { defineConfig } from 'vite';

// El sitio se sirve desde https://sequeradev.github.io/PartyLuz/
// por lo que las rutas de los assets deben colgar de /PartyLuz/.
export default defineConfig({
  base: '/PartyLuz/',
});
