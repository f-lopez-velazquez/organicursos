import { invokeCommand, isTauriRuntime } from "@/lib/api/tauri";

export function openExternal(target: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (isTauriRuntime()) {
    void invokeCommand("open_target", { target }).catch((error) => {
      console.error("No se pudo abrir el destino solicitado.", error);
    });
    return;
  }

  window.open(target, "_blank", "noopener,noreferrer");
}
