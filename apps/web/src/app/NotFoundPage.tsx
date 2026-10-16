import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="font-mono text-sm text-slate-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{t('errors.notFound.title')}</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600">{t('errors.notFound.message')}</p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {t('errors.notFound.backHome')}
      </Link>
    </div>
  );
}
