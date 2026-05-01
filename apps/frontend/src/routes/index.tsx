import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <main>
      <h1>TanStack Start</h1>
      <p>A minimal starter app.</p>

      <ul>
        <li>
          Edit <code>src/routes/index.tsx</code>.
        </li>
        <li>
          Add routes in <code>src/routes</code>.
        </li>
      </ul>
    </main>
  );
}
