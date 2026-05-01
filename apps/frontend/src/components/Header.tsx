import { Link } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/form/simple">Simple Form</Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
