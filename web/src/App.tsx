import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { api, type SessionUser } from './api.ts';
import { ContractLayout } from './ContractLayout.tsx';
import { EntitlementProvider } from './entitlement.tsx';
import { Spinner } from './components/Spinner.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ContractsPage } from './pages/ContractsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { MainDataPage } from './pages/MainDataPage.tsx';
import { RatesChartPage } from './pages/RatesChartPage.tsx';
import { IndexAveragePage } from './pages/IndexAveragePage.tsx';
import { BaseRatePage } from './pages/BaseRatePage.tsx';
import { CalculationPage } from './pages/CalculationPage.tsx';
import { PrintPage } from './pages/PrintPage.tsx';
import { PlansPage } from './pages/PlansPage.tsx';
import { AppLayout } from './components/AppBar.tsx';
import { SubscribersPage } from './pages/SubscribersPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { ContactPage, PrivacyPage, RefundsPage, TermsPage } from './pages/PolicyPages.tsx';

/** Readable signed in or out: Razorpay's review, and anyone deciding whether to sign up, needs them. */
const POLICY_ROUTES = [
  <Route key="terms" path="/terms" element={<TermsPage />} />,
  <Route key="privacy" path="/privacy" element={<PrivacyPage />} />,
  <Route key="refunds" path="/refunds" element={<RefundsPage />} />,
  <Route key="contact" path="/contact" element={<ContactPage />} />,
];

/** The old two-step checkout address; choosing and paying are one page now. */
function CheckoutRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/plans${search}`} replace />;
}

/**
 * Where signing in from the landing page lands: the plan the visitor chose
 * there, if they chose one, otherwise their contracts.
 */
function SignedInRedirect() {
  const [params] = useSearchParams();
  const plan = params.get('plan');
  return <Navigate to={plan ? `/plans?period=${encodeURIComponent(plan)}` : '/'} replace />;
}

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

  if (!checked) return <Spinner page />;
  // Signed out: the landing page at the root, the policies, and sign-in at
  // every other path — so a deep link to a contract signs in and lands there.
  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          {POLICY_ROUTES}
          <Route path="*" element={<LoginPage onSignedIn={refresh} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <EntitlementProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout user={user} onSignOut={signOut} />}>
            <Route path="/" element={<ContractsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/admin/subscribers" element={<SubscribersPage />} />
          </Route>
          <Route path="/plans/checkout" element={<CheckoutRedirect />} />
          {POLICY_ROUTES}
          {/* Signing in from the landing page arrives here. */}
          <Route path="/signin" element={<SignedInRedirect />} />
          <Route path="/c/:id" element={<ContractLayout onSignOut={signOut} />}>
            <Route index element={<MainDataPage />} />
            <Route path="rates" element={<RatesChartPage />} />
            <Route path="index-average" element={<IndexAveragePage />} />
            <Route path="base-rate" element={<BaseRatePage />} />
            <Route path="calculation" element={<CalculationPage />} />
            <Route path="print" element={<PrintPage />} />
          </Route>
          <Route path="*" element={<main className="page page--narrow"><p>Page not found. <a href="/">Back to contracts</a></p></main>} />
        </Routes>
      </BrowserRouter>
    </EntitlementProvider>
  );
}
