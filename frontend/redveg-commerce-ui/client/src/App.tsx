import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
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
import { trackMetaEvent } from "@/lib/metaPixel";

const HomePage = lazy(() => import("@/pages/storefront/HomePage"));
const ShopPage = lazy(() => import("@/pages/storefront/ShopPage"));
const OffersPage = lazy(() => import("@/pages/storefront/OffersPage"));
const CampaignWhatsAppContinuePage = lazy(
  () => import("@/pages/storefront/CampaignWhatsAppContinuePage")
);
const ProductPage = lazy(() => import("@/pages/storefront/ProductPage"));
const CartPage = lazy(() => import("@/pages/storefront/CartPage"));
const CheckoutPage = lazy(() => import("@/pages/storefront/CheckoutPage"));
const ReturnPolicyPage = lazy(() => import("@/pages/storefront/ReturnPolicyPage"));
const TermsAndConditionsPage = lazy(() => import("@/pages/storefront/TermsAndConditionsPage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/storefront/PrivacyPolicyPage"));
const CustomerProfilePage = lazy(() => import("@/pages/CustomerProfilePage"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminCatalog = lazy(() => import("@/pages/admin/AdminCatalog"));
const AdminOffers = lazy(() => import("@/pages/admin/AdminOffers"));
const AdminCoupons = lazy(() => import("@/pages/admin/AdminCoupons"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminActiveCarts = lazy(() => import("@/pages/admin/AdminActiveCarts"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminModule = lazy(() => import("@/pages/admin/AdminModule"));
const AdminHeaderTheme = lazy(() => import("@/pages/admin/AdminHeaderTheme"));
const AdminCampaignForm = lazy(() => import("@/pages/admin/AdminCampaignForm"));
const AdminDeliveryAreas = lazy(
  () => import("@/pages/admin/AdminDeliveryAreas")
);
const AdminDeliverySlots = lazy(() => import("@/pages/admin/AdminDeliverySlots"));
const AdminCategoryImages = lazy(() => import("@/pages/admin/AdminCategoryImages"));
const AdminCategories = lazy(() => import("@/pages/admin/AdminCategories"));
const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage"));
const AdminResetPasswordPage = lazy(() => import("@/pages/admin/AdminResetPasswordPage"));
const AdminStaff = lazy(() => import("@/pages/admin/AdminStaff"));
const AdminManualOrder = lazy(() => import("@/pages/admin/AdminManualOrder"));

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (!location.startsWith("/admin")) {
      trackMetaEvent("PageView", { page_path: location });
    }
  }, [location]);
  return null;
}

function RouteLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#FFFDF9]">
      <div className="text-center">
        <div className="mx-auto size-9 animate-spin rounded-full border-2 border-[#E9D8D4] border-t-[#B4232C]" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#B4232C]">
          Preparing RedVeg
        </p>
      </div>
    </div>
  );
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
          <Route path="/offers" component={OffersPage} />
          <Route
            path="/campaign/continue"
            component={CampaignWhatsAppContinuePage}
          />
          <Route path="/product/:slug" component={ProductPage} />
          <Route path="/cart" component={CartPage} />
          <Route path="/checkout" component={CheckoutPage} />
          <Route path="/return-policy" component={ReturnPolicyPage} />
          <Route path="/terms" component={TermsAndConditionsPage} />
          <Route path="/privacy-policy" component={PrivacyPolicyPage} />
          <Route path="/login" component={LoginPage} />
          <Route
            path="/profile"
            component={() => (
              <ProtectedRoute redirectTo="/login?returnTo=%2Fprofile">
                <CustomerProfilePage />
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/login" component={AdminLoginPage} />
          <Route path="/admin/reset-password" component={AdminResetPasswordPage} />
          <Route path="/404" component={NotFound} />

          {/* PROTECTED ADMIN ROUTES */}
          <Route
            path="/admin"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="reports.finance">
                <AdminDashboard />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/orders"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="orders.read">
                <AdminOrders />
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/orders/manual" component={() => (
            <ProtectedRoute adminOnly requiredPermission="orders.manual_create">
              <AdminManualOrder />
            </ProtectedRoute>
          )} />
          <Route
            path="/admin/catalog"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="catalog.read">
                <AdminCatalog />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/offers"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="campaigns.manage">
                <AdminOffers />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/coupons"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="coupons.manage">
                <AdminCoupons />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/delivery"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="delivery.manage">
                <AdminDeliveryAreas />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/delivery-slots"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="delivery.manage">
                <AdminDeliverySlots />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/category-images"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="content.manage">
                <AdminCategoryImages />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/categories"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="catalog.manage">
                <AdminCategories />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/customers"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="customers.read">
                <AdminCustomers />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/customer-carts"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="carts.read">
                <AdminActiveCarts />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/settings"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="settings.manage">
                <AdminModule />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/analytics"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="reports.finance">
                <AdminAnalytics />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/header-theme"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="settings.manage">
                <AdminHeaderTheme />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/campaigns/:id"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="campaigns.manage">
                <AdminCampaignForm />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/staff"
            component={() => (
              <ProtectedRoute adminOnly requiredPermission="staff.manage">
                <AdminStaff />
              </ProtectedRoute>
            )}
          />
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
              <AuthProvider>
                <LocationProvider>
                  <CartProvider>
                    <WishlistProvider>
                      <Router />
                      <Toaster richColors position="top-center" />
                    </WishlistProvider>
                  </CartProvider>
                </LocationProvider>
              </AuthProvider>
            </TooltipProvider>
          </CampaignProvider>
        </HeaderThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
