import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { ToastContainer } from "../ui/ToastContainer";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
}
