import { Toaster } from "sonner";

import { Dashboard } from "./components/Dashboard.tsx";
import { Landing } from "./components/Landing.tsx";
import { usePath } from "./lib/router.ts";
import { useTheme } from "./lib/theme.ts";

export function App() {
  const path = usePath();
  const [theme] = useTheme();
  return (
    <>
      {path.startsWith("/dashboard") ? <Dashboard /> : <Landing />}
      <Toaster
        duration={5000}
        mobileOffset={{ bottom: 16, left: 16, right: 16 }}
        offset={{ bottom: 24, left: 24 }}
        position="bottom-left"
        theme={theme}
        toastOptions={{ classNames: { toast: "vitask-sonner-toast" }, unstyled: true }}
        visibleToasts={4}
      />
    </>
  );
}
