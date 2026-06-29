import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { MarketingLayout } from "@/components/layout/MarketingLayout"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { getTokenRole } from "@/lib/api"

/** Redirects already-authenticated users away from guest-only pages (login, signup, etc.) */
function GuestRoute({ children }: { children: React.ReactNode }) {
  if (localStorage.getItem("access_token")) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <>{children}</>
}

/** Ensures the user has ADMIN or SUPER_ADMIN role before rendering admin pages */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const role = getTokenRole()
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}

// Marketing Pages
import HomePage from "@/pages/marketing/HomePage"
import PricingPage from "@/pages/marketing/PricingPage"
import FeaturesPage from "@/pages/marketing/FeaturesPage"
import FAQPage from "@/pages/marketing/FAQPage"
import UseCasesPage from "@/pages/marketing/UseCasesPage"
import APIDocsPage from "@/pages/marketing/APIDocsPage"
import AboutPage from "@/pages/marketing/AboutPage"
import BlogPage from "@/pages/marketing/BlogPage"
import ContactPage from "@/pages/marketing/ContactPage"
import PrivacyPage from "@/pages/marketing/PrivacyPage"
import TermsPage from "@/pages/marketing/TermsPage"
import CookiePolicyPage from "@/pages/marketing/CookiePolicyPage"
import GDPRPage from "@/pages/marketing/GDPRPage"
import ChangelogPage from "@/pages/marketing/ChangelogPage"
import CareersPage from "@/pages/marketing/CareersPage"
import QRScannerPage from "@/pages/marketing/QRScannerPage"
import DynamicQRPage from "@/pages/marketing/DynamicQRPage"

// Auth Pages
import LoginPage from "@/pages/auth/LoginPage"
import SignupPage from "@/pages/auth/SignupPage"
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage"
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage"
import VerifyEmailPage from "@/pages/auth/VerifyEmailPage"
import InviteAcceptPage from "@/pages/auth/InviteAcceptPage"

// Static QR Pages
import StaticGeneratePage from "@/pages/static-qr/StaticGeneratePage"

// Scan / Landing Pages (no layout, public)
import LandingPage from "@/pages/landing/LandingPage"
import PasswordPage from "@/pages/scan/PasswordPage"
import ExpiredPage from "@/pages/scan/ExpiredPage"

// Dashboard Pages
import DashboardPage from "@/pages/dashboard/DashboardPage"
import CreateQRPage from "@/pages/dashboard/CreateQRPage"
import QRAnalyticsPage from "@/pages/dashboard/QRAnalyticsPage"
import QRDetailPage from "@/pages/dashboard/QRDetailPage"
import GlobalAnalyticsPage from "@/pages/dashboard/GlobalAnalyticsPage"
import BulkGeneratePage from "@/pages/dashboard/BulkGeneratePage"
import TeamPage from "@/pages/dashboard/TeamPage"
import APIKeysPage from "@/pages/dashboard/APIKeysPage"
import BillingPage from "@/pages/dashboard/BillingPage"
import SettingsPage from "@/pages/dashboard/SettingsPage"
import UserReportPage from "@/pages/dashboard/UserReportPage"
import SmartRoutingPage from "@/pages/dashboard/SmartRoutingPage"
import ABTestPage from "@/pages/dashboard/ABTestPage"
import QRSettingsPage from "@/pages/dashboard/QRSettingsPage"
import WebhooksPage from "@/pages/dashboard/WebhooksPage"

// Admin Pages
import AdminLoginPage from "@/pages/admin/AdminLoginPage"
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage"
import AdminUsersPage from "@/pages/admin/AdminUsersPage"
import AdminUserDetailPage from "@/pages/admin/AdminUserDetailPage"
import AdminQRCodesPage from "@/pages/admin/AdminQRCodesPage"
import AdminAnalyticsPage from "@/pages/admin/AdminAnalyticsPage"
import AdminRevenuePage from "@/pages/admin/AdminRevenuePage"
import AdminStoragePage from "@/pages/admin/AdminStoragePage"
import AdminAuditPage from "@/pages/admin/AdminAuditPage"
import AdminSubscriptionsPage from "@/pages/admin/AdminSubscriptionsPage"
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage"
import AdminAbusePage from "@/pages/admin/AdminAbusePage"
import AdminEmailPage from "@/pages/admin/AdminEmailPage"
import AdminBroadcastPage from "@/pages/admin/AdminBroadcastPage"
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage"
import AdminChangelogPage from "@/pages/admin/AdminChangelogPage"
import AdminCareersPage from "@/pages/admin/AdminCareersPage"
import AdminSupportPage from "@/pages/admin/AdminSupportPage"

function ScrollToTop() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.pathname])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Auth Pages (no layout) — redirect to dashboard if already logged in */}
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute><ResetPasswordPage /></GuestRoute>} />
        <Route path="/verify-email" element={<GuestRoute><VerifyEmailPage /></GuestRoute>} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        {/* Marketing Layout */}
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/dynamic-qr" element={<DynamicQRPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/use-cases" element={<UseCasesPage />} />
          <Route path="/api-docs" element={<APIDocsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="/gdpr" element={<GDPRPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/scanner" element={<QRScannerPage />} />
          <Route path="/generate" element={<StaticGeneratePage />} />
          <Route path="/generate/url" element={<StaticGeneratePage />} />
          <Route path="/generate/wifi" element={<StaticGeneratePage />} />
          <Route path="/generate/whatsapp" element={<StaticGeneratePage />} />
          <Route path="/generate/instagram" element={<StaticGeneratePage />} />
        </Route>

        {/* Dashboard Layout */}
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="create" element={<CreateQRPage />} />
          <Route path="qr/:id" element={<QRDetailPage />} />
          <Route path="qr/:id/analytics" element={<QRAnalyticsPage />} />
          <Route path="qr/:id/edit" element={<CreateQRPage />} />
          <Route path="qr/:id/smart-routing" element={<SmartRoutingPage />} />
          <Route path="qr/:id/ab-test" element={<ABTestPage />} />
          <Route path="qr/:id/settings" element={<QRSettingsPage />} />
          <Route path="analytics" element={<GlobalAnalyticsPage />} />
          <Route path="bulk-generate" element={<BulkGeneratePage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="api-keys" element={<APIKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="report" element={<UserReportPage />} />
        </Route>

        {/* QR Landing / Scan pages (public, no layout) */}
        <Route path="/l/:slug" element={<LandingPage />} />
        <Route path="/r/:slug/password" element={<PasswordPage />} />
        <Route path="/r/:slug/expired" element={<ExpiredPage />} />

        {/* Admin login (no layout, no auth guard — role is checked after login) */}
        <Route path="/admin/login" element={<AdminLoginPage />} />

        {/* Admin Panel (AdminLayout + AdminRoute guard) */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailPage />} />
          <Route path="qr-codes" element={<AdminQRCodesPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="revenue" element={<AdminRevenuePage />} />
          <Route path="storage" element={<AdminStoragePage />} />
          <Route path="abuse" element={<AdminAbusePage />} />
          <Route path="email" element={<AdminEmailPage />} />
          <Route path="broadcast" element={<AdminBroadcastPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="changelog" element={<AdminChangelogPage />} />
          <Route path="careers" element={<AdminCareersPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="support" element={<AdminSupportPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
