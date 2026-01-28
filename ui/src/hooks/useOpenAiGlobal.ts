import { useSyncExternalStore } from "react";

type OpenAiGlobals = {
  toolInput?: unknown;
  toolOutput?: unknown;
  toolResponseMetadata?: unknown;
  widgetState?: unknown;
  locale?: string;
};

type SetGlobalsEvent = CustomEvent<{ globals: Partial<OpenAiGlobals> }>;

const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K
): OpenAiGlobals[K] {
  return useSyncExternalStore(
    onChange => {
      const handleSetGlobal = (event: Event) => {
        const detail = (event as SetGlobalsEvent).detail;
        if (!detail?.globals || !(key in detail.globals)) {
          return;
        }

        onChange();
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });

      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai?.[key],
    () => window.openai?.[key]
  );
}

export function useToolInput<T = unknown>() {
  return useOpenAiGlobal("toolInput") as T | undefined;
}

export function useToolOutput<T = unknown>() {
  return useOpenAiGlobal("toolOutput") as T | null | undefined;
}

export function useToolResponseMetadata<T = unknown>() {
  return useOpenAiGlobal("toolResponseMetadata") as T | undefined;
}

export function useOpenAiLocale() {
  return useOpenAiGlobal("locale") as string | undefined;
}
