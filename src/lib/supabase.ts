import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 쿠키 기반 세션을 사용해 브라우저와 미들웨어(서버)가 같은 로그인 상태를 공유하도록 합니다.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
