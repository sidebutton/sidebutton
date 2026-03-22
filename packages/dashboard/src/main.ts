import * as Sentry from "@sentry/svelte";
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  sendDefaultPii: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      autoInject: true,
    }),
  ],
});

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
