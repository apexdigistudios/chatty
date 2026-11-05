import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

interface PaystackInitialization {
  access_code: string;
  reference: string;
}

interface PaystackVerifiedTransaction {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  customer: { email: string };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function createVerificationServiceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function authenticateVerificationRequest(request: Request): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const authClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await authClient.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export async function initializePaystackTransaction(input: {
  email: string;
  reference: string;
  title: string;
  userId: string;
}): Promise<PaystackInitialization> {
  const secret = requiredEnv("PAYSTACK_SECRET_KEY");
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: 5000,
      currency: "GHS",
      reference: input.reference,
      metadata: {
        user_id: input.userId,
        verification_title: input.title,
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Paystack could not initialize the verification payment.");

  const result = await response.json() as PaystackApiResponse<PaystackInitialization>;
  if (!result.status || !result.data?.access_code || result.data.reference !== input.reference) {
    throw new Error("Paystack returned an invalid verification checkout.");
  }
  return result.data;
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifiedTransaction> {
  const secret = requiredEnv("PAYSTACK_SECRET_KEY");
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }
  );
  if (!response.ok) throw new Error("Paystack could not verify the transaction.");

  const result = await response.json() as PaystackApiResponse<PaystackVerifiedTransaction>;
  if (!result.status || !result.data) throw new Error("Paystack did not confirm the transaction.");
  return result.data;
}
