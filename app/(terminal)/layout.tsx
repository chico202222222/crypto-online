import { NavigationProvider } from "../components/NavigationContext";
import { MarketTicker } from "../components/MarketTicker";
import { Navbar } from "../components/Navbar";
import { NavigationDrawer } from "../components/NavigationDrawer";
import { QuickSearchModal } from "../components/QuickSearchModal";
import { Footer } from "../components/Footer";

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProvider>
      <MarketTicker />
      <Navbar />
      <NavigationDrawer />
      <QuickSearchModal />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </NavigationProvider>
  );
}
