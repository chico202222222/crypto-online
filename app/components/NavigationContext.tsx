"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Currency = "USD" | "BRL" | "EUR";

interface NavigationContextType {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  selectedCurrency: Currency;
  setSelectedCurrency: (currency: Currency) => void;
  walletConnected: boolean;
  setWalletConnected: (connected: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("USD");
  const [walletConnected, setWalletConnected] = useState(false);

  const toggleDrawer = () => setIsDrawerOpen((prev) => !prev);

  // Keyboard shortcut: Escape closes drawer/search, Cmd+K / Ctrl+K opens search, 'm' toggles menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false);
        setIsSearchOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (
        e.key.toLowerCase() === "m" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName || ""
        ) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        // Toggle menu with 'M' hotkey when not in input
        e.preventDefault();
        setIsDrawerOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        isDrawerOpen,
        setIsDrawerOpen,
        toggleDrawer,
        isSearchOpen,
        setIsSearchOpen,
        selectedCurrency,
        setSelectedCurrency,
        walletConnected,
        setWalletConnected,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
