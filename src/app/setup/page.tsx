import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">North needs a database</CardTitle>
          <CardDescription>
            The app is deployed but not yet connected to Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>To finish setup:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Create a Supabase project and apply the migrations in <code className="rounded bg-black/5 px-1">supabase/migrations/</code>.</li>
            <li>
              Set <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your
              environment (Vercel project settings or <code className="rounded bg-black/5 px-1">.env.local</code>).
            </li>
            <li>Redeploy or restart, then reload this page.</li>
          </ol>
          <p className="text-muted">
            The full checklist lives in <code className="rounded bg-black/5 px-1">DEPLOYMENT.md</code> at the repo root.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
