"use client";

import { useEffect, useState } from "react";
import PosCustomerMemory from "@/components/PosCustomerMemory";
import PosMobileFlow from "@/components/PosMobileFlow";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/menu/sync-central-park-gazebo", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { success?: boolean; message?: string };
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to update Central Park Gazebo menu.");
      })
      .catch((error) => {
        if (active) setSyncError(error instanceof Error ? error.message : "Unable to update Central Park Gazebo menu.");
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="pos-mobile-shell min-h-screen" data-mobile-billing-open="0">
      {syncError ? (
        <div className="fixed left-1/2 top-3 z-[120] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          Central Park Gazebo menu update: {syncError}
        </div>
      ) : null}
      <PosCustomerMemory />
      <PosMobileFlow />
      {children}
    </div>
  );
}
