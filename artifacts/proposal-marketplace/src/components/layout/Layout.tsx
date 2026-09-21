import { ReactNode } from "react";
import Navbar from "./Navbar";
import { useSiteIdentity } from "@/hooks/useSiteIdentity";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const identity = useSiteIdentity();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t bg-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-lg font-bold text-primary">{identity.footerBrand}</span>
              {identity.footerText && (
                <p className="text-sm text-muted-foreground mt-1">
                  {identity.footerText}
                </p>
              )}
            </div>
            {identity.footerNote && (
              <p className="text-xs text-muted-foreground whitespace-pre-line text-center md:text-right">
                {identity.footerNote}
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
