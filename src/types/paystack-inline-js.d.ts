declare module "@paystack/inline-js" {
  export interface PaystackTransaction {
    id: number;
    reference: string;
    message: string;
  }

  export interface PaystackPopupError {
    message: string;
  }

  export interface PaystackResumeCallbacks {
    onSuccess?: (transaction: PaystackTransaction) => void;
    onCancel?: () => void;
    onError?: (error: PaystackPopupError) => void;
  }

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: PaystackResumeCallbacks): unknown;
  }
}
