import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { BASE_PATH } from "@/lib/basePath";
import { Header } from "@/components/header";
import { AssistantLauncher } from "@/components/assistant-launcher";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Agentic Travel',
  description: 'Member-centric rental-car brokerage platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      afterSignOutUrl={BASE_PATH}
      signInUrl={`${BASE_PATH}/sign-in`}
      signUpUrl={`${BASE_PATH}/sign-up`}
    >
      <html lang="en" className={cn("font-sans", geist.variable)}>
        <body>
          <Header />
          {children}
          <AssistantLauncher />
        </body>
      </html>
    </ClerkProvider>
  )
}
