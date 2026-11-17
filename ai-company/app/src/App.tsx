import { useShallow } from "zustand/react/shallow";
import { lazy, Suspense, useEffect } from "react";
import { BottomNav, SideRail, Toasts, TopBar } from "./components/Layout";
import { ChatSheet, CommandSheet, EmployeePanel } from "./components/Overlays";
import { Spinner } from "./components/ui";
import { useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import LoginPage from "./pages/LoginPage";
import OfficePage from "./pages/OfficePage";
import { useStore } from "./store/useStore";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const CeoPage = lazy(() => import("./pages/CeoPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const IntelPage = lazy(() => import("./pages/IntelPage"));
const CreativePage = lazy(() => import("./pages/CreativePage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const MemoryPage = lazy(() => import("./pages/MemoryPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ApiPage = lazy(() => import("./pages/ApiPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function Page({ page, id }: { page: string; id?: string }) {
  switch (page) {
    case "dashboard": return <DashboardPage />;
    case "ceo": return <CeoPage />;
    case "karyawan": return <EmployeesPage id={id} />;
    case "departemen": return <DepartmentsPage />;
    case "tugas": return <TasksPage id={id} />;
    case "intel": return <IntelPage />;
    case "kreatif": return <CreativePage id={id} />;
    case "keuangan": return <FinancePage />;
    case "memori": return <MemoryPage />;
    case "notifikasi": return <NotificationsPage />;
    case "api": return <ApiPage />;
    case "pengaturan": return <SettingsPage />;
    default: return null;
  }
}

export default function App() {
  useTheme();
  const { page, id } = useRoute();
  const { authReady, session, isFounder, loaded, loadError, init, loadAll } = useStore(useShallow((s) => ({ authReady: s.authReady, session: s.session, isFounder: s.isFounder, loaded: s.loaded, loadError: s.loadError, init: s.init, loadAll: s.loadAll })));

  useEffect(() => { init(); }, [init]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  // Muat ulang data saat aplikasi kembali dibuka (realtime bisa terputus saat HP tidur).
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible" && useStore.getState().isFounder) loadAll(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [loadAll]);

  if (!authReady || (session && !loaded)) return <div className="grid min-h-[100dvh] place-items-center"><Spinner label="Membuka kantor…" /></div>;
  if (!session) return <><LoginPage /><Toasts /></>;
  if (isFounder === false) return <LoginPage notFounder />;
  if (loadError) return <div className="grid min-h-[100dvh] place-items-center p-6 text-center text-sm text-bad">Gagal memuat data: {loadError}<button className="mt-3 block w-full font-bold underline" onClick={() => loadAll()}>Coba lagi</button></div>;

  const office = page === "kantor" || !page;
  return (
    <div className="min-h-[100dvh]">
      <SideRail page={office ? "kantor" : page} />
      {office ? (
        <>
          <div className="md:pl-[92px]"><TopBar page="kantor" floating /></div>
          <OfficePage />
        </>
      ) : (
        <div className="md:pl-[92px]">
          <TopBar page={page} />
          <Suspense fallback={<Spinner />}>
            <Page page={page} id={id} />
          </Suspense>
        </div>
      )}
      <BottomNav page={office ? "kantor" : page} />
      <EmployeePanel />
      <ChatSheet />
      <CommandSheet />
      <Toasts />
    </div>
  );
}
