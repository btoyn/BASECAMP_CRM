import { NorthLockup } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8">
        <NorthLockup size={26} />
      </div>
      {children}
    </div>
  );
}
