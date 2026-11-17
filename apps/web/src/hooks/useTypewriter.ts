import { useEffect, useState } from "react";

export function useTypewriter(
  text: string,
  speed = 5,
  active = true,
): { text: string; done: boolean } {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active || !text) {
      setOut("");
      setDone(false);
      return;
    }
    setOut("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return { text: out, done };
}
