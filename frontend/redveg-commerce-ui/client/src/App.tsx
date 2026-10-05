import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { LocationProvider } from "@/contexts/LocationContext";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { HeaderThemeProvider } from "./contexts/HeaderThemeContext";
import { CampaignProvider } from "@/contexts/CampaignContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const HomePage = lazy(() => import("@/pages/storefront/HomePage"));
const ShopPage = lazy(() => import("@/pages/storefront/ShopPage"));
const ProductPage = lazy(() => import("@/pages/storefront/ProductPage"));
const CartPage = lazy(() => import("@/pages/storefront/CartPage"));
const CheckoutPage = lazy(() => import("@/pages/storefront/CheckoutPage"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminCatalog = lazy(() => import("@/pages/admin/AdminCatalog"));
const AdminOffers = lazy(() => import("@/pages/admin/AdminOffers"));
const AdminCoupons = lazy(() => import("@/pages/admin/AdminCoupons"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminModule = lazy(() => import("@/pages/admin/AdminModule"));
const AdminHeaderTheme = lazy(() => import("@/pages/admin/AdminHeaderTheme"));
const AdminCampaignForm = lazy(() => import("@/pages/admin/AdminCampaignForm"));
const AdminDeliveryAreas = lazy(() => import("@/pages/admin/AdminDeliveryAreas"));
const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function RouteLoader() {
  return <div className="grid min-h-screen place-items-center bg-[#FFFDF9]"><div className="text-center"><div className="mx-auto size-9 animate-spin rounded-full border-2 border-[#E9D8D4] border-t-[#B4232C]" /><p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">Preparing RedVeg</p></div></div>;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteLoader />}>
        <Switch>
          {/* Public routes */}
          <Route path="/" component={HomePage} />
          <Route path="/shop" component={ShopPage} />
          <Route path="/product/:slug" component={ProductPage} />
          <Route path="/cart" component={CartPage} />
          <Route path="/checkout" component={CheckoutPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/admin/login" component={AdminLoginPage} />
          <Route path="/404" component={NotFound} />

          {/* PROTECTED ADMIN ROUTES */}
          <Route path="/admin" component={() => (
            <ProtectedRoute adminOnly>
              <AdminDashboard />
            </ProtectedRoute>
          )} />
          <Route path="/admin/orders" component={() => (
            <ProtectedRoute adminOnly>
              <AdminOrders />
            </ProtectedRoute>
          )} />
          <Route path="/admin/catalog" component={() => (
            <ProtectedRoute adminOnly>
              <AdminCatalog />
            </ProtectedRoute>
          )} />
          <Route path="/admin/offers" component={() => (
            <ProtectedRoute adminOnly>
              <AdminOffers />
            </ProtectedRoute>
          )} />
          <Route path="/admin/coupons" component={() => (
            <ProtectedRoute adminOnly>
              <AdminCoupons />
            </ProtectedRoute>
          )} />
          <Route path="/admin/delivery" component={() => (
            <ProtectedRoute adminOnly>
              <AdminDeliveryAreas />
            </ProtectedRoute>
          )} />
          <Route path="/admin/customers" component={() => (
            <ProtectedRoute adminOnly>
              <AdminCustomers />
            </ProtectedRoute>
          )} />
          <Route path="/admin/settings" component={() => (
            <ProtectedRoute adminOnly>
              <AdminModule />
            </ProtectedRoute>
          )} />
          <Route path="/admin/analytics" component={() => (
            <ProtectedRoute adminOnly>
              <AdminAnalytics />
            </ProtectedRoute>
          )} />
          <Route path="/admin/header-theme" component={() => (
            <ProtectedRoute adminOnly>
              <AdminHeaderTheme />
            </ProtectedRoute>
          )} />
          <Route path="/admin/campaigns/:id" component={() => (
            <ProtectedRoute adminOnly>
              <AdminCampaignForm />
            </ProtectedRoute>
          )} />

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <HeaderThemeProvider>
          <CampaignProvider>
            <TooltipProvider>
              <CartProvider>
                <LocationProvider>
                  {/* WRAP ENTIRE APP WITH AuthProvider */}
                  <AuthProvider>
                    <Router />
                    <Toaster richColors position="top-center" />
                  </AuthProvider>
                </LocationProvider>
              </CartProvider>
            </TooltipProvider>
          </CampaignProvider>
        </HeaderThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
