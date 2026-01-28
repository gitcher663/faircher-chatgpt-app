import { useCallback, useEffect, useState } from "react";
import { useOpenAiGlobal } from "./useOpenAiGlobal";

type WidgetState = Record<string, unknown>;

type SetStateAction<S> = S | ((prevState: S) => S);

type UseWidgetStateHook<T extends WidgetState> = readonly [
  T | null,
  (state: SetStateAction<T | null>) => void
];

export function useWidgetState<T extends WidgetState>(
  defaultState?: T | (() => T | null) | null
): UseWidgetStateHook<T> {
  const widgetStateFromWindow = useOpenAiGlobal("widgetState") as T | null | undefined;

  const [widgetState, setWidgetStateInternal] = useState<T | null>(() => {
    if (widgetStateFromWindow != null) {
      return widgetStateFromWindow;
    }

    return typeof defaultState === "function"
      ? (defaultState as () => T | null)()
      : (defaultState ?? null);
  });

  useEffect(() => {
    if (widgetStateFromWindow !== undefined) {
      setWidgetStateInternal(widgetStateFromWindow ?? null);
    }
  }, [widgetStateFromWindow]);

  const setWidgetState = useCallback(
    (state: SetStateAction<T | null>) => {
      setWidgetStateInternal(prevState => {
        const nextState = typeof state === "function"
          ? (state as (prevState: T | null) => T | null)(prevState)
          : state;

        if (nextState != null) {
          window.openai?.setWidgetState?.(nextState);
        }

        return nextState;
      });
    },
    []
  );

  return [widgetState, setWidgetState] as const;
}
