import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Link, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

import Header from "../components/Header";
import { useSuppressLocalDurableStreamWarning } from "../integrations/durable-streams/suppress-no-https-warning";
import TanStackQueryDevtools from "../integrations/tanstack/query/devtools";

import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Vitask",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Go home</Link>
    </main>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  useSuppressLocalDurableStreamWarning();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          disableTransitionOnChange
          enableColorScheme
          enableSystem
        >
          <Header />
          {children}
          <AppToaster />
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      duration={5000}
      mobileOffset={{ top: 72, left: 16, right: 16 }}
      offset={{ top: 80, right: 24 }}
      position="top-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        classNames: {
          toast: "vitask-sonner-toast",
        },
        unstyled: true,
      }}
      visibleToasts={4}
    />
  );
}
