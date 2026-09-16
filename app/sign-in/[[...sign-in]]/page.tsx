import { SignIn } from '@clerk/nextjs'
import { BASE_PATH } from '@/lib/basePath'

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignIn path={`${BASE_PATH}/sign-in`} />
    </main>
  )
}
