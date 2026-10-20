import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./game.css";
import Game from "./Game";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Game />
  </StrictMode>,
);
