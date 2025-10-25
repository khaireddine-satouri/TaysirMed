import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Si vous avez un provider de cache sécurisé (ex: SecureCacheProvider),
 * c’est ici qu’il faut le monter autour de l’app.
 * L’exemple ci-dessous le montre en commentaire. Dé-commentez quand vous aurez ajouté ce provider.
 */
// import { SecureCacheProvider } from './crypto/SecureCacheContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <SecureCacheProvider> */}
      <App />
    {/* </SecureCacheProvider> */}
  </StrictMode>
);
