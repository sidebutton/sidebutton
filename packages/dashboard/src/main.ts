import * as Sentry from "@sentry/svelte";
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: true,
});

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
