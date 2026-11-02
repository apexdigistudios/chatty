import { create } from "zustand";
import type { MascotOutfit } from "../components/auth/MascotCharacter";

export interface AuthGatePayload {
  title: string;
  speech: string;
  outfit?: MascotOutfit;
  returnTo?: string;
  prefillSchoolId?: string | null;
}

interface AuthGateState {
  open: boolean;
  payload: AuthGatePayload;
  openAuthGate: (payload?: Partial<AuthGatePayload>) => void;
  closeAuthGate: () => void;
}

const DEFAULT_PAYLOAD: AuthGatePayload = {
  title: "Join your SHS campus!",
  speech: "Create your secret student pass in 30 seconds to post, like, and reply across Ghana!",
  outfit: "shs_welcome",
};

export const useAuthGateStore = create<AuthGateState>()((set) => ({
  open: false,
  payload: DEFAULT_PAYLOAD,
  openAuthGate: (payload) =>
    set({
      open: true,
      payload: {
        ...DEFAULT_PAYLOAD,
        returnTo:
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/",
        ...payload,
      },
    }),
  closeAuthGate: () => set({ open: false }),
}));
