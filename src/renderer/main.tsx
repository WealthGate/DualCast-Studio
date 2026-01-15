import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Projection from "./Projection";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const isProjection = params.get("projection") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isProjection ? <Projection /> : <App />}
  </React.StrictMode>
);
