import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Projection from "./Projection";
import Multiview from "./Multiview";
import "./styles.css";
import { installDevelopmentBridge } from "./devBridge";

installDevelopmentBridge();

const params = new URLSearchParams(window.location.search);
const projectionMode = params.get("projection");
const isProjection = projectionMode === "program" || projectionMode === "lower-third" || projectionMode === "1";
const isMultiview = params.get("multiview") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isMultiview ? (
      <Multiview />
    ) : isProjection ? (
      <Projection mode={projectionMode === "lower-third" ? "lower-third" : "program"} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
