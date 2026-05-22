import { ErrorBoundary } from "@/app/ErrorBoundary";
import { AppProviders } from "@/app/providers/AppProviders";
import { AppRouter } from "@/app/router/AppRouter";
import { AppBootScreen } from "@/components/feedback/AppBootScreen";
import { useAppStore } from "@/store/app-store";

function AppGate() {
  const ready = useAppStore((state) => state.ready);

  if (!ready) {
    return <AppBootScreen />;
  }

  return <AppRouter />;
}

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppGate />
      </AppProviders>
    </ErrorBoundary>
  );
}
