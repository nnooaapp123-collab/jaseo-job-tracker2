import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PmAuthProvider } from "@/contexts/PmAuthContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Browse from "@/pages/browse";
import ProposalDetail from "@/pages/proposal-detail";
import Login from "@/pages/login";
import Register from "@/pages/register";
import SellerDashboard from "@/pages/seller/dashboard";
import NewProposal from "@/pages/seller/new-proposal";
import EditProposal from "@/pages/seller/edit-proposal";
import SellerEarnings from "@/pages/seller/earnings";
import BuyerPurchases from "@/pages/buyer/purchases";
import BuyerWallet from "@/pages/buyer/wallet";
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminTransactions from "@/pages/admin/transactions";
import AdminProposals from "@/pages/admin/proposals";
import AdminPayouts from "@/pages/admin/payouts";
import AdminSettings from "@/pages/admin/settings";
import AdminSiteIdentity from "@/pages/admin/site-identity";
import StubPayment from "@/pages/payment/stub";
import { useApplySiteIdentity } from "@/hooks/useSiteIdentity";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/proposals/:id" component={ProposalDetail} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/seller/dashboard" component={SellerDashboard} />
      <Route path="/seller/proposals/new" component={NewProposal} />
      <Route path="/seller/proposals/:id/edit" component={EditProposal} />
      <Route path="/seller/earnings" component={SellerEarnings} />
      <Route path="/buyer/purchases" component={BuyerPurchases} />
      <Route path="/buyer/wallet" component={BuyerWallet} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/transactions" component={AdminTransactions} />
      <Route path="/admin/proposals" component={AdminProposals} />
      <Route path="/admin/payouts" component={AdminPayouts} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/site-identity" component={AdminSiteIdentity} />
      <Route path="/payment/stub" component={StubPayment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SiteIdentityApplier() {
  useApplySiteIdentity();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PmAuthProvider>
          <SiteIdentityApplier />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </PmAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
