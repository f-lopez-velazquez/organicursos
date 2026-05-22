import { useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DashboardPage } from "@/features/dashboard/components/DashboardPage";
import { LibraryPage } from "@/features/library/components/LibraryPage";
import { CoursePage } from "@/features/courses/components/CoursePage";
import { LessonPlayerPage } from "@/features/player/components/LessonPlayerPage";
import { SearchPage } from "@/features/search/components/SearchPage";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import { PrivacyPage } from "@/features/privacy/components/PrivacyPage";
import { AboutPage } from "@/features/commercial/components/AboutPage";
import { LegalPage } from "@/features/commercial/components/LegalPage";
import { LicensePage } from "@/features/commercial/components/LicensePage";
import { SupportPage } from "@/features/commercial/components/SupportPage";
import { ShellLayout } from "@/components/layout/ShellLayout";

function RouteScrollReset() {
  const location = useLocation();

  useLayoutEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector<HTMLElement>("[data-route-scroll-root]")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [location.pathname]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <RouteScrollReset />
      <Routes>
        <Route element={<ShellLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/license" element={<LicensePage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/legal" element={<LegalPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
