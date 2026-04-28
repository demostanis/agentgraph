import "./styles.css";

import { mountApp } from "./app";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

mountApp(app);
