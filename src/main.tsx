import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import './pwaUpdate';
import { RecognitionProvider } from './speech/RecognitionProvider';
import { AppStoreProvider } from './store/AppStore';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppStoreProvider>
        <RecognitionProvider>
          <App />
        </RecognitionProvider>
      </AppStoreProvider>
    </I18nProvider>
  </StrictMode>,
);
