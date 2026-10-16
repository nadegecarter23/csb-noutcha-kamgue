import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';

/**
 * Internationalisation.
 *
 * Le français est la langue par défaut et la seule livrée en V1. La structure
 * est en place pour l'anglais, nécessaire dans les régions anglophones du
 * Cameroun (docs/06-CONVENTIONS-DEV.md §1).
 *
 * Règle : aucune chaîne française codée en dur dans un composant.
 */
void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false }, // React échappe déjà
  returnNull: false,
});

export default i18n;
