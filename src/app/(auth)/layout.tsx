import { LanguageSwitch } from "@/components/app/language-switch";

/** Pages without the sidebar: the login page. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-4 lg:min-h-[calc(100vh-3rem)] lg:py-0">
      <div className="flex justify-end">
        <LanguageSwitch className="w-48" />
      </div>
      <main className="flex flex-1 items-center justify-center py-8">{children}</main>
    </div>
  );
}
