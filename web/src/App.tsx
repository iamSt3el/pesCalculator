import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api, type SessionUser } from './api.ts';
import { ContractLayout } from './ContractLayout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ContractsPage } from './pages/ContractsPage.tsx';
import { MainDataPage } from './pages/MainDataPage.tsx';
import { RatesChartPage } from './pages/RatesChartPage.tsx';
import { IndexAveragePage } from './pages/IndexAveragePage.tsx';
import { BaseRatePage } from './pages/BaseRatePage.tsx';
import { CalculationPage } from './pages/CalculationPage.tsx';
import { PrintPage } from './pages/PrintPage.tsx';

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  useEffect(refresh, [refresh]);

  const signOut = useCallback(() => {
    void api.logout().finally(() => setUser(null));
  }, []);

  if (!checked) return <main style={{ padding: 24 }} className="hint">Loading…</main>;
  if (!user) return <LoginPage onSignedIn={refresh} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ContractsPage onSignOut={signOut} />} />
        <Route path="/c/:id" element={<ContractLayout onSignOut={signOut} />}>
          <Route index element={<MainDataPage />} />
          <Route path="rates" element={<RatesChartPage />} />
          <Route path="index-average" element={<IndexAveragePage />} />
          <Route path="base-rate" element={<BaseRatePage />} />
          <Route path="calculation" element={<CalculationPage />} />
          <Route path="print" element={<PrintPage />} />
        </Route>
        <Route path="*" element={<main style={{ padding: 24 }}><p>Page not found. <a href="/">Back to contracts</a></p></main>} />
      </Routes>
    </BrowserRouter>
  );
}
