import { useEffect, useState } from "react";
export function navigate(path: string) {
  if (window.location.pathname + window.location.search === path) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useRoute() {
  const [route, setRoute] = useState(() => new URL(window.location.href));
  useEffect(() => {
    const change = () => setRoute(new URL(window.location.href));
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  return route;
}
export function setQuery(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  navigate(url.pathname + url.search);
}
