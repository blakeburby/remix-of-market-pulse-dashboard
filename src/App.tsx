import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MarketsProvider } from "@/contexts/MarketsContext";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import SportsArbitragePage from "./pages/SportsArbitrage";
import TradeCalculatorPage from "./pages/TradeCalculator";
import NotFound from "./pages/NotFound";

// Force rebuild v2

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/sports" element={<SportsArbitragePage />} />
      <Route path="/calculator" element={<TradeCalculatorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <MarketsProvider>
            <AppRoutes />
          </MarketsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
